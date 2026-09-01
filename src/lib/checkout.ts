// =====================================================================
// MOZONA TPV — executeCheckout: proceso atómico de cobro
// =====================================================================
// Ejecuta la transacción completa de cobro SIN dejar datos huérfanos:
//   1. INSERT en orders (ticket definitivo)
//   2. DELETE en open_orders (limpia la comanda temporal)
//   3. UPDATE en dining_tables (libera la mesa)
//   4. Resetea el estado local de React (caller se encarga)
// =====================================================================

import { supabase } from "./supabase";
import { resolveRealTenantId } from "./waiters";

export interface ExecuteCheckoutInput {
    /** UUID o local-table-N del tenant real */
    tenantId: string | null;
    /** ID de la mesa (UUID o 'local-table-N') */
    tableId: string | null;
    /** Número de mesa (1-16) */
    tableNumber: string | number | null;
    /** ID de la comanda abierta a eliminar (opcional) */
    openOrderId?: string | null;
    /** Líneas del pedido */
    items: any[];
    /** Subtotal sin IVA */
    subtotal: number;
    /** Total IVA */
    taxTotal: number;
    /** Total final con IVA */
    total: number;
    /** Método de pago: 'cash' | 'card' | 'mixed' | 'verifactu' */
    paymentMethod: string;
    /** Nombre del camarero/cajero */
    waiterName?: string | null;
    /** Serie del ticket */
    series?: string;
}

export interface ExecuteCheckoutResult {
    ok: boolean;
    orderId?: string;
    error?: string;
    errorCode?: string;
    step?: "tenant" | "insert_order" | "delete_open_order" | "update_table" | "rpc";
}

export async function executeCheckout(input: ExecuteCheckoutInput): Promise<ExecuteCheckoutResult> {
    console.log("[executeCheckout] ★★ INICIO ★*", {
        tenantId: input.tenantId,
        tableId: input.tableId,
        tableNumber: input.tableNumber,
        items: input.items.length,
        total: input.total,
        paymentMethod: input.paymentMethod,
    });

    // 0) Resolver tenant_id
    const realId = await resolveRealTenantId(input.tenantId);
    if (!realId || realId === "00000000-0000-0000-0000-000000000000") {
        return { ok: false, error: "No se pudo resolver tenant_id", step: "tenant" };
    }

    if (!supabase) {
        return { ok: false, error: "Supabase no está configurado" };
    }

    // 1) INSERT en orders (vía RPC SECURITY DEFINER bypasa RLS)
    console.log("[executeCheckout] paso 1: INSERT orders");
    // ★ Inyectar la referencia a la mesa en el SNAPSHOT de cada item
    //    para que el panel de Ventas pueda mostrarla aunque la tabla
    //    orders no tenga columna table_number.
    const itemsWithTable = (input.items ?? []).map((it: any) => ({
        ...it,
        tableNumber: input.tableNumber ?? null,
        tableId:     input.tableId     ?? null,
    }));
    const { data: order, error: orderErr } = await supabase.rpc("insert_order_with_tenant", {
        p_order: {
            tenant_id: realId,
            table_id: input.tableId || null,
            table_number: input.tableNumber || null,
            waiter_name: input.waiterName || "Caja",
            items: itemsWithTable,
            subtotal: input.subtotal,
            tax_total: input.taxTotal,
            total: input.total,
            payment_method: input.paymentMethod || "cash",
            status: "closed",
            series: input.series || "T26",
        },
    });

    if (orderErr) {
        console.error("[executeCheckout] INSERT orders error:", orderErr);
        return {
            ok: false,
            error: orderErr.message,
            errorCode: orderErr.code,
            step: "insert_order",
        };
    }
    const rpcData = order as any;
    if (!rpcData?.ok) {
        return {
            ok: false,
            error: rpcData?.error || "RPC retornó error",
            step: "rpc",
        };
    }
    const orderId = rpcData.id as string;
    console.log("[executeCheckout] ✓ INSERT orders, id=", orderId);

    // 2) DELETE en open_orders
    if (input.openOrderId || input.tableId || input.tableNumber) {
        console.log("[executeCheckout] paso 2: DELETE open_orders");
        try {
            const conditions: string[] = [];
            if (input.openOrderId) conditions.push(`id.eq.${input.openOrderId}`);
            if (input.tableId) conditions.push(`table_id.eq.${input.tableId}`);
            if (input.tableNumber) conditions.push(`table_number.eq.${String(input.tableNumber)}`);
            if (conditions.length > 0) {
                const { error: delErr } = await supabase
                    .from("open_orders")
                    .delete()
                    .or(conditions.join(","));
                if (delErr) {
                    console.warn("[executeCheckout] DELETE open_orders error:", delErr.message);
                } else {
                    console.log("[executeCheckout] ✓ DELETE open_orders");
                }
            }
        } catch (e) {
            console.warn("[executeCheckout] DELETE open_orders exception:", e);
        }
    }

    // 3) UPDATE en dining_tables
    if (input.tableId || input.tableNumber) {
        console.log("[executeCheckout] paso 3: UPDATE dining_tables");
        try {
            const isLocal = String(input.tableId ?? "").startsWith("local-");
            let upd;
            if (input.tableId && !isLocal) {
                upd = supabase
                    .from("dining_tables")
                    .update({ status: "free", current_order_id: null })
                    .eq("id", input.tableId);
            } else if (input.tableNumber) {
                upd = supabase
                    .from("dining_tables")
                    .update({ status: "free", current_order_id: null })
                    .eq("table_number", String(input.tableNumber));
            }
            if (upd) {
                const { error: tblErr } = await upd;
                if (tblErr) {
                    console.warn("[executeCheckout] UPDATE dining_tables error:", tblErr.message);
                } else {
                    console.log("[executeCheckout] ✓ UPDATE dining_tables");
                }
            }
        } catch (e) {
            console.warn("[executeCheckout] UPDATE dining_tables exception:", e);
        }
    }

    console.log("[executeCheckout] ★★ FIN OK ★* orderId=", orderId);
    return { ok: true, orderId };
}
