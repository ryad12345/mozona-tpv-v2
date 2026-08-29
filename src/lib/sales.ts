// =====================================================================
// MOZONA TPV — sales: histórico de ventas del mes en curso
// =====================================================================

import { supabase } from "./supabase";
import { resolveRealTenantId } from "./waiters";
import type { OrderItem } from "./types";

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

export interface SaleRecord {
    id:              string;
    table_number:    string | null;
    waiter_name:     string | null;
    items:           OrderItem[];
    subtotal:        number;
    tax_total:       number;
    total:           number;
    payment_method:  string | null;
    payment_status:  string;
    status:          string;
    series:          string | null;
    verifactu_qr:    string | null;
    created_at:      string;
    updated_at:      string;
}

export interface SalesMetrics {
    totalRevenue:    number;
    orderCount:      number;
    paidCount:       number;
    averageTicket:   number;
    byPaymentMethod: Record<string, { count: number; total: number }>;
    byTaxRate:       Record<number, { base: number; tax: number; total: number }>;
    topProducts:     Array<{ name: string; quantity: number; total: number }>;
}

// ---------------------------------------------------------------------
// Cargar ventas del mes en curso
// ---------------------------------------------------------------------

export async function listMonthSales(tenantId: string | null): Promise<SaleRecord[]> {
    const realId = await resolveRealTenantId(tenantId);
    if (!realId || !supabase) return [];

    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("tenant_id", realId)
        .gte("created_at", start)
        .order("created_at", { ascending: false })
        .limit(500);

    if (error) {
        console.warn("[sales] list error:", error.message);
        return [];
    }
    return (data ?? []).map(normalizeSale);
}

function normalizeSale(row: any): SaleRecord {
    return {
        id:              row.id,
        table_number:    row.table_number ?? null,
        waiter_name:     row.waiter_name ?? null,
        items:           Array.isArray(row.items) ? row.items : [],
        subtotal:        Number(row.subtotal   ?? 0),
        tax_total:       Number(row.tax_total  ?? 0),
        total:           Number(row.total      ?? 0),
        payment_method:  row.payment_method ?? null,
        payment_status:  row.payment_status ?? "paid",
        status:          row.status         ?? "closed",
        series:          row.series         ?? null,
        verifactu_qr:    row.verifactu_qr   ?? null,
        created_at:      row.created_at     ?? new Date().toISOString(),
        updated_at:      row.updated_at     ?? row.created_at ?? new Date().toISOString(),
    };
}

// ---------------------------------------------------------------------
// Calcular métricas a partir de las ventas
// ---------------------------------------------------------------------

export function computeMetrics(records: SaleRecord[]): SalesMetrics {
    const byPaymentMethod: Record<string, { count: number; total: number }> = {};
    const byTaxRate:       Record<number, { base: number; tax: number; total: number }> = {};
    const productAgg:      Record<string, { name: string; quantity: number; total: number }> = {};

    let totalRevenue = 0;
    let paidCount    = 0;
    for (const r of records) {
        if (r.status === "cancelled") continue;
        if (r.payment_status === "paid") paidCount++;
        totalRevenue += r.total;

        // Por método de pago
        const pm = r.payment_method ?? "desconocido";
        if (!byPaymentMethod[pm]) byPaymentMethod[pm] = { count: 0, total: 0 };
        byPaymentMethod[pm].count++;
        byPaymentMethod[pm].total += r.total;

        // Por producto y por IVA
        for (const it of r.items) {
            const qty   = Number(it.quantity ?? 1);
            const price = Number(it.unit_price ?? 0);
            const tax   = Number(it.tax_rate ?? 10);
            const lineSub = price * qty;
            const base    = lineSub / (1 + tax / 100);
            const taxAmt  = lineSub - base;

            // Top productos
            const k = it.name ?? `Producto ${it.product_id}`;
            if (!productAgg[k]) productAgg[k] = { name: k, quantity: 0, total: 0 };
            productAgg[k].quantity += qty;
            productAgg[k].total    += lineSub;

            // Por IVA
            const tk = Math.round(tax);
            if (!byTaxRate[tk]) byTaxRate[tk] = { base: 0, tax: 0, total: 0 };
            byTaxRate[tk].base  += base;
            byTaxRate[tk].tax   += taxAmt;
            byTaxRate[tk].total += lineSub;
        }
    }

    const topProducts = Object.values(productAgg)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

    return {
        totalRevenue,
        orderCount:   records.length,
        paidCount,
        averageTicket: paidCount > 0 ? totalRevenue / paidCount : 0,
        byPaymentMethod,
        byTaxRate,
        topProducts,
    };
}

// ---------------------------------------------------------------------
// Cancelar un ticket (solo status='cancelled', no se borra)
// ---------------------------------------------------------------------

export async function cancelSale(id: string): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled", payment_status: "cancelled" })
        .eq("id", id);
    if (error) {
        console.warn("[sales] cancel error:", error.message);
        return false;
    }
    return true;
}
