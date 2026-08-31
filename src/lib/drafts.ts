// =====================================================================
// MOZONA TPV — drafts: persistencia de comandas abiertas por mesa
// =====================================================================
// Una fila por mesa en `open_orders`. Se actualiza en cada
// addProduct/removeItem/increment. Se borra al cobrar o vaciar.

import { supabase } from "./supabase";
import { resolveRealTenantId } from "./waiters";
import type { OrderItem } from "./types";

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

export interface OpenOrder {
    id:            string;
    tenant_id:     string;
    table_id:      string;            // "local-table-3" o UUID
    table_number:  string;
    waiter_name:   string | null;
    items:         OrderItem[];
    notes:         string | null;
    status:        "open" | "locked";
    created_at:    string;
    updated_at:    string;
}

// ---------------------------------------------------------------------
// Cargar todos los borradores del tenant (para restaurar al F5)
// ---------------------------------------------------------------------

export async function listOpenDrafts(tenantId: string | null): Promise<OpenOrder[]> {
    const realId = await resolveRealTenantId(tenantId);
    if (!realId || !supabase) return [];
    const { data, error } = await supabase
        .from("open_orders")
        .select("*")
        .eq("tenant_id", realId)
        .eq("status", "open")
        .order("updated_at", { ascending: false });
    if (error) {
        console.warn("[drafts] list error:", error.message);
        return [];
    }
    return (data ?? []) as OpenOrder[];
}

// ---------------------------------------------------------------------
// Cargar borrador de una mesa concreta (por table_number)
// ---------------------------------------------------------------------

export async function getOpenDraft(
    tenantId:     string | null,
    tableNumber:  string | number,
): Promise<OpenOrder | null> {
    const realId = await resolveRealTenantId(tenantId);
    if (!realId || !supabase) return null;
    const { data, error } = await supabase
        .from("open_orders")
        .select("*")
        .eq("tenant_id", realId)
        .eq("table_number", String(tableNumber))
        .maybeSingle();
    if (error) {
        console.warn("[drafts] get error:", error.message);
        return null;
    }
    return (data ?? null) as OpenOrder | null;
}

// ---------------------------------------------------------------------
// Guardar / actualizar borrador de una mesa
// ---------------------------------------------------------------------

export async function upsertDraft(input: {
    tenantId:     string | null;
    tableId:      string;
    tableNumber:  string;
    waiterName:   string | null;
    items:        OrderItem[];
}): Promise<OpenOrder | null> {
    const realId = await resolveRealTenantId(input.tenantId);
    if (!realId || !supabase) return null;
    if (input.items.length === 0) {
        // Si no hay items, mejor borrar
        await clearDraft(input.tenantId, input.tableId);
        return null;
    }
    const row = {
        tenant_id:    realId,
        table_id:     input.tableId,
        table_number: input.tableNumber,
        waiter_name:  input.waiterName,
        items:        input.items as any,
    };
    const { data, error } = await supabase
        .from("open_orders")
        .upsert(row, { onConflict: "tenant_id,table_number" })
        .select()
        .single();
    if (error) {
        // Si la tabla no existe aún (no se ejecutó el SQL), no romper
        if (/open_orders/.test(error.message) && /not.*exist|schema cache/i.test(error.message)) {
            console.warn("[drafts] open_orders no existe.  Ejecuta database/12_open_orders.sql");
            return null;
        }
        console.warn("[drafts] upsert error:", error.message);
        return null;
    }
    return data as OpenOrder;
}

// ---------------------------------------------------------------------
// Borrar borrador de una mesa (al cobrar o vaciar)
// ---------------------------------------------------------------------

export async function clearDraft(
    tenantId: string | null,
    tableNumber: string | number,
): Promise<void> {
    const realId = await resolveRealTenantId(tenantId);
    if (!realId || !supabase) return;
    const { error } = await supabase
        .from("open_orders")
        .delete()
        .eq("tenant_id", realId)
        .eq("table_number", String(tableNumber));
    if (error) {
        if (!/open_orders/.test(error.message) || !/not.*exist|schema cache/i.test(error.message)) {
            console.warn("[drafts] clear error:", error.message);
        }
    }
}
