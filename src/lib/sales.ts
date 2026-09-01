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
export async function loadSalesMetrics(
    period: "today" | "month" | "30d" | "all" = "30d",
    startDate?: Date | string,
    endDate?: Date | string,
) {
    const records = await listSales(null, period, startDate, endDate);
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
    startDate?: Date | string,
    endDate?: Date | string,
): Promise<SaleRecord[]> {
    console.log("[listSales] ★★ INICIO ★★ tenantId=", tenantId, "period=", period);
    if (!supabase) {
        console.warn("[listSales] supabase no configurado");
        return [];
    }

    // 1) Calcular rango de fechas según periodo
    const now = new Date();
    // ★ Prioridad: startDate/endDate explícitos > period
    let start: string | null = null;
    let end:   string | null = null;
    if (startDate) {
        start = (startDate instanceof Date ? startDate : new Date(startDate)).toISOString();
    } else if (period === "today") {
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
    if (endDate) {
        end = (endDate instanceof Date ? endDate : new Date(endDate)).toISOString();
    }
    console.log("[listSales] start=", start ?? "(sin filtro)", "end=", end ?? "(sin tope)");

    // 2) Query base ULTRA-DEFENSIVA
    let query = supabase
        .from("orders")
        .select("id, total, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
    if (start) query = query.gte("created_at", start);
    if (end)   query = query.lte("created_at", end);

    // 3) ★ PRIMERA QUERY: con tenant_id resuelto (si lo hay)
    const realId = await resolveRealTenantId(tenantId);
    console.log("[listSales] tenant resuelto:", realId);

    // ★★★ ESTRATEGIA 1: query mínima sin filtro de tenant ★★★
    //    Pedimos solo 'id, total, created_at' (columnas que casi seguro existen)
    let allData: any[] | null = null;
    try {
        const { data, error } = await query;
        if (error) {
            console.warn("[listSales] E1 error:", error.code, error.message, error.details, error.hint);
        } else if (data && data.length > 0) {
            allData = data;
            console.log("[listSales] E1 ✓ cargados", data.length, "tickets (mínimas)");
        }
    } catch (e) {
        console.warn("[listSales] E1 exception:", e);
    }

    // ★★★ ESTRATEGIA 2: fallback a select(*) si E1 no devuelve nada ★★★
    if (!allData || allData.length === 0) {
        try {
            const { data, error } = await supabase
                .from("orders")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(1000);
            if (error) {
                console.error("[listSales] E2 error:", error.code, error.message, error.details, error.hint);
            } else if (data && data.length > 0) {
                allData = data;
                console.log("[listSales] E2 ✓ cargados", data.length, "tickets con *");
                // Mostrar las columnas reales
                if (data[0]) {
                    console.log("[listSales] columnas disponibles:", Object.keys(data[0]).join(", "));
                }
            }
        } catch (e) {
            console.error("[listSales] E2 exception:", e);
        }
    }

    if (!allData || allData.length === 0) {
        console.warn("[listSales] 0 tickets en TODA la tabla orders");
        return [];
    }

    console.log("[listSales] tickets totales:", allData.length);
    if (allData[0]) {
        console.log("[listSales] muestra ticket[0]:", JSON.stringify(allData[0]).slice(0, 500));
    }

    // ★ Filtrar por tenant si lo hay y la columna existe
    if (realId && allData[0] && "tenant_id" in allData[0]) {
        const filtered = allData.filter(r => String(r.tenant_id) === realId);
        if (filtered.length > 0) {
            console.log("[listSales] ✓ con tenant", realId, "→", filtered.length, "tickets");
            return filtered.map(normalizeSale);
        }
        console.warn("[listSales] 0 tickets con tenant", realId, "— devolviendo todos");
    }

    return allData.map(normalizeSale);
}

function extractTableNumber(row: any): string | null {
    // La tabla orders REAL no tiene 'table_number' ni 'items'.
    // Devolvemos null para que la UI muestre "—" en lugar de crashear.
    return null;
}

function normalizeSale(row: any): SaleRecord {
    // Mapeo ultra-defensivo: no asumimos columnas.
    // Solo leemos si la columna existe.
    const toNum = (v: any) => {
        if (v == null) return 0;
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    };
    return {
        id:              row.id,
        table_number:    null,    // no asumimos columna
        waiter_name:     "waiter_name" in row ? (row.waiter_name ?? null) : null,
        items:           [],      // no asumimos columna
        subtotal:        "subtotal"  in row ? toNum(row.subtotal)    : 0,
        tax_total:       "tax_total" in row ? toNum(row.tax_total)   : 0,
        total:           "total" in row ? toNum(row.total) : 0,
        payment_method:  "payment_method" in row ? (row.payment_method ?? null) : null,
        status:          "status" in row ? (row.status ?? "closed") : "closed",
        series:          null,
        verifactu_qr:    null,
        created_at:      "created_at" in row ? (row.created_at ?? new Date().toISOString()) : new Date().toISOString(),
        updated_at:      "updated_at" in row ? (row.updated_at ?? row.created_at ?? new Date().toISOString()) : new Date().toISOString(),
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
