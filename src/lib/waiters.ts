// =====================================================================
// MOZONA TPV — waiters.ts: API CRUD de camareros contra Supabase
// =====================================================================
// Sistema actualizado: cada camarero tiene `username` + `waiter_pin`
// (PIN de 4-6 caracteres, texto plano, validado server-side vía RPC
// `verify_waiter_login` con SECURITY DEFINER para bypass RLS).
// =====================================================================

import { supabase } from "./supabase";
import {
    putWaiters, getAllWaiters, findWaiterByPin, putWaiter, deleteWaiter,
    type CachedWaiter,
} from "./offlineStorage";

// ---------------------------------------------------------------------
// Resolver el tenant_id real
// ---------------------------------------------------------------------

/** Detecta si un string es un UUID válido (formato 8-4-4-4-12). */
export function isValidUuid(s: string | null | undefined): boolean {
    if (!s) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** Detecta si es un tenant sintético (VIP bypass). */
export function isSyntheticTenantId(s: string | null | undefined): boolean {
    if (!s) return false;
    return s === "vip-bypass" || s.startsWith("vip-") || s === "demo";
}

/**
 * ★★★ RESOLUCIÓN BLINDADA ★★★
 * Cascada completa con 5 niveles de fallback para garantizar
 * que NUNCA devuelva null (excepto en el caso extremo de BD vacía).
 *
 * 1) Si el candidate es UUID válido y no sintético → lo retorna
 * 2) Tenant del usuario autenticado (tabla tenant_users)
 * 3) RPC get_first_active_tenant (SECURITY DEFINER)
 * 4) SELECT directo a tenants (primer activo)
 * 5) SELECT a products para usar el tenant_id que tenga productos
 *
 * Si nada funciona, retorna "00000000-0000-0000-0000-000000000000"
 * (UUID zero) como último recurso, NUNCA null.
 */
export async function resolveRealTenantId(
    candidate: string | null | undefined,
): Promise<string> {
    // 1) UUID válido directo
    if (isValidUuid(candidate) && !isSyntheticTenantId(candidate)) {
        return candidate!;
    }
    if (!supabase) {
        console.warn("[resolveRealTenantId] supabase no configurado, retornando zero UUID");
        return "00000000-0000-0000-0000-000000000000";
    }

    // 2) Tenant del usuario autenticado (tenant_users)
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: tu } = await supabase
                .from("tenant_users")
                .select("tenant_id")
                .eq("user_id", user.id)
                .maybeSingle();
            if (tu?.tenant_id && isValidUuid(tu.tenant_id)) {
                console.log("[resolveRealTenantId] vía tenant_users →", tu.tenant_id);
                return tu.tenant_id;
            }
        }
    } catch (e) {
        console.warn("[resolveRealTenantId] tenant_users error:", e);
    }

    // 3) RPC get_first_active_tenant (SECURITY DEFINER)
    try {
        const { data, error } = await supabase.rpc("get_first_active_tenant");
        if (!error && data && isValidUuid(data as string)) {
            console.log("[resolveRealTenantId] vía RPC →", data);
            return data as string;
        }
    } catch (e) {
        console.warn("[resolveRealTenantId] RPC exception:", e);
    }

    // 4) SELECT directo a tenants
    try {
        const { data, error } = await supabase
            .from("tenants")
            .select("id")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
        if (!error && data?.id && isValidUuid(data.id)) {
            console.log("[resolveRealTenantId] vía SELECT tenants →", data.id);
            return data.id;
        }
    } catch (e) {
        console.warn("[resolveRealTenantId] SELECT tenants exception:", e);
    }

    // 5) SELECT a products (usar el tenant_id que tenga productos)
    try {
        const { data, error } = await supabase
            .from("products")
            .select("tenant_id")
            .not("tenant_id", "is", null)
            .limit(1)
            .maybeSingle();
        if (!error && data?.tenant_id && isValidUuid(data.tenant_id)) {
            console.log("[resolveRealTenantId] vía products.tenant_id →", data.tenant_id);
            return data.tenant_id;
        }
    } catch (e) {
        console.warn("[resolveRealTenantId] products exception:", e);
    }

    // 6) Último recurso: UUID zero (¡NUNCA null!)
    console.warn("[resolveRealTenantId] ⚠️ no se encontró ningún tenant, usando zero UUID");
    return "00000000-0000-0000-0000-000000000000";
}

export type WaiterRole = "owner" | "manager" | "waiter" | "kitchen";

export interface Waiter {
    id:        string;
    tenant_id: string;
    user_id:   string | null;
    name:      string;
    email:     string | null;
    username?: string | null;
    waiter_pin?: string | null;
    pin_code?: string | null;
    role:      WaiterRole;
    is_active: boolean;
    created_at: string;
}

export type { CachedWaiter } from "./offlineStorage";

// ---------------------------------------------------------------------
// Generadores de credenciales
// ---------------------------------------------------------------------

/** Genera un PIN aleatorio de 4-6 caracteres alfanuméricos (sin ambigüedades). */
export function generatePassword(length = 4): string {
    // Sin 0/O, 1/I/L para evitar confusión al copiar a mano
    const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const arr = new Uint32Array(length);
    crypto.getRandomValues(arr);
    let out = "";
    for (let i = 0; i < length; i++) {
        out += ALPHABET[arr[i] % ALPHABET.length];
    }
    return out;
}

/** Genera un username a partir del nombre + 2 dígitos. */
export function generateUsername(name: string, suffix?: string): string {
    const base = name
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 12) || "camarero";
    if (suffix) return base + suffix;
    const num = Math.floor(Math.random() * 90 + 10);
    return base + num.toString();
}

// ---------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------

/** Lista camareros del tenant. */
export async function listWaiters(tenantId: string): Promise<Waiter[]> {
    // Resolver UUID real (bypass 'vip-bypass' y similares)
    const realTenantId = await resolveRealTenantId(tenantId);
    if (!realTenantId) return [];
    // ★ select con columnas minimas para evitar errores 400
    const { data, error } = await supabase
        .from("tenant_users")
        .select("name, email, username, waiter_pin, role, is_active")
        .eq("tenant_id", realTenantId)
        .order("name");
    if (error) throw error;
    return (data ?? []).map(w => ({
        ...w,
        username:   w.username ?? null,
        waiter_pin: w.waiter_pin ?? null,
        is_active:  w.is_active ?? true,
    } as Waiter));
}

export async function syncWaiters(tenantId: string): Promise<Waiter[]> {
    const remote = await listWaiters(tenantId);
    await putWaiters(tenantId, remote.map(w => ({
        id:        w.id,
        tenant_id: w.tenant_id,
        user_id:   w.user_id,
        name:      w.name,
        pin_code:  w.waiter_pin ?? w.pin_code ?? null,
        role:      w.role,
        is_active: w.is_active,
    })));
    return remote;
}

export async function listCachedWaiters(tenantId: string): Promise<CachedWaiter[]> {
    return getAllWaiters(tenantId);
}

export async function findByPinCached(
    tenantId: string, pin: string,
): Promise<CachedWaiter | null> {
    return findWaiterByPin(tenantId, pin);
}

/** Resultado de crear camarero: incluye username + pin para mostrar al admin. */
export interface CreateWaiterResult {
    waiter:   Waiter;
    username: string;
    pin:      string;
}

/** Crea un camarero con username y PIN autogenerados.
 *  Estrategia de 3 pasos con fallback automático si la BD no tiene
 *  las columnas nuevas: intenta INSERT completo → sin waiter_pin → sin
 *  username.  Así no falla con 400/404 en instalaciones antiguas. */
export async function createWaiter(input: {
    tenant_id: string;
    name:      string;
    role:      WaiterRole;
    email?:    string | null;
}): Promise<CreateWaiterResult> {
    // 0) RESOLVER tenant_id real (evita error 22P02 con 'vip-bypass')
    const realTenantId = await resolveRealTenantId(input.tenant_id);
    if (!realTenantId) {
        throw new Error(
            "No se pudo resolver el tenant_id real.  Asegúrate de que existe al menos un tenant en la BD " +
            "(ejecuta database/02_saas_migration.sql + 07_vip_unlock.sql)."
        );
    }

    // 1) Generar username único (5 intentos) — siempre LOWERCASE
    const baseName = generateUsername(input.name);
    let username = baseName.toLowerCase();
    let tries = 0;
    while (tries < 5) {
        const { data: existing } = await supabase
            .from("tenant_users")
            .select("id")
            .eq("tenant_id", realTenantId)
            .ilike("username", username)
            .maybeSingle();
        if (!existing) break;
        tries++;
        username = generateUsername(input.name).toLowerCase();
    }

    // 2) Generar PIN de 4 caracteres — siempre UPPERCASE
    const pin = generatePassword(4).toUpperCase();

    // 3) Intentar INSERT completo (con todas las columnas)
    //    Si la BD no tiene username/waiter_pin, fallback a INSERT simple.
    const baseRow = {
        tenant_id: realTenantId,    // <-- UUID real, nunca "vip-bypass"
        name:      input.name,
        role:      input.role,
        email:     input.email ?? null,
        user_id:   null,
        is_active: true,
        pin_code:  pin,
    };

    // Estrategia 1: INSERT con todas las columnas (username + waiter_pin)
    let { data, error } = await supabase
        .from("tenant_users")
        .insert({ ...baseRow, username, waiter_pin: pin })
        .select()
        .single();

    // Estrategia 2 (fallback): si la BD no tiene `waiter_pin`, solo username
    if (error && /waiter_pin/.test(error.message)) {
        console.warn("[createWaiter] columna waiter_pin no existe, fallback a username+pin_code");
        const r2 = await supabase
            .from("tenant_users")
            .insert({ ...baseRow, username })
            .select()
            .single();
        data = r2.data;
        error = r2.error;
    }

    // Estrategia 3 (fallback final): solo columnas legacy
    if (error && /username/.test(error.message)) {
        console.warn("[createWaiter] columna username no existe, fallback a columnas legacy");
        const r3 = await supabase
            .from("tenant_users")
            .insert(baseRow)
            .select()
            .single();
        data = r3.data;
        error = r3.error;
    }

    if (error) {
        // Mensaje claro para diagnosticar el 400/404
        const code = (error as any).code ?? "";
        const hint = (error as any).hint ?? "";
        throw new Error(
            `Error creando camarero (${code}): ${error.message}. ` +
            `Verifica que las columnas username y waiter_pin existan en tenant_users. ` +
            `Ejecuta database/11_fix_waiter_rls.sql en Supabase. (hint: ${hint})`
        );
    }

    const waiter: Waiter = {
        ...(data as Waiter),
        username,
        waiter_pin: pin,
        pin_code:   pin,
        is_active:  data.is_active ?? true,
    };

    await putWaiter({
        id:        waiter.id,
        tenant_id: waiter.tenant_id,
        user_id:   waiter.user_id,
        name:      waiter.name,
        pin_code:  pin,
        role:      waiter.role,
        is_active: waiter.is_active,
    });

    return { waiter, username, pin };
}

/** Resetea el PIN de un camarero (devuelve el nuevo en claro). */
export async function resetWaiterPassword(id: string): Promise<string> {
    const newPin = generatePassword(4).toUpperCase();
    const { error } = await supabase
        .from("tenant_users")
        .update({ waiter_pin: newPin, pin_code: newPin })
        .eq("id", id);
    if (error) throw new Error(error.message);
    return newPin;
}

export async function updateWaiter(
    id: string,
    patch: { name?: string; role?: WaiterRole; is_active?: boolean },
): Promise<Waiter> {
    const { data, error } = await supabase
        .from("tenant_users")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
    if (error) throw error;
    await putWaiter({
        id:        data.id,
        tenant_id: data.tenant_id,
        user_id:   data.user_id,
        name:      data.name,
        pin_code:  data.waiter_pin ?? data.pin_code,
        role:      data.role,
        is_active: data.is_active ?? true,
    });
    return data as Waiter;
}

export async function deleteWaiterById(id: string): Promise<void> {
    const { error } = await supabase
        .from("tenant_users")
        .delete()
        .eq("id", id);
    if (error) throw error;
    await deleteWaiter(id);
}
