// =====================================================================
// MOZONA TPV — ticketPrinter: impresión de tickets 58mm
// =====================================================================
// Genera el HTML del ticket térmico 58mm y lo envía a impresión.
//
// Estructura:
//   1. Cabecera: solo datos reales del restaurante
//   2. Datos del ticket (serie, fecha, mesa, camarero, pago)
//   3. Líneas de productos (con snapshot de la mesa)
//   4. Totales (base, IVA, TOTAL)
//   5. Pie: despedida + PRE-CUENTA
//   6. MARCA DE SOFTWARE al final: "Software TPV: Mozona TPV"
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
    businessName:   string;          // ★ restaurante real
    cifNif?:        string;          // ★ NIF/CIF
    address?:       string;          // ★ dirección
    phone?:         string;          // ★ teléfono
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
    createdAt?:     string;          // ISO
}

const TICKET_WIDTH = "58mm";
const FONT_STACK   = `"Courier New", Courier, monospace`;

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

/** Convierte caracteres HTML peligrosos a entidades */
function escapeHtml(s: string): string {
    return s.replace(/[<>&"']/g, c =>
        ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] ?? c)
    );
}

function buildTicketHtml(input: TicketInput): string {
    const {
        businessName, cifNif = "—", address = "", phone = "",
        tableNumber, waiterName, lines, subtotal, taxTotal, total,
        paymentMethod, series, invoiceNumber, headerMsg, footerMsg, showTax = true,
        createdAt,
    } = input;

    const now = new Date(createdAt ?? Date.now());
    const dateStr = now.toLocaleString("es-ES", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

    // ============================================================
    // 1. CABECERA: solo datos del restaurante
    // ============================================================
    const head: string[] = [];
    head.push(padBoth(businessName.toUpperCase(), 32));
    if (cifNif && cifNif !== "—") head.push(padBoth("CIF/NIF: " + cifNif, 32));
    if (address) head.push(padBoth(address, 32));
    if (phone) head.push(padBoth("Tel: " + phone, 32));
    head.push("=".repeat(32));
    head.push(fmtLine("Ticket:", `${series}-${String(invoiceNumber).padStart(8, "0")}`));
    head.push(fmtLine("Fecha:", dateStr));
    if (tableNumber) head.push(fmtLine("Mesa:", String(tableNumber)));
    if (waiterName) head.push(fmtLine("Camarero:", waiterName));
    head.push(fmtLine("Pago:", paymentMethod));
    head.push("-".repeat(32));

    // ============================================================
    // 2. LÍNEAS (formato flex via clases)
    // ============================================================
    const body: string[] = [];
    for (const l of lines) {
        const lineSubtotal = l.unit_price * l.quantity;
        body.push(`<div class="ticket-row"><span class="desc">${l.quantity} x ${escapeHtml(l.name.slice(0, 22))}</span></div>`);
        body.push(`<div class="ticket-row"><span class="desc">&nbsp;&nbsp;@ ${fmtEUR(l.unit_price)}</span><span class="price">${fmtEUR(lineSubtotal)}</span></div>`);
        if (l.notes) {
            body.push(`<div class="ticket-row"><span class="desc">&nbsp;&nbsp;Nota: ${escapeHtml(l.notes.slice(0, 24))}</span></div>`);
        }
    }
    body.push('<hr class="ticket-divider" />');

    // ============================================================
    // 3. TOTALES
    // ============================================================
    const foot: string[] = [];
    if (showTax) {
        foot.push(`<div class="ticket-row"><span class="desc">Base:</span><span class="price">${fmtEUR(subtotal)}</span></div>`);
        foot.push(`<div class="ticket-row"><span class="desc">IVA:</span><span class="price">${fmtEUR(taxTotal)}</span></div>`);
    }
    foot.push('<hr class="ticket-divider" />');
    foot.push(`<div class="ticket-row ticket-total"><span class="desc">TOTAL:</span><span class="price">${fmtEUR(total)}</span></div>`);
    foot.push('<hr class="ticket-divider" />');

    // ============================================================
    // 4. MENSAJES
    // ============================================================
    if (headerMsg) {
        foot.push(`<div class="ticket-row"><span class="desc" style="text-align:center">${escapeHtml(headerMsg)}</span></div>`);
    }
    if (footerMsg) {
        foot.push(`<div class="ticket-row"><span class="desc" style="text-align:center">${escapeHtml(footerMsg)}</span></div>`);
    }
    foot.push(`<div class="ticket-row"><span class="desc" style="text-align:center">¡Gracias por su visita!</span></div>`);
    foot.push(`<div class="ticket-row"><span class="desc" style="text-align:center">ID: ${(input.orderId || "").slice(0, 8)}</span></div>`);

    // ============================================================
    // 5. MARCA DE SOFTWARE (watermark al final)
    // ============================================================
    foot.push(`<div class="ticket-footer-brand">Software TPV: Mozona TPV</div>`);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ticket ${series}-${String(invoiceNumber).padStart(8, "0")}</title>
<style>
@page { size: ${TICKET_WIDTH} auto; margin: 0; }
* { box-sizing: border-box; -webkit-font-smoothing: none; -moz-osx-font-smoothing: unset; }
html, body { margin: 0; padding: 0; }
body { font-family: ${FONT_STACK}; font-size: 11px; font-weight: 700; line-height: 1.25; color: #000; background: #fff; }
.ticket { width: ${TICKET_WIDTH}; padding: 4mm 2mm; white-space: pre; word-break: break-word; }
.ticket-row { display: flex; justify-content: space-between; align-items: baseline; width: 100%; margin-bottom: 1.5px; }
.ticket-row .desc { flex: 1 1 auto; text-align: left; word-break: break-word; padding-right: 4px; }
.ticket-row .price { flex: 0 0 auto; text-align: right; white-space: nowrap; }
.ticket-divider { border: none; border-top: 1px dashed #000; margin: 3px 0; }
.ticket-total { font-size: 14px; font-weight: 900; }
.ticket-footer-brand { margin-top: 6px; font-size: 9.5px; text-align: center; letter-spacing: 0.5px; }
</style>
</head>
<body onload="setTimeout(() => window.print(), 300)">
<div class="ticket" id="ticket-print-area">
${[...head, ...body, ...foot].join("\n")}
</div>
</body>
</html>`;

    return html;
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
