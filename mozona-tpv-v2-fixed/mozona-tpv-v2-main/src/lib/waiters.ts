// =====================================================================
// MOZONA TPV — waiters.ts: API CRUD de camareros contra Supabase
// =====================================================================
// Todas las funciones usan el cliente de Supabase del usuario actual.
// El RLS del backend se encarga de validar que solo el dueño del
// tenant pueda listar / crear / editar / borrar.
//
// CACHÉ LOCAL:
//   - listCached(tenantId) lee de IndexedDB (instantáneo, offline)
//   - sync(tenantId) descarga de Supabase y actualiza la caché
//   - findByPinCached(tenantId, pin) valida PIN sin red
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
    pin_code:  string;
    role:      WaiterRole;
    is_active: boolean;
    created_at: string;
}

// Re-export CachedWaiter por conveniencia
export type { CachedWaiter } from "./offlineStorage";

/** Descarga todos los camareros del tenant desde Supabase. */
export async function listWaiters(tenantId: string): Promise<Waiter[]> {
    const { data, error } = await supabase
        .from("tenant_users")
        .select("id, tenant_id, user_id, name, email, pin_code, role, is_active, created_at")
        .eq("tenant_id", tenantId)
        .order("name");
    if (error) throw error;
    // Fallback: si la columna is_active no existe (instalaciones viejas)
    return (data ?? []).map(w => ({ ...w, is_active: w.is_active ?? true } as Waiter));
}

/** Sincroniza Supabase → IndexedDB. Devuelve la lista sincronizada. */
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

/** Lee de caché IndexedDB (instantáneo). */
export async function listCachedWaiters(tenantId: string): Promise<CachedWaiter[]> {
    return getAllWaiters(tenantId);
}

/** Valida PIN contra la caché. */
export async function findByPinCached(
    tenantId: string, pin: string,
): Promise<CachedWaiter | null> {
    return findWaiterByPin(tenantId, pin);
}

/** Crea un camarero. */
export async function createWaiter(input: {
    tenant_id: string;
    name:      string;
    pin_code:  string;
    role:      WaiterRole;
    email?:    string | null;
}): Promise<Waiter> {
    // Validación de PIN: 4 dígitos exactos
    if (!/^\d{4}$/.test(input.pin_code)) {
        throw new Error("El PIN debe tener exactamente 4 dígitos");
    }
    const { data, error } = await supabase
        .from("tenant_users")
        .insert({
            tenant_id: input.tenant_id,
            name:      input.name,
            pin_code:  input.pin_code,
            role:      input.role,
            email:     input.email ?? null,
            user_id:   null,
            is_active: true,
        })
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

/** Edita nombre, PIN o rol. */
export async function updateWaiter(
    id: string,
    patch: { name?: string; pin_code?: string; role?: WaiterRole; is_active?: boolean },
): Promise<Waiter> {
    if (patch.pin_code !== undefined && !/^\d{4}$/.test(patch.pin_code)) {
        throw new Error("El PIN debe tener exactamente 4 dígitos");
    }
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

/** Borra un camarero. */
export async function deleteWaiterById(id: string): Promise<void> {
    const { error } = await supabase
        .from("tenant_users")
        .delete()
        .eq("id", id);
    if (error) throw error;
    await deleteWaiter(id);
}
