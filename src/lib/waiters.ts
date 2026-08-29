// =====================================================================
// MOZONA TPV — waiters.ts: API CRUD de camareros contra Supabase
// =====================================================================
// Sistema actualizado: cada camarero tiene username + password (sin
// email obligatorio).  El sistema genera automáticamente:
//   - username: a partir del nombre + 2 dígitos
//   - password: 6 caracteres alfanuméricos aleatorios
// La contraseña se guarda hasheada con bcrypt en la BD vía la RPC
// `set_waiter_credentials`.
// =====================================================================

import { supabase } from "./supabase";
import {
    putWaiters, getAllWaiters, findWaiterByPin, putWaiter, deleteWaiter,
    type CachedWaiter,
} from "./offlineStorage";

export type WaiterRole = "owner" | "manager" | "waiter" | "kitchen";

export interface Waiter {
    id:        string;
    tenant_id: string;
    user_id:   string | null;
    name:      string;
    email:     string | null;
    username?: string | null;
    pin_code:  string | null;
    role:      WaiterRole;
    is_active: boolean;
    created_at: string;
}

export type { CachedWaiter } from "./offlineStorage";

// ---------------------------------------------------------------------
// Generadores de credenciales
// ---------------------------------------------------------------------

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I/L

/** Genera una contraseña aleatoria de 6 caracteres. */
export function generatePassword(length = 6): string {
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

/** Genera un PIN de 4 dígitos (compatibilidad legacy). */
export function generatePin(): string {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return String(arr[0] % 10000).padStart(4, "0");
}

// ---------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------

/** Lista camareros del tenant. */
export async function listWaiters(tenantId: string): Promise<Waiter[]> {
    const { data, error } = await supabase
        .from("tenant_users")
        .select("id, tenant_id, user_id, name, email, username, pin_code, role, is_active, created_at")
        .eq("tenant_id", tenantId)
        .order("name");
    if (error) throw error;
    return (data ?? []).map(w => ({
        ...w,
        username: w.username ?? null,
        pin_code: w.pin_code ?? null,
        is_active: w.is_active ?? true,
    } as Waiter));
}

export async function syncWaiters(tenantId: string): Promise<Waiter[]> {
    const remote = await listWaiters(tenantId);
    await putWaiters(tenantId, remote.map(w => ({
        id:        w.id,
        tenant_id: w.tenant_id,
        user_id:   w.user_id,
        name:      w.name,
        pin_code:  w.pin_code,
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

/** Resultado de crear camarero: incluye las credenciales para mostrar al admin. */
export interface CreateWaiterResult {
    waiter:   Waiter;
    username: string;
    password: string;
}

/** Crea un camarero con username y password autogenerados. */
export async function createWaiter(input: {
    tenant_id: string;
    name:      string;
    role:      WaiterRole;
    email?:    string | null;
}): Promise<CreateWaiterResult> {
    // 1) Generar username único (3 intentos)
    let username = generateUsername(input.name);
    let tries = 0;
    while (tries < 5) {
        const { data: existing } = await supabase
            .from("tenant_users")
            .select("id")
            .eq("tenant_id", input.tenant_id)
            .ilike("username", username)
            .maybeSingle();
        if (!existing) break;
        tries++;
        username = generateUsername(input.name);
    }

    // 2) Generar password
    const password = generatePassword(6);

    // 3) Crear fila base
    const { data, error } = await supabase
        .from("tenant_users")
        .insert({
            tenant_id: input.tenant_id,
            name:      input.name,
            role:      input.role,
            email:     input.email ?? null,
            user_id:   null,
            is_active: true,
            pin_code:  generatePin(),
        })
        .select()
        .single();
    if (error) throw error;

    // 4) Llamar a la RPC para hashear password y guardar username
    const { error: rpcErr } = await supabase.rpc("set_waiter_credentials", {
        p_tenant_user_id: data.id,
        p_username:       username,
        p_password:       password,
    });
    if (rpcErr) {
        // Rollback: borrar la fila si falla
        await supabase.from("tenant_users").delete().eq("id", data.id);
        throw new Error(`Error creando credenciales: ${rpcErr.message}`);
    }

    const waiter: Waiter = {
        ...(data as Waiter),
        username,
        pin_code: data.pin_code ?? null,
        is_active: data.is_active ?? true,
    };

    await putWaiter({
        id:        waiter.id,
        tenant_id: waiter.tenant_id,
        user_id:   waiter.user_id,
        name:      waiter.name,
        pin_code:  waiter.pin_code,
        role:      waiter.role,
        is_active: waiter.is_active,
    });

    return { waiter, username, password };
}

/** Resetea la contraseña de un camarero (devuelve la nueva en claro). */
export async function resetWaiterPassword(id: string): Promise<string> {
    const newPassword = generatePassword(6);
    const { data: w } = await supabase
        .from("tenant_users")
        .select("username, tenant_id")
        .eq("id", id)
        .single();
    if (!w) throw new Error("Camarero no encontrado");
    if (!w.username) throw new Error("El camarero no tiene username");

    const { error } = await supabase.rpc("set_waiter_credentials", {
        p_tenant_user_id: id,
        p_username:       w.username,
        p_password:       newPassword,
    });
    if (error) throw new Error(error.message);
    return newPassword;
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
        pin_code:  data.pin_code,
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
