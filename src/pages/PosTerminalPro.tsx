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
import { useWebSocket } from "../context/WebSocketContext";
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
import { subscribeToOrders, listOpenOrders } from "../lib/orders";
import { isVipOrAdmin } from "../lib/vip";
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
    // Formato español: 9,00 € (coma decimal, 2 decimales, símbolo euro con espacio)
    const fmt = (n: number) => n.toFixed(2).replace(".", ",") + " €";

    // Desglose IVA: precios YA incluyen IVA → base = gross / (1 + rate/100)
    // El cliente paga exactamente la suma de los precios de carta.
    const byRate = new Map<number, number>();
    let gross = 0;
    for (const l of lines) {
        gross += l.qty * l.price;
        const r = l.tax_rate ?? 10;
        byRate.set(r, (byRate.get(r) ?? 0) + l.qty * l.price);
    }
    // Generar filas individuales (no concatenadas en una sola cadena)
    // para poder formatearlas con el helper lineRow (flexbox)
    const taxBreakdownLines: Array<{ label: string; value: string }> = [];
    Array.from(byRate.entries())
        .sort((a, b) => b[0] - a[0])
        .forEach(([r, g]) => {
            const base = g / (1 + r / 100);
            const tax  = g - base;
            taxBreakdownLines.push({ label: `Base (${r}%):`,    value: fmt(base) });
            taxBreakdownLines.push({ label: `I.V.A. (${r}%):`, value: fmt(tax)  });
        });

    // Helper: formatea una línea con label a la izquierda y precio a la derecha,
    // usando caracteres de espacio y puntos para que se alinee perfecto en
    // cualquier fuente monoespaciada.
    const lineRow = (label: string, value: string, bold = false): string => {
        const cls = bold ? "row b" : "row";
        return `<div class="${cls}"><span class="lbl">${label}</span><span class="val">${value}</span></div>`;
    };
    const noteRow = (txt: string): string =>
        `<div class="row meta"><span class="lbl">&nbsp;&nbsp;&gt; ${txt}</span></div>`;
    const itemRow = (l: { name: string; qty: number; price: number; notes?: string }): string => {
        const line = l.qty > 1 ? `${l.qty}x ${l.name}` : `1x ${l.name}`;
        const pr   = fmt(l.qty * l.price);
        // Item con flex de 2 columnas: nombre izquierda, precio derecha
        return `<div class="item-row"><span class="item-name">${line.replace(/</g, "&lt;")}</span><span class="item-price">${pr}</span></div>`
             + (l.notes ? noteRow(l.notes.replace(/</g, "&lt;")) : "");
    };

    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Pre-cuenta</title>
<style>
  /* Ocultar todo lo que no sea el ticket al imprimir */
  @media print {
    body * { visibility: hidden; }
    #ticket-print-area, #ticket-print-area * { visibility: visible; }
    #ticket-print-area {
      position: absolute;
      left: 0; top: 0;
      width: 58mm;
      max-width: 58mm;
      box-sizing: border-box;
      margin: 0;
      padding: 1mm 2mm;
      color: #000000 !important;
      background: #ffffff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      font-family: 'Courier New', Courier, monospace !important;
      font-size: 12px !important;
      font-weight: 800 !important;
      line-height: 1.2 !important;
      letter-spacing: 0;
      -webkit-font-smoothing: none !important;
      text-rendering: geometricPrecision !important;
      overflow: visible !important;
    }
    @page { size: auto; margin: 0; }
  }
  /* Vista en pantalla: para previsualizar en la nueva ventana */
  body  { font-family: 'Courier New', Courier, monospace; background: #f5f5f5; margin: 0; padding: 12px; }
  #ticket-print-area {
    background: #ffffff;
    color: #000000;
    width: 80mm;
    max-width: 100%;
    margin: 0 auto;
    padding: 4mm;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.25;
    box-sizing: border-box;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }
  h1    { font-size: 14px; font-weight: 900; text-align: center; margin: 0 0 2px; letter-spacing: -0.5px; word-wrap: break-word; }
  .ctr  { text-align: center; }
  .sep  { font-family: 'Courier New', Courier, monospace; font-size: 11px; color: #000; margin: 3px 0; white-space: pre; overflow: hidden; }
  /* Filas label + valor con FLEXBOX: nombre izquierda, importe derecha */
  .row  { display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; width: 100%; }
  .row .lbl { flex: 1 1 auto; min-width: 0; word-wrap: break-word; overflow-wrap: anywhere; }
  .row .val { flex: 0 0 auto; white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
  /* Items: el nombre puede ocupar varias líneas pero el precio se mantiene a la derecha */
  .item-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; width: 100%; }
  .item-row .item-name { flex: 1 1 auto; min-width: 0; word-wrap: break-word; overflow-wrap: break-word; }
  .item-row .item-price { flex: 0 0 auto; white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
  .total{ font-weight: 900; font-size: 14px; }
  .meta { font-size: 11px; font-weight: 700; }
  .b    { font-weight: 900; }
  .b .val { font-weight: 900; }
  /* Bloque mesa/camarero: filas alineadas con etiqueta fija */
  .meta-block { display: block; margin: 0; padding: 0; }
  .kv {
    display: grid;
    grid-template-columns: 22mm 1fr;
    align-items: baseline;
    gap: 2mm;
    width: 100%;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.3;
  }
  .kv .k { color: #000; text-align: left; }
  .kv .v { color: #000; text-align: right; font-variant-numeric: tabular-nums; word-break: break-word; }
  .kv .b { font-weight: 900; }
</style>
</head>
<body>
<div id="ticket-print-area">
  ${(restaurant as any)?.ticket_header_msg ? `<div class="ctr meta b">${String((restaurant as any).ticket_header_msg).replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div>` : ""}
  <h1>${(restaurant?.business_name ?? "MOZONA TPV").replace(/</g, "&lt;")}</h1>
  <div class="ctr meta">${(restaurant?.address ?? "").replace(/</g, "&lt;")}</div>
  <div class="ctr meta">NIF/CIF: ${restaurant?.cif_nif ?? "—"}</div>
  ${restaurant?.phone ? `<div class="ctr meta">Tel: ${String(restaurant.phone).replace(/</g, "&lt;")}</div>` : ""}
  <div class="sep">${"─".repeat(32)}</div>
  ${table && table.table_number != null || (waiter && waiter.name)
    ? `<div class="meta-block">
        ${table && table.table_number != null
          ? `<div class="kv"><span class="k">Mesa:</span><span class="v b">${String(table.table_number).replace(/</g, "&lt;")}</span></div>`
          : ""}
        ${(() => {
            // Si el waiter es "Cajero Demo" / "Modo Demo" (PIN maestro
            // sin camareros), usamos el nombre del tenant como fallback.
            const wn = waiter?.name ?? "";
            const isDemo = /demo/i.test(wn) && !wn.includes("Casablanca") && !wn.includes("MOZONA");
            const displayName = isDemo
                ? (restaurant?.business_name ?? "MOZONA TPV")
                : wn;
            return displayName
                ? `<div class="kv"><span class="k">Camarero:</span><span class="v b">${String(displayName).replace(/</g, "&lt;")}</span></div>`
                : "";
        })()}
      </div>`
    : ""}
  <div class="sep">${"─".repeat(32)}</div>
  ${lines.map(itemRow).join("")}
  <div class="sep">${"─".repeat(32)}</div>
  ${taxBreakdownLines.map(t => lineRow(t.label, t.value)).join("")}
  <div class="sep">${"═".repeat(32)}</div>
  ${lineRow("TOTAL", fmt(gross), true)}
  <div class="sep">${"─".repeat(32)}</div>
  <div class="ctr" style="margin-top:4px;font-weight:900;">— PRE-CUENTA —</div>
  ${(restaurant as any)?.ticket_footer_msg ? `<div class="ctr meta" style="margin-top:4px;">${String((restaurant as any).ticket_footer_msg).replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div>` : ""}
  <div class="sep">${"─".repeat(32)}</div>
</div>
<script>window.onload = () => setTimeout(() => { window.print(); }, 300);</script>
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
    const [catalogSearch, setCatalogSearch] = useState("");

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

        const off1 = ws.subscribe("ORDER_SENT", (env: any) => {
            const d = env.data;
            handleOrderReceived(d);
        });
        const off2 = ws.subscribe("TABLE_STATUS_CHANGED", (env: any) => {
            setTableStatuses(prev => ({ ...prev, [env.data.tableId]: env.data.newStatus }));
        });
        const off3 = ws.subscribe("INVOICE_PAID", (env: any) => {
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
    // Realtime: escuchar INSERTs en `orders` desde Supabase
    // (para que las comandas de los camareros aparezcan en el TPV
    //  incluso si el WebSocket local no funciona en cloud)
    // -----------------------------------------------------------------
    useEffect(() => {
        if (!restaurant?.id) return;
        const off = subscribeToOrders(restaurant.id, (order) => {
            console.log("[PosTerminalPro] nueva comanda vía Supabase:", order.id);
            // Marcar la mesa como ocupada
            if (order.table_id) {
                setTableStatuses(prev => ({ ...prev, [order.table_id!]: "OCCUPIED" }));
            }
            // Sonido
            void unlockAudio();
            playOrderDing();
        });
        return off;
    }, [restaurant?.id]);

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
    // FIX: handler robusto que tolera mesas dummy (local-table-*) y
    // mesas reales, con try-catch y logging para diagnóstico
    // -----------------------------------------------------------------
    const handleSelectTable = useCallback((id: string | null) => {
        try {
            console.log("[PosTerminalPro] click mesa id=", id, " tablesCount=", tables.length);
            if (id === null) {
                pos.dispatch({ type: "SELECT_TABLE", tableId: null, tableLabel: null });
                return;
            }
            const t = tables.find(tb => tb.id === id);
            if (!t) {
                // Fallback: mesa dummy (local-table-N) — buscar por número
                const numMatch = /local-table-(\d+)/.exec(id);
                if (numMatch) {
                    console.log("[PosTerminalPro] mesa dummy detectada, número=", numMatch[1]);
                    pos.dispatch({
                        type: "SELECT_TABLE",
                        tableId: id,
                        tableLabel: numMatch[1],
                    });
                    pos.dispatch({ type: "SELECT_CATEGORY", categoryId: null });
                    return;
                }
                console.warn("[PosTerminalPro] mesa no encontrada:", id);
                return;
            }
            console.log("[PosTerminalPro] mesa encontrada:", t.table_number);
            pos.dispatch({ type: "SELECT_TABLE", tableId: t.id, tableLabel: t.table_number });
            pos.dispatch({ type: "SELECT_CATEGORY", categoryId: null });
        } catch (e) {
            console.error("[PosTerminalPro] handleSelectTable error:", e);
        }
    }, [tables, pos]);

    // -----------------------------------------------------------------
    // Selección de mesa desde el array real (sobrescribe estado en vivo)
    // -----------------------------------------------------------------
    const tablesWithStatus = useMemo(() => {
        const real = tables.map(t => ({ ...t, status: tableStatuses[t.id] ?? t.status }));
        // Si hay menos de 16 mesas, rellenamos con mesas dummy 1..16
        if (real.length >= 16) return real;
        const seen = new Set(real.map(t => String(t.table_number)));
        const filler: typeof real = [];
        for (let i = 1; i <= 16; i++) {
            if (!seen.has(String(i))) {
                filler.push({
                    id: `local-table-${i}`,
                    restaurant_id: real[0]?.restaurant_id ?? "local",
                    zone_id: null,
                    zone: null,
                    table_number: String(i),
                    status: "FREE",
                } as typeof real[number]);
            }
        }
        return [...real, ...filler].slice(0, 16);
    }, [tables, tableStatuses]);

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
        <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-100 dark:bg-slate-900">
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
                    {ws.isConnected ? "Conectado a la nube" : "Sin conexión"}
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

            {/* Contenido principal: layout 70/30 (izquierda/derecha) */}
            <main className="hidden sm:flex flex-1 min-h-0 w-full p-2.5 gap-2.5 overflow-hidden">
              
              {/* COLUMNA IZQUIERDA (70% de ancho total) */}
              <div className="w-[70%] h-full flex flex-col gap-2.5 overflow-hidden">
                {/* Superior Izquierda: Mesas (altura fija compacta) */}
                <section className="h-44 shrink-0 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 shadow-sm flex flex-col justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mesas (1–16)</span>
                  <div className="grid grid-cols-8 gap-2 my-auto">
                    {tablesWithStatus.slice(0, 16).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleSelectTable(t.id === pos.state.selectedTableId ? null : t.id)}
                        className={cn(
                          "h-10 text-sm font-bold rounded-lg flex items-center justify-center transition-colors",
                          pos.state.selectedTableId === t.id
                            ? "bg-blue-500 text-white ring-2 ring-offset-1 ring-blue-600"
                            : t.status === "FREE"
                            ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                            : t.status === "OCCUPIED"
                            ? "bg-blue-100 text-blue-800 hover:bg-blue-200"
                            : t.status === "BILL_REQUESTED"
                            ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                            : t.status === "RESERVED"
                            ? "bg-violet-100 text-violet-800 hover:bg-violet-200"
                            : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                        )}
                      >
                        <span className="tabular-nums">{t.table_number}</span>
                      </button>
                    ))}
                  </div>
                </section>

                {/* Inferior Izquierda: Menú y Categorías (resto del alto) */}
                <section className="flex-1 min-h-0 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 shadow-sm flex flex-col overflow-hidden">
                  <CatalogPanel
                    categories={categories}
                    products={products}
                    tables={tablesWithStatus}
                    selectedCategoryId={pos.state.selectedCategoryId}
                    onSelectCategory={(id: any) => pos.dispatch({ type: "SELECT_CATEGORY", categoryId: id })}
                    selectedTableId={pos.state.selectedTableId}
                    onSelectTable={handleSelectTable}
                    onAddProduct={(p: any) => pos.dispatch({ type: "ADD_PRODUCT", product: p })}
                    variant="full"
                    search={catalogSearch}
                    onSearchChange={setCatalogSearch}
                  />
                </section>
              </div>

              {/* COLUMNA DERECHA (30% de ancho total, dividida 50% / 50% de alto) */}
              <div className="w-[30%] h-full flex flex-col gap-2.5 overflow-hidden">
                {/* Superior Derecha: Comanda (50% de alto) */}
                <section className="h-1/2 min-h-0 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col">
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
                </section>

                {/* Inferior Derecha: Cobro y Teclado (50% de alto) */}
                <section className="h-1/2 min-h-0 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 shadow-sm flex flex-col justify-between overflow-hidden">
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
                </section>
              </div>
            </main>

            {/* Vista móvil: un solo panel visible, controlado por tabs */}
            <main className="flex sm:hidden flex-1 min-h-0 w-full overflow-hidden">

                <div className="flex-1 min-h-0">
                    <MobileTabPanel value={mobileTab}>
                        {mobileTab === "catalog" && (
                            <CatalogPanel
                                categories={categories}
                                products={products}
                                tables={tablesWithStatus}
                                selectedCategoryId={pos.state.selectedCategoryId}
                                onSelectCategory={(id: any) => pos.dispatch({ type: "SELECT_CATEGORY", categoryId: id })}
                                selectedTableId={pos.state.selectedTableId}
                                onSelectTable={handleSelectTable}
                                onAddProduct={(p: any) => pos.dispatch({ type: "ADD_PRODUCT", product: p })}
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
                    wsState={ws.status}
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
