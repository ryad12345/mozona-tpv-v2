// =====================================================================
// MOZONA TPV — ticketPrinter: impresión de tickets 58mm / 80mm (v3.2.0)
// =====================================================================
// REESCRITO: usa texto monospace plano (sin tablas HTML) para máxima
// compatibilidad con impresoras térmicas.
//
// CHARS_PER_LINE:
//   - 58mm Font A: 32 chars
//   - 80mm Font A: 42 chars
//
// Estructura del ticket:
//   1. Cabecera (nombre empresa, NIF, dirección, teléfono)
//   2. Datos del ticket (serie, fecha/hora, mesa, camarero, pago)
//   3. Líneas de productos
//   4. Desglose IVA + Total
//   5. Pie (footer, brand)
// =====================================================================

import { loadTicketSettings, type TicketSettings, companyFromSettingsWithLocal } from "./ticketSettings";

export interface TicketLine {
    name: string;
    quantity: number;
    unit_price: number;
    tax_rate?: number;
}

export interface TicketOptions {
    lines: TicketLine[];
    series: string;             // e.g. "PRE" o "T-F"
    invoiceNumber: number;      // número secuencial
    tableNumber?: number | null;
    waiterName?: string | null;
    paymentMethod?: string;     // "Efectivo", "Tarjeta", etc.
    createdAt: number;          // timestamp ms
    orderId?: string;
    showTax?: boolean;          // mostrar desglose IVA
    headerMsg?: string;
    footerMsg?: string;
    settings?: TicketSettings | null;
    paperWidth?: 58 | 80;       // ancho del rollo
}

const DEFAULT_COMPANY = {
    name: "MOZONA TPV",
    nif: "",
    address: "",
    phone: "",
};

const FONT_STACK = `'Courier New', Courier, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

// ★ v3.2.0: CHARS_PER_LINE según ancho del rollo
//  - 58mm Font A: 32 chars
//  - 80mm Font A: 42 chars
const CHARS_BY_WIDTH: Record<number, number> = {
    58: 32,
    80: 42,
};
const DEFAULT_CHARS = 32;

// ════════════════════════════════════════════════════════════════
// ★ HELPERS DE FORMATO (texto plano, monospace)
// ════════════════════════════════════════════════════════════════

/** Limpia caracteres que no se imprimen bien en tickets térmicos */
function cleanText(s: any): string {
    if (s == null) return "";
    return String(s)
        .replace(/[áàäâ]/gi, "a")
        .replace(/[éèëê]/gi, "e")
        .replace(/[íìïî]/gi, "i")
        .replace(/[óòöô]/gi, "o")
        .replace(/[úùüû]/gi, "u")
        .replace(/[ñ]/gi, "n")
        .replace(/[ç]/gi, "c")
        .replace(/[ÁÀÄÂ]/g, "A")
        .replace(/[ÉÈËÊ]/g, "E")
        .replace(/[ÍÌÏÎ]/g, "I")
        .replace(/[ÓÒÖÔ]/g, "O")
        .replace(/[ÚÙÜÛ]/g, "U")
        .replace(/[Ñ]/g, "N")
        .replace(/[Ç]/g, "C")
        .replace(/[°ºª]/g, ".")
        .replace(/[€]/g, "EUR")
        .replace(/[—–-]/g, "-")
        .replace(/[''´`]/g, "'")
        .replace(/[""]/g, '"')
        .replace(/[^\x20-\x7E]/g, "") // quitar chars no-ASCII
        .trim();
}

/** Padding derecho a N chars (trunca si excede) */
function padRight(s: string, n: number): string {
    s = cleanText(s);
    if (s.length >= n) return s.slice(0, n);
    return s + " ".repeat(n - s.length);
}

/** Padding izquierdo a N chars */
function padLeft(s: string, n: number): string {
    s = cleanText(s);
    if (s.length >= n) return s.slice(0, n);
    return " ".repeat(n - s.length) + s;
}

/** Línea con label a la izquierda y valor a la derecha */
function fmtLine(left: string, right: string, width: number): string {
    left = cleanText(left);
    right = cleanText(right);
    if (left.length + right.length >= width) {
        // Si no caben juntos, poner en 2 líneas
        if (left.length >= width) left = left.slice(0, width);
        if (right.length >= width) right = right.slice(0, width);
        return padRight(left, width) + "\n" + padLeft(right, width);
    }
    return padRight(left, width - right.length) + right;
}

/** Línea centrada */
function center(s: string, width: number): string {
    s = cleanText(s);
    if (s.length >= width) return s.slice(0, width);
    const pad = Math.floor((width - s.length) / 2);
    return " ".repeat(pad) + s;
}

/** Línea de separador */
function sep(width: number, char = "-"): string {
    return char.repeat(width);
}

/** Corta string a width SIN word break, añade "..." si lo corta */
function truncStr(s: string, n: number): string {
    s = cleanText(s);
    if (s.length <= n) return s;
    if (n <= 1) return s.slice(0, n);
    return s.slice(0, n - 1) + ".";
}

/** Wrap multi-línea (corta por palabras) */
function wrap(s: string, width: number): string[] {
    s = cleanText(s);
    if (!s) return [""];
    if (s.length <= width) return [s];
    const out: string[] = [];
    let remaining = s;
    while (remaining.length > width) {
        // buscar último espacio antes de width
        let cut = remaining.lastIndexOf(" ", width);
        if (cut <= 0) cut = width; // sin espacios, cortar duro
        out.push(remaining.slice(0, cut));
        remaining = remaining.slice(cut).trimStart();
    }
    if (remaining) out.push(remaining);
    return out;
}

/** Formato EUR sin símbolo (las impresoras a veces no lo tienen) */
function fmtEUR(n: number): string {
    const v = Number(n) || 0;
    return v.toFixed(2).replace(".", ",") + " EUR";
}

/** Formato fecha/hora */
function fmtDateTime(ts: number): { date: string; time: string } {
    try {
        const d = new Date(ts);
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const yy = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, "0");
        const mi = String(d.getMinutes()).padStart(2, "0");
        return { date: `${dd}/${mm}/${yy}`, time: `${hh}:${mi}` };
    } catch (_) {
        return { date: "—", time: "—" };
    }
}

/** Resumen de IVA por tasa */
function summarizeVat(lines: TicketLine[]): { rate: number; base: number; tax: number }[] {
    const map = new Map<number, { base: number; tax: number }>();
    for (const l of lines) {
        const rate = Number(l.tax_rate ?? 10);
        const qty = Number(l.quantity || 0);
        const price = Number(l.unit_price || 0);
        const lineSub = qty * price; // base imponible
        const tax = lineSub * rate / 100;
        const cur = map.get(rate) || { base: 0, tax: 0 };
        cur.base += lineSub;
        cur.tax += tax;
        map.set(rate, cur);
    }
    return Array.from(map.entries())
        .map(([rate, v]) => ({ rate, base: v.base, tax: v.tax }))
        .sort((a, b) => a.rate - b.rate);
}

// ════════════════════════════════════════════════════════════════
// ★ FUNCIÓN PRINCIPAL: construir el ticket (texto plano)
// ════════════════════════════════════════════════════════════════

export function buildTicketText(opts: TicketOptions): string {
    const W = CHARS_BY_WIDTH[opts.paperWidth || 58] || DEFAULT_CHARS;
    const settings = opts.settings;
    const company = settings
        ? companyFromSettingsWithLocal(settings)
        : { name: DEFAULT_COMPANY.name, nif: "", address: "", phone: "" };

    const { date, time } = fmtDateTime(opts.createdAt);
    const vatSummary = summarizeVat(opts.lines);

    let subtotal = 0;
    let totalTax = 0;
    for (const l of opts.lines) {
        const sub = Number(l.unit_price || 0) * Number(l.quantity || 0);
        const rate = Number(l.tax_rate ?? 10);
        subtotal += sub;
        totalTax += sub * rate / 100;
    }
    const total = subtotal + totalTax;

    const lines: string[] = [];

    // 1. CABECERA - Nombre del negocio
    const nameToShow = (opts.headerMsg && opts.headerMsg.trim())
        || company.name
        || DEFAULT_COMPANY.name;
    lines.push(center(nameToShow.toUpperCase(), W));
    lines.push(center(sep(W, "="), W));

    // 2. NIF, dirección, teléfono
    if (company.nif) {
        lines.push(center("NIF: " + truncStr(company.nif, W - 5), W));
    }
    if (company.address) {
        for (const ln of wrap(company.address, W)) {
            lines.push(center(ln, W));
        }
    }
    if (company.phone) {
        lines.push(center("Tel: " + truncStr(company.phone, W - 5), W));
    }
    lines.push(sep(W));

    // 3. Datos del ticket
    const ticketNum = truncStr(`${opts.series}-${String(opts.invoiceNumber).padStart(6, "0")}`, W - 8);
    lines.push(fmtLine("Ticket:", ticketNum, W));
    lines.push(fmtLine("Fecha:", date, W));
    lines.push(fmtLine("Hora:", time, W));
    if (opts.tableNumber) {
        lines.push(fmtLine("Mesa:", String(opts.tableNumber), W));
    }
    if (opts.waiterName) {
        lines.push(fmtLine("Camarero:", truncStr(opts.waiterName, 16), W));
    }
    if (opts.paymentMethod) {
        lines.push(fmtLine("Pago:", truncStr(opts.paymentMethod, 20), W));
    }
    lines.push(sep(W));

    // 4. PRODUCTOS
    for (const l of opts.lines) {
        const qty = Number(l.quantity || 0);
        const price = Number(l.unit_price || 0);
        const sub = qty * price;
        if (qty <= 0) continue;
        const qtyStr = qty === Math.floor(qty) ? String(Math.floor(qty)) : qty.toFixed(2);
        // Wrap nombre del producto
        const nameLines = wrap(l.name || "—", W);
        // Primera línea: "Nx NOMBRE" + precio
        const firstLine = `${qtyStr} x ${nameLines[0] || ""}`;
        lines.push(fmtLine(firstLine, fmtEUR(sub), W));
        // Líneas siguientes: nombre continuación
        for (let i = 1; i < nameLines.length; i++) {
            lines.push(padRight(nameLines[i], W));
        }
    }
    lines.push(sep(W));

    // 5. IVA (si showTax)
    if (opts.showTax !== false) {
        for (const v of vatSummary) {
            const rateStr = v.rate % 1 === 0 ? `${v.rate}%` : `${v.rate.toFixed(2)}%`;
            const lab = `Base ${rateStr}:`;
            const val = fmtEUR(v.base);
            lines.push(fmtLine(lab, val, W));
            lines.push(fmtLine(`IVA ${rateStr}:`, fmtEUR(v.tax), W));
        }
    } else {
        lines.push(fmtLine("Subtotal:", fmtEUR(subtotal), W));
    }
    lines.push(sep(W, "="));
    lines.push(fmtLine("TOTAL (IVA incl.):", fmtEUR(total), W));
    lines.push(sep(W, "="));

    // 6. PIE
    if (opts.footerMsg) {
        for (const ln of wrap(opts.footerMsg, W)) {
            lines.push(center(ln, W));
        }
    }
    if (opts.orderId) {
        lines.push(center("ID: " + truncStr(opts.orderId, W - 4), W));
    }
    lines.push("");
    lines.push(center("Gracias por su visita!", W));
    lines.push(center("Software TPV: Mozona TPV", W));

    return lines.join("\n");
}

// ════════════════════════════════════════════════════════════════
// ★ GENERACIÓN DE HTML PARA IMPRESIÓN
// ════════════════════════════════════════════════════════════════

export function buildTicketHTML(opts: TicketOptions): string {
    const W = CHARS_BY_WIDTH[opts.paperWidth || 58] || DEFAULT_CHARS;
    const body = buildTicketText(opts);

    // Convertir texto a HTML (cada línea en <div>)
    const htmlBody = body.split("\n").map(line => {
        // Escapar HTML básico
        const safe = String(line)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        return `<div class="line">${safe || "&nbsp;"}</div>`;
    }).join("\n");

    // CSS optimizado para 58mm
    const cssWidth = opts.paperWidth || 58;
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Ticket</title>
<style>
@page {
    margin: 0;
    size: ${cssWidth}mm auto;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
    margin: 0;
    padding: 2mm;
    background: #fff;
    color: #000;
    font-family: ${FONT_STACK};
    font-size: 11px;
    font-weight: 800;
    line-height: 1.15;
    -webkit-font-smoothing: none;
    -webkit-print-color-adjust: exact;
    width: ${cssWidth - 4}mm;
    max-width: ${cssWidth - 4}mm;
}
.ticket {
    width: 100%;
    white-space: pre;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
}
.line {
    width: 100%;
    white-space: pre;
    overflow: hidden;
    text-overflow: clip;
    word-break: normal;
    hyphens: none;
}
</style>
</head>
<body>
<div class="ticket">
${htmlBody}
</div>
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════════
// ★ API PÚBLICA: imprimir
// ════════════════════════════════════════════════════════════════

export interface PrintResult {
    ok: boolean;
    method: "local" | "browser" | "none";
    preview: string;
    error?: string;
}

export function printTicket(opts: TicketOptions): PrintResult {
    const html = buildTicketHTML(opts);
    const text = buildTicketText(opts);

    // Estrategia 1: local printer (USB/Serial/Bluetooth)
    try {
        const w = window as any;
        if (w?.mozona?.printTicketLocal) {
            const r = w.mozona.printTicketLocal(html);
            if (r && r.ok) return { ok: true, method: "local", preview: text };
        }
    } catch (_) {}

    // Estrategia 2: window.open + window.print
    try {
        const w = window.open("", "_blank", "width=400,height=600");
        if (w) {
            w.document.open();
            w.document.write(html);
            w.document.close();
            // Esperar a que cargue
            setTimeout(() => {
                try { w.focus(); w.print(); } catch (_) {}
            }, 200);
            return { ok: true, method: "browser", preview: text };
        }
    } catch (e) {
        return { ok: false, method: "none", preview: text, error: String(e) };
    }
    return { ok: false, method: "none", preview: text };
}

// ════════════════════════════════════════════════════════════════
// ★ PREVIEW EN PANTALLA
// ════════════════════════════════════════════════════════════════

export function getTicketPreview(opts: TicketOptions): string {
    return buildTicketText(opts);
}

// ════════════════════════════════════════════════════════════════
// ★ PRINTPREBILL: pre-cuenta desde el TPV
// ════════════════════════════════════════════════════════════════

export interface PrintPreBillOptions {
    tenantId?: string | null;
    tableNumber?: string | null;
    waiterName?: string | null;
    lines: Array<{
        name: string;
        quantity: number;
        unit_price: number;
        tax_rate?: number;
    }>;
    companyOverride?: any;
}

export async function printPreBill(input: PrintPreBillOptions): Promise<PrintResult> {
    try {
        // Cargar settings
        const { loadTicketSettings } = await import("./ticketSettings");
        const settings = input.companyOverride || loadTicketSettings();

        const paperWidth: 58 | 80 = 58; // por defecto 58mm
        const opts: TicketOptions = {
            lines: input.lines.map(l => ({
                name: l.name,
                quantity: l.quantity,
                unit_price: l.unit_price,
                tax_rate: l.tax_rate,
            })),
            series: "PRE",
            invoiceNumber: Date.now() % 1000000,
            tableNumber: input.tableNumber ? Number(input.tableNumber) : null,
            waiterName: input.waiterName || null,
            paymentMethod: "Pendiente",
            createdAt: Date.now(),
            settings,
            showTax: true,
            paperWidth,
            headerMsg: "PRE-CUENTA",
            footerMsg: "Esta no es una factura definitiva",
        };
        return printTicket(opts);
    } catch (e) {
        return { ok: false, method: "none", preview: "", error: String(e) };
    }
}
