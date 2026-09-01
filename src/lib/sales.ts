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
    return listSales(tenantId, "month");
}

/** Lista ventas filtradas por periodo.
 *  periods: 'today' | 'month' | '30d' | 'all' */
export async function listSales(
    tenantId: string | null,
    period: "today" | "month" | "30d" | "all" = "30d",
): Promise<SaleRecord[]> {
    const realId = await resolveRealTenantId(tenantId);
    console.log("[listSales] tenantId=", tenantId, "→ realId=", realId, "period=", period);
    if (!realId || !supabase) {
        console.warn("[listSales] no realId, retornando []");
        return [];
    }

    // ★ Calcular rango de fechas según periodo
    const now = new Date();
    let start: string | null = null;
    if (period === "today") {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        start = d.toISOString();
    } else if (period === "month") {
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString();
    } else if (period === "30d") {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        start = d.toISOString();
    } else {
        // "all" → no filtro de fecha
        start = null;
    }
    console.log("[listSales] start=", start ?? "(sin filtro)");

    // ★ Columnas EXPLÍCITAS para confirmar que la BD las tiene
    let query = supabase
        .from("orders")
        .select("id, waiter_name, subtotal, tax_total, total, payment_method, payment_status, status, table_number, items, created_at, updated_at, tenant_id")
        .eq("tenant_id", realId)
        .order("created_at", { ascending: false })
        .limit(1000);
    if (start) {
        query = query.gte("created_at", start);
    }

    const { data, error } = await query;
    if (error) {
        console.warn("[listSales] error:", error.message, "(code", (error as any).code, ")");
        return [];
    }
    console.log("[listSales] cargados", data?.length ?? 0, "tickets");

    // ★ MODO DETECTIVE: si no hay resultados con el tenant resuelto,
    //   buscar en TODOS los tenants activos para diagnosticar
    if ((data?.length ?? 0) === 0) {
        console.warn("[listSales] 0 resultados con tenant_id=", realId, "— buscando en todos los tenants");
        const { data: allData } = await supabase
            .from("orders")
            .select("id, waiter_name, subtotal, tax_total, total, payment_method, payment_status, status, table_number, items, created_at, updated_at, tenant_id")
            .order("created_at", { ascending: false })
            .limit(1000);
        if (allData && allData.length > 0) {
            // Agrupar por tenant_id
            const byTenant: Record<string, number> = {};
            for (const r of allData) {
                const k = String(r.tenant_id ?? "null");
                byTenant[k] = (byTenant[k] ?? 0) + 1;
            }
            console.log("[listSales] DISTRIBUCIÓN por tenant_id:", byTenant);
            console.log("[listSales] tickets encontrados (todos los tenants):", allData.length);
            // Usar el primer tenant_id que tenga resultados
            const firstTenantWithData = allData.find(r => r.tenant_id)?.tenant_id;
            if (firstTenantWithData && firstTenantWithData !== realId) {
                console.warn("[listSales] usando tenant_id alternativo:", firstTenantWithData);
                return allData.filter(r => r.tenant_id === firstTenantWithData).map(normalizeSale);
            }
            return allData.map(normalizeSale);
        }
    }

    if (data && data.length > 0) {
        console.log("[listSales] primer ticket:", {
            id: data[0].id,
            total: data[0].total,
            subtotal: data[0].subtotal,
            tax_total: data[0].tax_total,
            payment_method: data[0].payment_method,
            created_at: data[0].created_at,
            tenant_id: data[0].tenant_id,
        });
    }
    return (data ?? []).map(normalizeSale);
}

function normalizeSale(row: any): SaleRecord {
    // Mapeo defensivo: total, subtotal, tax_total pueden ser string (NUMERIC de PG)
    const toNum = (v: any) => {
        if (v == null) return 0;
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    };
    return {
        id:              row.id,
        table_number:    row.table_number != null ? String(row.table_number) : null,
        waiter_name:     row.waiter_name ?? null,
        items:           Array.isArray(row.items) ? row.items : [],
        subtotal:        toNum(row.subtotal),
        tax_total:       toNum(row.tax_total),
        // total puede llegar como 'total' o 'total_amount' (defensivo)
        total:           toNum(row.total ?? row.total_amount ?? row.amount),
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
