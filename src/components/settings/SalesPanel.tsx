// =====================================================================
// MOZONA TPV — SalesPanel: pestaña de supervisión de ventas del mes
// =====================================================================

import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { listMonthSales, computeMetrics, cancelSale, type SaleRecord } from "../../lib/sales";
import { fmtEUR } from "../../lib/format";

export function SalesPanel() {
    const auth = useAuth();
    const [records, setRecords]   = useState<SaleRecord[]>([]);
    const [loading, setLoading]   = useState(false);
    const [error,   setError]     = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [filterPm, setFilterPm] = useState<string>("all");

    const tenantId = auth.tenant?.id ?? null;

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            console.log("[SalesPanel] cargando ventas del mes, tenantId=", tenantId);
            const data = await listMonthSales(tenantId);
            console.log("[SalesPanel] cargadas", data.length, "ventas");
            setRecords(data);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("[SalesPanel] error cargando ventas:", msg);
            setError(msg);
        }
        setLoading(false);
    };

    // Auto-refresco cada 30s mientras el panel está visible
    useEffect(() => {
        void load();
        const interval = setInterval(() => { void load(); }, 30_000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId]);

    const metrics = computeMetrics(records.filter(r => r.status !== "cancelled"));

    const filteredRecords = filterPm === "all"
        ? records
        : records.filter(r => (r.payment_method ?? "desconocido") === filterPm);

    const toggleExpand = (id: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const monthName = new Date().toLocaleDateString("es-ES", { month: "long", year: "numeric" });

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-base font-bold text-slate-900">
                        📊 Ventas del mes — {monthName}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                        Tickets cerrados y cobrados. Datos en tiempo real desde Supabase.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="h-9 px-4 bg-white border border-slate-200 text-slate-700 font-bold text-xs rounded-xl shadow-sm hover:bg-slate-50 active:scale-95 transition"
                >
                    {loading ? "Cargando…" : "🔄 Refrescar"}
                </button>
            </div>

            {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[12.5px]">
                    <p className="font-bold mb-1">⚠️ Error cargando ventas</p>
                    <p>{error}</p>
                    {/orders.*not.*exist|schema cache|PGRST/i.test(error) && (
                        <p className="mt-2 text-[11px]">
                            💡 Ejecuta <code className="bg-rose-100 px-1 rounded">database/12_open_orders.sql</code> en Supabase SQL Editor
                            para crear la tabla <code className="bg-rose-100 px-1 rounded">public.orders</code>.
                        </p>
                    )}
                </div>
            )}

            {records.length === 0 && !loading && !error && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[12.5px]">
                    <p className="font-bold mb-1">📭 No hay ventas registradas este mes</p>
                    <p>
                        Las ventas aparecerán aquí en cuanto cobres la primera mesa.
                        Si acabas de cobrar y no aparece, abre la consola del navegador
                        (F12) y revisa los mensajes de <code className="bg-amber-100 px-1 rounded">[PosTerminalPro] INSERT orders</code>.
                    </p>
                </div>
            )}

            {/* Métricas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metric
                    label="Facturado este mes"
                    value={fmtEUR(metrics.totalRevenue)}
                    accent="emerald"
                    icon="💰"
                />
                <Metric
                    label="Tickets pagados"
                    value={String(metrics.paidCount)}
                    accent="blue"
                    icon="🧾"
                />
                <Metric
                    label="Total comandas"
                    value={String(metrics.orderCount)}
                    accent="slate"
                    icon="📋"
                />
                <Metric
                    label="Ticket medio"
                    value={fmtEUR(metrics.averageTicket)}
                    accent="violet"
                    icon="📈"
                />
            </div>

            {/* Desglose por método de pago + IVA */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <h4 className="text-[13px] font-bold text-slate-800 mb-2">💳 Métodos de pago</h4>
                    {Object.keys(metrics.byPaymentMethod).length === 0 ? (
                        <p className="text-[12px] text-slate-400">Sin datos</p>
                    ) : (
                        <ul className="space-y-1.5">
                            {Object.entries(metrics.byPaymentMethod).map(([pm, d]) => (
                                <li key={pm} className="flex items-center justify-between text-[12.5px]">
                                    <span className="text-slate-700 capitalize">
                                        {pm === "cash" ? "Efectivo" :
                                         pm === "card" ? "Tarjeta" :
                                         pm === "mixed" ? "Mixto" :
                                         pm === "verifactu" ? "VeriFactu" :
                                         pm}
                                    </span>
                                    <span className="font-mono font-bold text-slate-900">
                                        {d.count} × {fmtEUR(d.total)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <h4 className="text-[13px] font-bold text-slate-800 mb-2">🧾 Desglose de IVA</h4>
                    {Object.keys(metrics.byTaxRate).length === 0 ? (
                        <p className="text-[12px] text-slate-400">Sin datos</p>
                    ) : (
                        <ul className="space-y-1.5">
                            {Object.entries(metrics.byTaxRate)
                                .sort(([a], [b]) => Number(a) - Number(b))
                                .map(([rate, d]) => (
                                <li key={rate} className="text-[12.5px]">
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-700 font-semibold">Tipo {rate}%</span>
                                        <span className="font-mono font-bold text-slate-900">
                                            {fmtEUR(d.total)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                                        <span>Base: {fmtEUR(d.base)}</span>
                                        <span>I.V.A.: {fmtEUR(d.tax)}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* Top productos */}
            {metrics.topProducts.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <h4 className="text-[13px] font-bold text-slate-800 mb-2">🏆 Top productos</h4>
                    <ul className="space-y-1.5">
                        {metrics.topProducts.slice(0, 5).map((p, i) => (
                            <li key={p.name} className="flex items-center justify-between text-[12.5px]">
                                <span className="text-slate-700">
                                    <span className="font-bold text-slate-500 mr-1.5">{i + 1}.</span>
                                    {p.name}
                                    <span className="text-slate-400 ml-2">×{p.quantity}</span>
                                </span>
                                <span className="font-mono font-bold text-slate-900">
                                    {fmtEUR(p.total)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Listado de tickets */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[13px] font-bold text-slate-800">🧾 Tickets del mes</h4>
                    <select
                        value={filterPm}
                        onChange={e => setFilterPm(e.target.value)}
                        className="h-8 px-2 text-[11px] border border-slate-200 rounded-lg bg-white"
                    >
                        <option value="all">Todos los métodos</option>
                        <option value="cash">Efectivo</option>
                        <option value="card">Tarjeta</option>
                        <option value="mixed">Mixto</option>
                        <option value="verifactu">VeriFactu</option>
                    </select>
                </div>

                {loading && records.length === 0 ? (
                    <p className="text-[12px] text-slate-400 py-4 text-center">Cargando ventas…</p>
                ) : filteredRecords.length === 0 ? (
                    <p className="text-[12px] text-slate-400 py-4 text-center">
                        No hay tickets este mes.  Cierra la primera venta y aparecerá aquí.
                    </p>
                ) : (
                    <ul className="space-y-1.5 max-h-[480px] overflow-y-auto">
                        {filteredRecords.map(r => {
                            const isOpen = expanded.has(r.id);
                            const cancelled = r.status === "cancelled";
                            return (
                                <li key={r.id}
                                    className={`rounded-xl border ${cancelled ? "border-rose-200 bg-rose-50/30" : "border-slate-200 bg-white"} overflow-hidden`}>
                                    <button
                                        type="button"
                                        onClick={() => toggleExpand(r.id)}
                                        className="w-full text-left p-2.5 hover:bg-slate-50 active:scale-[0.99] transition flex items-center justify-between gap-2"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-[10px] font-mono text-slate-400 w-12 shrink-0">
                                                {new Date(r.created_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                                            </span>
                                            <span className="text-[12px] font-bold text-slate-700 w-14 shrink-0">
                                                M.{r.table_number ?? "—"}
                                            </span>
                                            <span className="text-[12px] text-slate-600 truncate">
                                                {r.waiter_name ?? "(sin camarero)"}
                                            </span>
                                            {cancelled && (
                                                <span className="text-[10px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded">ANULADO</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="font-mono font-bold text-[12.5px] text-slate-900">
                                                {fmtEUR(r.total)}
                                            </span>
                                            <span className="text-slate-400 text-[10px]">
                                                {isOpen ? "▲" : "▼"}
                                            </span>
                                        </div>
                                    </button>
                                    {isOpen && (
                                        <div className="border-t border-slate-100 bg-slate-50/40 p-3">
                                            <ul className="space-y-1 text-[11.5px] font-mono mb-2">
                                                {r.items.map((it, i) => (
                                                    <li key={i} className="flex justify-between">
                                                        <span>
                                                            {it.quantity}× {it.name}
                                                        </span>
                                                        <span className="text-slate-700">
                                                            {fmtEUR((it.unit_price ?? 0) * (it.quantity ?? 1))}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                            <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600 font-mono pt-2 border-t border-slate-200">
                                                <span>Subtotal: {fmtEUR(r.subtotal)}</span>
                                                <span>IVA: {fmtEUR(r.tax_total)}</span>
                                                <span>Pago: {r.payment_method ?? "—"}</span>
                                                <span>Estado: {r.status}</span>
                                            </div>
                                            {!cancelled && (
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        if (window.confirm("¿Anular este ticket?  Quedará marcado como cancelado.")) {
                                                            const ok = await cancelSale(r.id);
                                                            if (ok) await load();
                                                        }
                                                    }}
                                                    className="mt-2 h-7 px-2.5 text-[10.5px] font-bold text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 active:scale-95 transition"
                                                >
                                                    Anular ticket
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}

function Metric({ label, value, icon, accent }: {
    label: string; value: string; icon: string;
    accent: "emerald" | "blue" | "slate" | "violet";
}) {
    const accentMap = {
        emerald: "from-emerald-500 to-emerald-600",
        blue:    "from-blue-500 to-blue-600",
        slate:   "from-slate-500 to-slate-600",
        violet:  "from-violet-500 to-violet-600",
    } as const;
    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
            <div className="flex items-center gap-2">
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${accentMap[accent]} text-white flex items-center justify-center text-base shadow`}>
                    {icon}
                </div>
                <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide truncate">{label}</p>
                    <p className="text-base font-black text-slate-900 truncate">{value}</p>
                </div>
            </div>
        </div>
    );
}
