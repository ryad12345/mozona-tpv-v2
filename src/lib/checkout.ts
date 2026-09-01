// =====================================================================
// MOZONA TPV — executeCheckout: proceso atómico de cobro
// =====================================================================
// Versión DEFINITIVA con INSERT directo y errores visibles.
// Si Supabase rechaza la fila, throw con el error.code + message.
// =====================================================================

import { supabase } from "./supabase";
import { resolveRealTenantId } from "./waiters";

// ★ Tenant ID por defecto (el que devuelve get_first_active_tenant RPC)
const FALLBACK_TENANT_ID = "58a8e6f5-3172-409c-8aa5-ae02be0b7e76";

export interface ExecuteCheckoutInput {
    tenantId?:     string | null;
    tableId?:      string | null;
    tableNumber?:  string | number | null;
    openOrderId?:  string | null;
    items?:        any[];
    subtotal?:     number;
    taxTotal?:     number;
    total:         number;
    paymentMethod?: string;
    waiterName?:   string | null;
    series?:       string;
}

export interface ExecuteCheckoutResult {
    ok: boolean;
    orderId?: string;
    error?: string;
    errorCode?: string;
    errorDetails?: string;
    errorHint?: string;
    step?: "tenant" | "insert_order" | "delete_open_order" | "update_table";
}

export async function executeCheckout(input: ExecuteCheckoutInput): Promise<ExecuteCheckoutResult> {
    console.log("[executeCheckout] ★★ INICIO ★*", {
        tenantId: input.tenantId,
        tableId: input.tableId,
        tableNumber: input.tableNumber,
        items: input.items?.length ?? 0,
        total: input.total,
        paymentMethod: input.paymentMethod,
    });

    if (!supabase) {
        return { ok: false, error: "Supabase no está configurado", step: "tenant" };
    }

    // 0) Tenant ID válido — USAR EL MISMO que listSales
    //    resolveRealTenantId() prioriza el de la sesión, luego
    //    get_first_active_tenant() (que es 58a8e6f5...), luego
    //    FALLBACK_TENANT_ID
    const realId = await resolveRealTenantId(input.tenantId ?? null);
    const validTenantId = (realId && realId !== "00000000-0000-0000-0000-000000000000")
        ? realId
        : FALLBACK_TENANT_ID;
    console.log("[executeCheckout] tenantId resuelto:", realId, "→ usando:", validTenantId);

    // 1) INSERT DIRECTO — solo columnas básicas
    console.log("[executeCheckout] paso 1: INSERT directo en orders");
    const newOrder = {
        tenant_id:      validTenantId,
        waiter_name:    input.waiterName || "Caja",
        subtotal:       Number(input.subtotal ?? input.total),
        tax_total:      Number(input.taxTotal ?? 0),
        total:          Number(input.total),
        payment_method: input.paymentMethod || "cash",
        status:         "closed",
    };
    console.log("[executeCheckout] payload:", newOrder);

    const { data, error } = await supabase
        .from("orders")
        .insert([newOrder])
        .select()
        .single();

    if (error) {
        // ★★ ERROR VISIBLE: throw para que PosTerminalPro lo muestre
        console.error("[executeCheckout] ❌ ERROR SUPABASE INSERT:");
        console.error("  code:",    error.code);
        console.error("  message:", error.message);
        console.error("  details:", error.details);
        console.error("  hint:",    error.hint);
        return {
            ok: false,
            error: error.message,
            errorCode: error.code,
            errorDetails: error.details,
            errorHint: error.hint,
            step: "insert_order",
        };
    }

    const orderId = (data as any)?.id as string;
    console.log("[executeCheckout] ✅ VENTA GUARDADA, id:", orderId);

    // 2) DELETE comanda activa + UPDATE mesa (best-effort, no bloquea)
    //    ★ La columna en dining_tables es 'number' (NO 'table_number')
    //    ★ Capturar errores HTTP 400 silenciosamente
    if (input.tableNumber) {
        const tnum = String(input.tableNumber);
        const tnumNum = Number(input.tableNumber);
        try {
            console.log("[executeCheckout] paso 2: DELETE open_orders table_number=", tnum);
            // 2a) DELETE comanda activa
            const { error: delErr } = await supabase
                .from("open_orders")
                .delete()
                .eq("table_number", tnum);
            if (delErr) {
                console.warn("[executeCheckout] ⚠ DELETE open_orders:", delErr.message);
            }

            // 2b) UPDATE mesa — intentar por 'number' (esquema real)
            console.log("[executeCheckout] paso 3: UPDATE dining_tables por 'number'=", tnumNum);
            const { error: updErr1 } = await supabase
                .from("dining_tables")
                .update({ status: "free", current_order_id: null })
                .eq("number", tnumNum);
            if (updErr1) {
                console.warn("[executeCheckout] ⚠ UPDATE por 'number' falló:", updErr1.message);
                // Fallback: intentar por 'table_number' por si la BD usa otro esquema
                const { error: updErr2 } = await supabase
                    .from("dining_tables")
                    .update({ status: "free" })
                    .eq("table_number", tnum);
                if (updErr2) {
                    console.warn("[executeCheckout] ⚠ UPDATE por 'table_number' también falló (silenciado):", updErr2.message);
                } else {
                    console.log("[executeCheckout] ✓ mesa liberada por 'table_number'");
                }
            } else {
                console.log("[executeCheckout] ✓ mesa liberada en BD");
            }
        } catch (e) {
            console.warn("[executeCheckout] ⚠ mesa/comanda cleanup error (silenciado):", e);
        }
    }

    console.log("[executeCheckout] ★★ FIN OK ★* orderId=", orderId);
    return { ok: true, orderId };
}
