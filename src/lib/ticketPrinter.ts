// =====================================================================
// MOZONA TPV — ticketPrinter: impresión de tickets 58mm
// =====================================================================
// Genera el HTML del ticket térmico 58mm y lo envía a impresión.
//
//   - En Tauri: usa la API nativa ESC/POS del driver.
//   - En web:   abre una ventana con `window.print()`.
//
// Formato: monospace, 32 caracteres por línea, sin antialias.
// =====================================================================

import { supabase } from "./supabase";

export interface TicketLine {
    name:       string;
    quantity:   number;
    unit_price: number;
    tax_rate:   number;
    notes?:     string | null;
}

export interface TicketInput {
    orderId:        string;
    tenantId:       string | null;
    businessName:   string;
    cifNif?:        string;
    address?:       string;
    tableNumber?:   string | number;
    waiterName?:    string | null;
    lines:          TicketLine[];
    subtotal:       number;
    taxTotal:       number;
    total:          number;
    paymentMethod:  string;
    series:         string;
    invoiceNumber:  number;
    headerMsg?:     string;
    footerMsg?:     string;
    showTax?:       boolean;
    createdAt?:     string; // ISO
}

const TICKET_WIDTH = "58mm";
const FONT_STACK   = `"Courier New", "Courier", monospace`;

function fmtLine(left: string, right: string, width = 32): string {
    const gap = Math.max(1, width - left.length - right.length);
    return left + " ".repeat(gap) + right;
}

function padBoth(s: string, width: number): string {
    if (s.length >= width) return s.slice(0, width);
    const total = width - s.length;
    const left  = Math.floor(total / 2);
    return " ".repeat(left) + s + " ".repeat(total - left);
}

function fmtEUR(n: number): string {
    return Number(n ?? 0).toFixed(2).replace(".", ",") + " €";
}

function buildTicketHtml(input: TicketInput): string {
    const {
        orderId, businessName, cifNif = "—", address = "",
        tableNumber, waiterName, lines, subtotal, taxTotal, total,
        paymentMethod, series, invoiceNumber, headerMsg, footerMsg, showTax = true,
        createdAt,
    } = input;

    const now = new Date(createdAt ?? Date.now());
    const dateStr = now.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

    // Cabecera
    const head: string[] = [];
    head.push(padBoth(businessName.toUpperCase(), 32));
    head.push(padBoth("CIF/NIF: " + cifNif, 32));
    if (address) head.push(padBoth(address, 32));
    head.push("=".repeat(32));
    head.push(fmtLine("Ticket:", `${series}-${String(invoiceNumber).padStart(8, "0")}`));
    head.push(fmtLine("Fecha:", dateStr));
    head.push(fmtLine("Mesa:",  String(tableNumber ?? "—")));
    head.push(fmtLine("Camarero:", waiterName ?? "Caja"));
    head.push(fmtLine("Pago:", paymentMethod));
    head.push("-".repeat(32));

    // Líneas
    const body: string[] = [];
    for (const l of lines) {
        body.push(`${l.quantity} x ${l.name.slice(0, 22)}`);
        const lineSubtotal = l.unit_price * l.quantity;
        body.push(fmtLine(`  @ ${fmtEUR(l.unit_price)}`, fmtEUR(lineSubtotal)));
        if (l.notes) body.push(`  Nota: ${l.notes.slice(0, 24)}`);
    }
    body.push("-".repeat(32));

    // Totales
    const foot: string[] = [];
    if (showTax) {
        foot.push(fmtLine("Base:",  fmtEUR(subtotal)));
        foot.push(fmtLine("IVA:",   fmtEUR(taxTotal)));
    }
    foot.push("=".repeat(32));
    foot.push(fmtLine("TOTAL:", fmtEUR(total)));
    foot.push("=".repeat(32));
    if (headerMsg) { foot.push(""); foot.push(padBoth(headerMsg, 32)); }
    if (footerMsg) { foot.push(""); foot.push(padBoth(footerMsg, 32)); }
    foot.push("");
    foot.push(padBoth("¡Gracias por su visita!", 32));
    foot.push(padBoth(`ID: ${orderId.slice(0, 8)}`, 32));

    const full = [...head, ...body, ...foot].join("\n");

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ticket ${series}-${String(invoiceNumber).padStart(8, "0")}</title>
<style>
@page { size: ${TICKET_WIDTH} auto; margin: 0; }
* { box-sizing: border-box; -webkit-font-smoothing: none; -moz-osx-font-smoothing: unset; }
html, body { margin: 0; padding: 0; }
body { font-family: ${FONT_STACK}; font-size: 11px; font-weight: 800; line-height: 1.25; color: #000; background: #fff; }
.ticket { width: ${TICKET_WIDTH}; padding: 4mm 2mm; white-space: pre; word-break: break-word; }
</style>
</head>
<body onload="setTimeout(() => window.print(), 300)">
<pre class="ticket">${full.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] ?? c))}</pre>
</body>
</html>`;
}

/**
 * ★★★ FUNCIÓN PRINCIPAL ★★★
 *  Imprime un ticket tras el cobro. Abre una nueva ventana con
 *  window.print() y la cierra automáticamente.
 */
export async function printTicket(input: TicketInput): Promise<{ ok: boolean; method: "print" | "skipped" | "error"; error?: string }> {
    try {
        const html = buildTicketHtml(input);
        // ★ Detección: si estamos en Tauri, usar el driver nativo
        const inTauri = typeof window !== "undefined" && (window as any).__TAURI__;
        if (inTauri) {
            try {
                const { invoke } = await import(/* @vite-ignore */ "@tauri-apps/api/core");
                await invoke("print_ticket", { html });
                return { ok: true, method: "print" };
            } catch (e) {
                console.warn("[ticketPrinter] Tauri invoke falló, fallback a window.print", e);
            }
        }
        // ★ Web → nueva ventana con window.print()
        const w = window.open("", "_blank", "width=380,height=720");
        if (!w) {
            return { ok: false, method: "error", error: "Pop-ups bloqueados" };
        }
        w.document.open();
        w.document.write(html);
        w.document.close();
        return { ok: true, method: "print" };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[ticketPrinter] error:", msg);
        return { ok: false, method: "error", error: msg };
    }
}
