// =====================================================================
// MOZONA TPV — PosTerminalPro (versión final)
// =====================================================================
// Layout 3 columnas:
//   IZQUIERDA  · CatalogPanel: salas, categorías, productos, búsqueda
//   CENTRAL    · OrderPanel:   comanda con líneas, totales, pre-cuenta
//   DERECHA    · PaymentPanel: display, numpad, botones de cobro
//
// Integración:
//   • WebSocketProvider → recibe ORDER_SENT, INVOICE_PAID, TABLE_STATUS_CHANGED
//   • Web Audio API → "ding" al entrar comanda desde WaiterPad
//   • useWaiterAuth → cajero activo (PIN)
//   • usePosReducer → estado del pedido
//   • VeriFactu RPC → emisión de factura (simulada aquí, ver onChargeVeriFactu)
// =====================================================================

import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useWebSocket } from "../hooks/WebSocketProvider";
import { useWaiterAuth } from "../hooks/useWaiterAuth";
import { useAuth } from "../lib/auth";
import { usePosReducer, type PosState } from "../hooks/usePosReducer";
import { usePosData } from "../hooks/usePosData";
import { CatalogPanel } from "../components/pos/CatalogPanel";
import { OrderPanel }   from "../components/pos/OrderPanel";
import { PaymentPanel } from "../components/pos/PaymentPanel";
import { PinAuthModal } from "../components/auth/PinAuthModal";
import { PosTopBar } from "../components/PosTopBar";
import { IconBell, IconReceipt, IconCheck, IconUser, IconLogout, IconSparkles, IconStore, IconCash } from "../components/icons";
import { playOrderDing, playChargeSuccess, playError, unlockAudio } from "../lib/sounds";
import { cn } from "../lib/cn";
import { useLocalPrinter } from "../hooks/useLocalPrinter";
import { useLocalIP } from "../hooks/useLocalIP";
import type { OrderItem, Product, PaymentMethod, TableStatus, Waiter, Restaurant, RestaurantTable } from "../lib/types";
import type { OrderSentData, InvoicePaidData } from "../../shared/ws-events";

/** Detecta si estamos en Tauri (desktop) o en navegador web. */
const inTauri = typeof window !== "undefined" && "__TAURI__" in window;

// ---------------------------------------------------------------------
// HTML fallback para window.print() cuando no estamos en Tauri
// ---------------------------------------------------------------------
function buildPreBillHtml(params: {
    restaurant:  Restaurant | null;
    table?:       RestaurantTable;
    lines:        Array<{ name: string; qty: number; price: number; tax_rate?: number; notes?: string }>;
    waiter?:      { name: string; loggedInAt?: string } | null;
}): string {
    const { restaurant, table, lines, waiter } = params;
    const fmt = (n: number) => n.toFixed(2) + " €";

    // Desglose IVA (precios incluyen IVA → base = price / (1 + rate/100))
    const byRate = new Map<number, number>();
    let gross = 0;
    for (const l of lines) {
        gross += l.qty * l.price;
        const r = l.tax_rate ?? 10;
        byRate.set(r, (byRate.get(r) ?? 0) + l.qty * l.price);
    }
    const taxRows = Array.from(byRate.entries()).sort((a, b) => b[0] - a[0])
        .map(([r, g]) => {
            const base = g / (1 + r / 100);
            const tax  = g - base;
            return `<tr><td>Base ${r}%</td><td style="text-align:right">${fmt(base)}</td></tr>`
                 + `<tr><td>I.V.A. ${r}%</td><td style="text-align:right">${fmt(tax)}</td></tr>`;
        }).join("");

    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Pre-cuenta</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body  { font-family: ui-monospace, "Courier New", monospace; font-size: 11px; color: #000; width: 72mm; margin: 0; }
  h1    { font-size: 14px; text-align: center; margin: 0 0 2px; }
  .ctr  { text-align: center; }
  hr    { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td    { padding: 1px 0; }
  .total{ font-weight: 900; font-size: 13px; }
  .meta { font-size: 10px; color: #444; }
</style>
</head>
<body>
  <h1>${(restaurant?.business_name ?? "MOZONA TPV").replace(/</g, "&lt;")}</h1>
  <div class="ctr meta">${(restaurant?.address ?? "").replace(/</g, "&lt;")}</div>
  <div class="ctr meta">NIF/CIF: ${restaurant?.cif_nif ?? "—"}</div>
  <hr />
  ${table  ? `<div class="meta">Mesa: <b>${table.table_number}</b></div>` : ""}
  ${waiter ? `<div class="meta">Camarero: <b>${waiter.name.replace(/</g, "&lt;")}</b></div>` : ""}
  <hr />
  <table>
    ${lines.map(l => {
        const line = l.qty > 1 ? `${l.name} x${l.qty}` : l.name;
        const pr   = fmt(l.qty * l.price);
        return `<tr><td>${line.replace(/</g, "&lt;")}</td><td style="text-align:right">${pr}</td></tr>`
             + (l.notes ? `<tr><td colspan="2" class="meta">&nbsp;&nbsp;&gt; ${l.notes.replace(/</g, "&lt;")}</td></tr>` : "");
    }).join("")}
  </table>
  <hr />
  <table>${taxRows}</table>
  <hr />
  <table><tr class="total"><td>TOTAL</td><td style="text-align:right">${fmt(gross)}</td></tr></table>
  <div class="ctr" style="margin-top:8px;">— PRE-CUENTA —</div>
  <script>window.onload = () => setTimeout(() => { window.print(); }, 250);</script>
</body>
</html>`;
}

type MobileTab = "catalog" | "order" | "payment";


// ---------------------------------------------------------------------
// Mock de camareros eliminado — ahora se usa useWaiterAuth.validatePin()
// que valida contra la tabla tenant_users en Supabase (caché IndexedDB).
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------

export function PosTerminalPro() {
    const ws   = useWebSocket();
    const auth = useWaiterAuth();
    const saasAuth = useAuth();
    const nav  = useNavigate();
    const printer = useLocalPrinter();
    const localIp = useLocalIP(3000);
    const { categories, products, tables, connection, loading, restaurant } = usePosData();
    const pos  = usePosReducer();

    const [showAuth, setShowAuth]     = useState(false);
    const [tableStatuses, setTableStatuses] = useState<Record<string, TableStatus>>({});
    const [toast, setToast]           = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
    const [recentOrders, setRecentOrders] = useState<Array<{ id: string; tableNumber: string; waiter: string; receivedAt: string }>>([]);
    const [mobileTab, setMobileTab]   = useState<MobileTab>("catalog");
    const [showQR, setShowQR]         = useState(false);

    // Mostrar PIN al montar si no hay sesión
    useEffect(() => {
        if (!auth.isAuthenticated) setShowAuth(true);
    }, [auth.isAuthenticated]);

    // Toast auto-hide
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 3000);
        return () => clearTimeout(t);
    }, [toast]);

    // -----------------------------------------------------------------
    // Suscripción a eventos del WebSocket
    // -----------------------------------------------------------------
    useEffect(() => {
        if (!ws.isConnected) return;

        const off1 = ws.subscribe<"ORDER_SENT">("ORDER_SENT", (env) => {
            const d = env.data;
            handleOrderReceived(d);
        });
        const off2 = ws.subscribe<"TABLE_STATUS_CHANGED">("TABLE_STATUS_CHANGED", (env) => {
            setTableStatuses(prev => ({ ...prev, [env.data.tableId]: env.data.newStatus }));
        });
        const off3 = ws.subscribe<"INVOICE_PAID">("INVOICE_PAID", (env) => {
            setTableStatuses(prev => ({ ...prev, [env.data.tableId]: "DIRTY" }));
            // Si el cajero tenía cargada esa mesa, limpiarla
            const t = tables.find(tb => tb.table_number === env.data.tableNumber);
            if (t && pos.state.selectedTableId === t.id) {
                pos.dispatch({ type: "CLEAR_ORDER" });
            }
        });
        return () => { off1(); off2(); off3(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ws.isConnected, tables]);

    // -----------------------------------------------------------------
    // Cuando entra una comanda desde un WaiterPad
    // -----------------------------------------------------------------
    const handleOrderReceived = useCallback((d: OrderSentData) => {
        // 1) Sonido
        void unlockAudio();
        playOrderDing();
        // 2) Marcar mesa como ocupada
        setTableStatuses(prev => ({ ...prev, [d.tableId]: "OCCUPIED" }));
        // 3) Si el cajero tiene esa mesa seleccionada, cargar líneas
        const table = tables.find(t => t.id === d.tableId);
        if (table && pos.state.selectedTableId === d.tableId) {
            const items: OrderItem[] = d.items.map(i => ({
                id:          `${d.orderId}-${i.productId}`,
                product_id:  i.productId,
                name:        i.name,
                unit_price:  i.unitPrice,
                tax_rate:    10,
                quantity:    i.quantity,
                notes:       i.notes ?? "",
                added_at:    d.timestamp ?? new Date().toISOString(),
            }));
            // Sumar al pedido existente
            for (const it of items) {
                pos.dispatch({ type: "ADD_PRODUCT" , product: { id: it.product_id, name: it.name, price: it.unit_price, tax_rate: it.tax_rate, restaurant_id: "", category_id: null, description: null, is_available: true } as Product });
            }
        }
        // 4) Notificación visual
        setRecentOrders(prev => [{
            id: d.orderId, tableNumber: d.tableNumber, waiter: d.waiter,
            receivedAt: new Date().toISOString(),
        }, ...prev].slice(0, 5));
        setToast({ kind: "ok", msg: `Comanda recibida · Mesa ${d.tableNumber}` });
    }, [tables, pos]);

    // -----------------------------------------------------------------
    // Selección de mesa (carga líneas vacías para empezar)
    // -----------------------------------------------------------------
    const handleSelectTable = useCallback((id: string | null) => {
        if (id === null) {
            pos.dispatch({ type: "SELECT_TABLE", tableId: null, tableLabel: null });
            return;
        }
        const t = tables.find(tb => tb.id === id);
        if (!t) return;
        pos.dispatch({ type: "SELECT_TABLE", tableId: t.id, tableLabel: t.table_number });
        pos.dispatch({ type: "SELECT_CATEGORY", categoryId: null });
    }, [tables, pos]);

    // -----------------------------------------------------------------
    // Selección de mesa desde el array real (sobrescribe estado en vivo)
    // -----------------------------------------------------------------
    const tablesWithStatus = useMemo(
        () => tables.map(t => ({ ...t, status: tableStatuses[t.id] ?? t.status })),
        [tables, tableStatuses]
    );

    // -----------------------------------------------------------------
    // Acciones de cobro
    // -----------------------------------------------------------------
    const performCharge = useCallback(async (
        method: PaymentMethod,
        withVeriFactu: boolean
    ) => {
        if (!pos.state.selectedTableId || pos.total <= 0 || pos.state.isProcessing) return;

        pos.dispatch({ type: "SET_PROCESSING", processing: true });
        try {
            // 1) En producción: invoke('verifactu_issue_invoice', { ... })
            //    Por simplicidad aquí simulamos la respuesta.
            await new Promise(r => setTimeout(r, 600));

            const table = tables.find(t => t.id === pos.state.selectedTableId);
            if (!table) throw new Error("Mesa no encontrada");

            const invoiceId = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const series    = "T26";
            const number    = Math.floor(Math.random() * 99999) + 1;
            const invoice: InvoicePaidData = {
                invoiceId,
                orderId:      pos.state.selectedTableId,
                series,
                number,
                total:        pos.total,
                paymentMethod: method,
                tableId:      table.id,
                tableNumber:  table.table_number,
                qrUrl:        `https://www2.agenciatributaria.gob.es/wlpl/inwinvoc/...?nif=B12345678&numserie=${series}${String(number).padStart(8,"0")}&fecha=26-08-2026&importe=${pos.total.toFixed(2)}`,
                verifactuHash:"0".repeat(64),
            };

            // 2) Difundir por WS
            ws.broadcastInvoicePaid(invoice);

            // 3) UI: marcar mesa como sucia, limpiar pedido, sonido
            setTableStatuses(prev => ({ ...prev, [table.id]: "DIRTY" }));
            playChargeSuccess();
            pos.dispatch({ type: "CLEAR_ORDER" });
            pos.dispatch({ type: "SELECT_TABLE", tableId: null, tableLabel: null });

            const verb = withVeriFactu ? "Factura VeriFactu emitida" : "Cobro realizado";
            setToast({
                kind: "ok",
                msg: `${verb} · Mesa ${table.table_number} · ${invoice.series}-${String(invoice.number).padStart(8,"0")}`,
            });
        } catch (e) {
            playError();
            setToast({ kind: "err", msg: e instanceof Error ? e.message : "Error al cobrar" });
        } finally {
            pos.dispatch({ type: "SET_PROCESSING", processing: false });
        }
    }, [pos, tables, ws]);

    // -----------------------------------------------------------------
    // Acciones del numpad
    // -----------------------------------------------------------------
    const handleNumpadKey = useCallback((key: string) => {
        pos.dispatch({ type: "NUMPAD_KEY", key });
    }, [pos]);

    const handleSetMethod = useCallback((m: PaymentMethod | null) => {
        pos.dispatch({ type: "SET_PAYMENT_METHOD", method: m });
    }, [pos]);

    // -----------------------------------------------------------------
    // Pre-cuenta
    // -----------------------------------------------------------------
    const handlePrintPreBill = useCallback(async () => {
        if (pos.state.orderItems.length === 0) {
            setToast({ kind: "err", msg: "No hay productos en la comanda" });
            return;
        }
        const table = tables.find(t => t.id === pos.state.selectedTableId);
        const lines = pos.state.orderItems.map(it => ({
            name:     it.name,
            qty:      it.quantity,
            price:    it.unit_price,
            tax_rate: it.tax_rate ?? 10,
            notes:    it.notes,
        }));
        try {
            if (inTauri) {
                // 1) Tauri → ESC/POS al driver nativo
                await printer.printPreBill({
                    businessName: restaurant?.business_name ?? "MOZONA TPV",
                    cifNif:       restaurant?.cif_nif ?? "—",
                    address:      restaurant?.address ?? "",
                    tableNumber:  table ? String(table.table_number) : undefined,
                    waiterName:   auth.activeWaiter?.name,
                    lines,
                });
                setToast({ kind: "ok", msg: "Pre-cuenta impresa en la impresora local" });
            } else {
                // 2) Web → fallback window.print (diálogo del navegador)
                const w = window.open("", "_blank", "width=380,height=600");
                if (!w) {
                    setToast({ kind: "err", msg: "Permite pop-ups para imprimir la pre-cuenta" });
                    return;
                }
                w.document.write(buildPreBillHtml({ restaurant, table, lines, waiter: auth.activeWaiter }));
                w.document.close();
                w.focus();
                w.print();
                w.close();
                setToast({ kind: "ok", msg: "Diálogo de impresión abierto" });
            }
        } catch (e) {
            setToast({ kind: "err", msg: e instanceof Error ? e.message : "Error al imprimir" });
        }
    }, [pos, tables, restaurant, auth, printer]);

    // -----------------------------------------------------------------
    // Auth
    // -----------------------------------------------------------------
    const handlePinSubmit = useCallback(async (pin: string): Promise<Waiter | null> => {
        const w = await auth.validatePin(pin);
        if (w) {
            setShowAuth(false);
            playOrderDing();
        } else {
            playError();
        }
        return w;
    }, [auth]);

    // -----------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------
    if (loading) {
        return (
            <div className="min-h-dvh bg-[#F0F2F5] flex items-center justify-center text-slate-500 text-[13px]">
                Cargando TPV…
            </div>
        );
    }

    return (
        <div className="h-screen w-full bg-[#F0F2F5] flex flex-col overflow-hidden">
            <PosTopBar
                restaurant={restaurant ?? {
                    id: "rest-demo", slug: "demo", business_name: "MOZONA TPV",
                    cif_nif: "—", address: "",
                    phone: null, primary_color: "#2563EB",
                    ticket_footer_msg: "Gracias por su visita",
                    created_at: new Date().toISOString(),
                }}
                connection={connection}
                lanEndpoint={ws.serverInfo && ws.httpBaseUrl
                    ? ws.httpBaseUrl.replace(/^https?:\/\//, "")
                    : "—"
                }
                cashier={{
                    name: auth.activeWaiter?.name ?? "Cajero",
                    role: auth.activeWaiter?.role ?? "—",
                }}
                onOpenSettings={() => nav("/settings")}
                onOpenCustomerDisplay={() => setToast({ kind: "ok", msg: "Pantalla cliente: pendiente de implementar" })}
                onOpenMenuScanner={() => setToast({ kind: "ok", msg: "Escáner IA: pendiente de implementar" })}
                onShowQR={() => setShowQR(true)}
                onLogout={async () => {
                    await saasAuth.signOut();
                    nav("/auth");
                }}
                localIp={localIp.ip}
                pendingAlerts={recentOrders.length}
            />

            {/* Banner de conexión + acciones rápidas (sm+) */}
            <div className="hidden sm:flex px-5 py-2 bg-white/80 backdrop-blur-md border-b border-slate-200/80 items-center gap-3 text-[11.5px]">
                <span className={`
                    w-2 h-2 rounded-full
                    ${ws.isConnected ? "bg-emerald-500" : "bg-rose-500"}
                `} />
                <span className="text-slate-700 font-semibold">
                    {ws.isConnected ? "LAN WS conectado" : "Sin conexión"}
                </span>
                {ws.latencyMs !== null && (
                    <span className="text-slate-500">· {ws.latencyMs} ms</span>
                )}
                {ws.queueSize > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-mono text-[10px]">
                        {ws.queueSize} en cola
                    </span>
                )}
                <div className="flex-1" />
                {auth.activeWaiter && (
                    <button
                        onClick={() => setShowAuth(true)}
                        className="
                            inline-flex items-center gap-1.5
                            px-2.5 h-7 rounded-lg
                            bg-slate-100 hover:bg-slate-200
                            text-[11px] font-semibold text-slate-700
                            active:scale-95 transition
                        "
                    >
                        <IconUser size={12} strokeWidth={2} />
                        Cambiar
                    </button>
                )}
                {auth.activeWaiter && (
                    <button
                        onClick={() => { auth.logout(); setShowAuth(true); }}
                        className="
                            inline-flex items-center gap-1.5
                            px-2.5 h-7 rounded-lg
                            text-rose-600 hover:bg-rose-50
                            text-[11px] font-semibold
                            active:scale-95 transition
                        "
                    >
                        <IconLogout size={12} strokeWidth={2} />
                    </button>
                )}
            </div>

            {/* Contenido principal: grid en sm+, tabs en <sm ----------- */}
            <main className="flex-1 min-h-0 overflow-hidden sm:p-3 flex flex-col">
                {/* sm+ desktop: los 3 paneles a la vez */}
                <div className="hidden sm:flex h-full min-h-0 w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
                    <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden p-3">
                        <CatalogPanel
                            categories={categories}
                            products={products}
                            tables={tablesWithStatus}
                            selectedCategoryId={pos.state.selectedCategoryId}
                            onSelectCategory={id => pos.dispatch({ type: "SELECT_CATEGORY", categoryId: id })}
                            selectedTableId={pos.state.selectedTableId}
                            onSelectTable={handleSelectTable}
                            onAddProduct={p => pos.dispatch({ type: "ADD_PRODUCT", product: p })}
                        />
                    </div>

                    <div className="w-72 lg:w-80 xl:w-96 shrink-0 h-full border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col">
                        <OrderPanel
                            items={pos.state.orderItems}
                            tableLabel={pos.state.selectedTableLabel}
                            waiterName={auth.activeWaiter?.name ?? null}
                            taxByRate={pos.taxByRate}
                            total={pos.total}
                            itemCount={pos.itemCount}
                            onIncrement={id => pos.dispatch({ type: "INCREMENT_ITEM", itemId: id })}
                            onDecrement={id => pos.dispatch({ type: "DECREMENT_ITEM", itemId: id })}
                            onRemove={id => pos.dispatch({ type: "REMOVE_ITEM", itemId: id })}
                            onClear={() => pos.dispatch({ type: "CLEAR_ORDER" })}
                            onPrintPreBill={handlePrintPreBill}
                        />
                    </div>

                    <div className="w-64 lg:w-72 xl:w-80 shrink-0 h-full border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3 flex flex-col justify-between">
                        <PaymentPanel
                            total={pos.total}
                            paymentAmount={pos.state.paymentAmount}
                            paymentMethod={pos.state.paymentMethod}
                            canCharge={pos.state.orderItems.length > 0 && pos.state.selectedTableId !== null}
                            isProcessing={pos.state.isProcessing}
                            onNumpadKey={handleNumpadKey}
                            onSetMethod={handleSetMethod}
                            onCharge={() => performCharge(pos.state.paymentMethod ?? "CASH", false)}
                            onChargeVeriFactu={() => performCharge(pos.state.paymentMethod ?? "CARD", true)}
                        />
                    </div>
                </div>

                {/* Mobile: un solo panel visible, controlado por tabs --- */}
                <div className="flex-1 min-h-0 sm:hidden">
                    <MobileTabPanel value={mobileTab}>
                        {mobileTab === "catalog" && (
                            <CatalogPanel
                                categories={categories}
                                products={products}
                                tables={tablesWithStatus}
                                selectedCategoryId={pos.state.selectedCategoryId}
                                onSelectCategory={id => pos.dispatch({ type: "SELECT_CATEGORY", categoryId: id })}
                                selectedTableId={pos.state.selectedTableId}
                                onSelectTable={handleSelectTable}
                                onAddProduct={p => pos.dispatch({ type: "ADD_PRODUCT", product: p })}
                            />
                        )}
                        {mobileTab === "order" && (
                            <OrderPanel
                                items={pos.state.orderItems}
                                tableLabel={pos.state.selectedTableLabel}
                                waiterName={auth.activeWaiter?.name ?? null}
                                taxByRate={pos.taxByRate}
                                total={pos.total}
                                itemCount={pos.itemCount}
                                onIncrement={id => pos.dispatch({ type: "INCREMENT_ITEM", itemId: id })}
                                onDecrement={id => pos.dispatch({ type: "DECREMENT_ITEM", itemId: id })}
                                onRemove={id => pos.dispatch({ type: "REMOVE_ITEM", itemId: id })}
                                onClear={() => pos.dispatch({ type: "CLEAR_ORDER" })}
                                onPrintPreBill={handlePrintPreBill}
                            />
                        )}
                        {mobileTab === "payment" && (
                            <PaymentPanel
                                total={pos.total}
                                paymentAmount={pos.state.paymentAmount}
                                paymentMethod={pos.state.paymentMethod}
                                canCharge={pos.state.orderItems.length > 0 && pos.state.selectedTableId !== null}
                                isProcessing={pos.state.isProcessing}
                                onNumpadKey={handleNumpadKey}
                                onSetMethod={handleSetMethod}
                                onCharge={() => performCharge(pos.state.paymentMethod ?? "CASH", false)}
                                onChargeVeriFactu={() => performCharge(pos.state.paymentMethod ?? "CARD", true)}
                            />
                        )}
                    </MobileTabPanel>
                </div>
            </main>

            {/* Tab bar móvil (<sm) =================================== */}
            <MobileTabBar
                value={mobileTab}
                itemCount={pos.itemCount}
                onChange={setMobileTab}
            />

            {/* Toast de notificación */}
            {toast && (
                <div
                    className={`
                        fixed top-20 left-1/2 -translate-x-1/2 z-50
                        px-4 py-2.5 rounded-2xl shadow-lg
                        flex items-center gap-2
                        text-[13px] font-semibold
                        animate-[fadeInDown_0.2s_ease-out]
                        ${toast.kind === "ok"
                            ? "bg-emerald-600 text-white"
                            : "bg-rose-600 text-white"
                        }
                    `}
                >
                    {toast.kind === "ok"
                        ? <IconCheck size={16} strokeWidth={2.4} />
                        : <IconBell  size={16} strokeWidth={2.4} />}
                    {toast.msg}
                </div>
            )}

            {/* Panel de comandas recientes (overlay compacto, sm+) === */}
            {recentOrders.length > 0 && (
                <aside
                    className="
                        hidden sm:block
                        fixed bottom-3 left-1/2 -translate-x-1/2 z-30
                        max-w-2xl w-[min(100%-1.5rem,42rem)]
                        bg-white rounded-2xl border border-slate-200/80 shadow-lg
                        px-3 py-2
                    "
                >
                    <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.15em] text-slate-500 uppercase mb-1.5">
                        <IconSparkles size={12} strokeWidth={2} />
                        Comandas recientes
                    </div>
                    <div className="flex gap-2 overflow-x-auto">
                        {recentOrders.map(o => (
                            <div
                                key={o.id}
                                className="
                                    shrink-0 inline-flex items-center gap-2
                                    px-2.5 py-1 rounded-lg
                                    bg-emerald-50 text-emerald-800
                                    text-[11.5px] font-semibold
                                    border border-emerald-200/80
                                "
                            >
                                <IconReceipt size={12} strokeWidth={2} />
                                Mesa {o.tableNumber} · {o.waiter}
                            </div>
                        ))}
                    </div>
                </aside>
            )}

            {/* Modal de PIN */}
            <PinAuthModal
                isOpen={showAuth}
                pinLength={4}
                title="Cajero · Acceso"
                subtitle="Introduce tu PIN para operar el TPV"
                onSubmit={handlePinSubmit}
                onCancel={() => setShowAuth(false)}
            />

            {/* Modal QR camareros */}
            {showQR && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm
                                flex items-center justify-center p-5"
                     onClick={() => setShowQR(false)}>
                    <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6
                                    text-center"
                         onClick={e => e.stopPropagation()}>
                        <div className="text-[18px] font-black tracking-tight text-slate-900">
                            Conectar comandero
                        </div>
                        <div className="mt-1 text-[12px] text-slate-500">
                            Escanea con la cámara del móvil del camarero
                        </div>
                        {localIp.baseUrl ? (
                            <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                                <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=1&data=${encodeURIComponent(`${localIp.baseUrl}/waiter`)}`}
                                    alt="QR"
                                    width={240} height={240}
                                    className="rounded-xl mx-auto"
                                />
                                <div className="mt-3 font-mono text-[13px] font-bold text-slate-900 break-all">
                                    {localIp.baseUrl}/waiter
                                </div>
                                <div className="mt-1 text-[10.5px] text-slate-400">
                                    Fuente: {localIp.source}
                                </div>
                            </div>
                        ) : (
                            <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-[12px] text-amber-700">
                                No se ha detectado la IP local.  Configúrala en Ajustes.
                            </div>
                        )}
                        <button onClick={() => setShowQR(false)}
                                className="mt-4 h-11 w-full rounded-xl bg-slate-100 hover:bg-slate-200
                                           text-[13px] font-bold text-slate-700 active:scale-95 transition">
                            Cerrar
                        </button>
                    </div>
                </div>
            )}

            {/* Estado del pedido para debugging visual (sólo en dev) */}
            {import.meta.env.DEV && (
                <DebugPanel
                    state={pos.state}
                    pos={pos}
                    wsState={ws.state}
                    wsQueue={ws.queueSize}
                />
            )}
        </div>
    );
}

// ---------------------------------------------------------------------
// MobileTabBar: barra de pestañas inferior en <sm
// ---------------------------------------------------------------------

function MobileTabBar({
    value, itemCount, onChange,
}: {
    value:     MobileTab;
    itemCount: number;
    onChange:  (tab: MobileTab) => void;
}) {
    return (
        <nav
            className="
                sm:hidden
                fixed bottom-0 inset-x-0 z-30
                bg-white/95 backdrop-blur-xl
                border-t border-slate-200/80
                shadow-[0_-4px_20px_-4px_rgb(0_0_0_/_0.08)]
                pb-[max(0.5rem,env(safe-area-inset-bottom))]
            "
            role="tablist"
        >
            <div className="grid grid-cols-3 h-16">
                <TabButton
                    active={value === "catalog"}
                    onClick={() => onChange("catalog")}
                    icon={<IconStore size={20} strokeWidth={1.8} />}
                    label="Carta"
                />
                <TabButton
                    active={value === "order"}
                    onClick={() => onChange("order")}
                    icon={<IconReceipt size={20} strokeWidth={1.8} />}
                    label="Comanda"
                    badge={itemCount > 0 ? itemCount : undefined}
                />
                <TabButton
                    active={value === "payment"}
                    onClick={() => onChange("payment")}
                    icon={<IconCash size={20} strokeWidth={1.8} />}
                    label="Cobro"
                />
            </div>
        </nav>
    );
}

function TabButton({
    active, onClick, icon, label, badge,
}: {
    active:  boolean;
    onClick: () => void;
    icon:    React.ReactNode;
    label:   string;
    badge?:  number;
}) {
    return (
        <button
            onClick={onClick}
            role="tab"
            aria-selected={active}
            className={cn(
                "relative flex flex-col items-center justify-center gap-0.5",
                "transition active:scale-95",
                active
                    ? "text-blue-600"
                    : "text-slate-500 hover:text-slate-700"
            )}
        >
            {active && (
                <span className="
                    absolute top-0 inset-x-3 h-0.5
                    bg-blue-600 rounded-b-full
                " />
            )}
            <div className="relative">
                {icon}
                {badge !== undefined && (
                    <span className="
                        absolute -top-1 -right-2
                        min-w-[16px] h-4 px-1
                        rounded-full
                        bg-rose-500 text-white
                        text-[9px] font-black
                        flex items-center justify-center
                        ring-2 ring-white
                    ">
                        {badge}
                    </span>
                )}
            </div>
            <span className={cn(
                "text-[10.5px] font-bold tracking-wide",
                active ? "text-blue-600" : "text-slate-500"
            )}>
                {label}
            </span>
        </button>
    );
}

function MobileTabPanel({ value, children }: { value: MobileTab; children: React.ReactNode }) {
    return (
        <div
            key={value}
            className="
                h-full
                animate-slide-up
            "
        >
            {children}
        </div>
    );
}

// ---------------------------------------------------------------------
// Debug panel (sólo en desarrollo)
// ---------------------------------------------------------------------

function DebugPanel({
    state, pos, wsState, wsQueue,
}: {
    state:    PosState;
    pos:      ReturnType<typeof usePosReducer>;
    wsState:  string;
    wsQueue:  number;
}) {
    return (
        <details className="fixed top-2 right-2 z-40 max-w-xs bg-amber-50 border border-amber-300 rounded-lg text-[10px] font-mono p-2 shadow">
            <summary className="cursor-pointer font-bold">Debug</summary>
            <div className="mt-1 space-y-0.5">
                <div>WS: {wsState} (queue={wsQueue})</div>
                <div>Items: {state.orderItems.length}</div>
                <div>Total: {pos.total.toFixed(2)} €</div>
                <div>Table: {state.selectedTableLabel ?? "—"}</div>
                <div>Method: {state.paymentMethod ?? "—"}</div>
            </div>
        </details>
    );
}
