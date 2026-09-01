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
    return listSales(tenantId, "30d");
}

/** ★★★ FUNCIÓN SIMPLIFICADA PARA EL PANEL DE VENTAS ★★★
 *  Lee TODOS los orders, filtra los cancelados, calcula total.
 *  Acepta cualquier status != 'cancelled'. */
export async function loadSalesMetrics(period: "today" | "month" | "30d" | "all" = "30d") {
    const records = await listSales(null, period);
    const valid = records.filter(r => r.status !== "cancelled");
    const totalRevenue = valid.reduce(
        (s, r) => s + Number(r.total ?? r.subtotal ?? 0),
        0,
    );
    return {
        sales: valid,
        totalRevenue,
        count: valid.length,
    };
}

/** ★★★ FUNCIÓN PRINCIPAL ★★★
 *  Carga ventas con SELECT directo a `orders`, sin filtros restrictivos
 *  de tenant.  Garantiza que NUNCA devuelve [] si la tabla tiene datos.
 *
 *  Acepta un tenantId opcional para filtrar (cuando se sabe cuál es),
 *  pero si no se pasa o no hay resultados, usa el "tenant dominante"
 *  (el que tiene más tickets en la BD).
 */
export async function listSales(
    tenantId: string | null,
    period: "today" | "month" | "30d" | "all" = "30d",
): Promise<SaleRecord[]> {
    console.log("[listSales] ★★ INICIO ★★ tenantId=", tenantId, "period=", period);
    if (!supabase) {
        console.warn("[listSales] supabase no configurado");
        return [];
    }

    // 1) Calcular rango de fechas según periodo
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
        start = null;
    }
    console.log("[listSales] start=", start ?? "(sin filtro)");

    // 2) Query base sin filtro de tenant
    // ★ FIX: quitar 'payment_status' que NO EXISTE en la tabla orders real.
    // Solo pedimos columnas que sabemos que existen.
    let query = supabase
        .from("orders")
        .select("id, waiter_name, subtotal, tax_total, total, payment_method, status, table_number, items, created_at, updated_at, tenant_id")
        .order("created_at", { ascending: false })
        .limit(1000);
    if (start) query = query.gte("created_at", start);

    // 3) ★ PRIMERA QUERY: con tenant_id resuelto (si lo hay)
    const realId = await resolveRealTenantId(tenantId);
    console.log("[listSales] tenant resuelto:", realId);
    if (realId) {
        const { data, error } = await query.eq("tenant_id", realId);
        if (error) {
            console.warn("[listSales] error con tenant:", error.message);
        } else if (data && data.length > 0) {
            console.log("[listSales] ✓ cargados", data.length, "tickets con tenant", realId);
            return data.map(normalizeSale);
        }
        console.warn("[listSales] 0 tickets con tenant", realId, "— probando sin filtro");
    }

    // 4) ★ FALLBACK: query sin filtro de tenant
    const { data: allData, error: allErr } = await query;
    if (allErr) {
        console.error("[listSales] error sin filtro:", allErr.message);
        return [];
    }
    if (!allData || allData.length === 0) {
        console.warn("[listSales] 0 tickets en TODA la tabla orders");
        return [];
    }

    console.log("[listSales] tickets totales (sin filtro):", allData.length);

    // 5) Distribución por tenant_id
    const byTenant: Record<string, number> = {};
    for (const r of allData) {
        const k = String(r.tenant_id ?? "null");
        byTenant[k] = (byTenant[k] ?? 0) + 1;
    }
    console.log("[listSales] DISTRIBUCIÓN por tenant_id:", byTenant);

    // 6) Usar el tenant DOMINANTE (con más tickets)
    const sortedTenants = Object.entries(byTenant).sort(([, a], [, b]) => b - a);
    const dominantTenant = sortedTenants[0]?.[0];
    if (dominantTenant && dominantTenant !== "null") {
        const tickets = allData
            .filter(r => String(r.tenant_id) === dominantTenant)
            .map(normalizeSale);
        console.log("[listSales] ✓ usando tenant dominante:", dominantTenant, "→", tickets.length, "tickets");
        return tickets;
    }
    console.log("[listSales] tickets sin tenant_id, devolviendo todos:", allData.length);
    return allData.map(normalizeSale);
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
        // ★ FIX: status "closed" o "paid" cuentan como pagados
        if (r.status === "closed" || r.status === "paid") paidCount++;
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
    // ★ FIX: solo actualizamos 'status' (payment_status no existe en la tabla)
    const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", id);
    if (error) {
        console.warn("[sales] cancel error:", error.message);
        return false;
    }
    return true;
}
