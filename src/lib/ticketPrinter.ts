// =====================================================================
// MOZONA TPV — ticketPrinter: impresión de tickets 58mm
// =====================================================================
// Genera el HTML del ticket térmico 58mm y lo envía a impresión.
//
// Estructura:
//   1. Cabecera libre (header_text) + datos del restaurante
//   2. Datos del ticket (serie, fecha/hora exacta, mesa, camarero, pago)
//   3. Líneas de productos
//   4. Desglose de IVA (solo si show_vat_breakdown=true) y Total
//   5. Mensaje de pie (footer_text)
//   6. MARCA DE SOFTWARE al final: "Software TPV: Mozona TPV"
//
// Formato: 58mm centrado, monospace, márgenes a CERO.
//   - @page size: 58mm auto
//   - .ticket-container max-width: 54mm (área imprimible real)
//   - CHARS_PER_LINE = 32 (≈ 32 cols Font A 58mm)
//
// ★ v1.9.14: los datos de Empresa (nombre/NIF/dirección/teléfono) se
//   leen DIRECTAMENTE de localStorage, no de la BD. El panel Empresa
//   (SettingsPage.saveEmpresa) persiste en `mozona.empresa`.
//   Se prueban varias claves candidatas para ser compatibles con
//   distintas versiones del panel y con datos de ejemplo.
// =====================================================================

import { loadTicketSettings } from "./ticketSettings";

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

const TICKET_WIDTH_MM = 58;            // ★ papel 58mm
const TICKET_WIDTH    = "58mm";
const PRINTABLE_WIDTH = "54mm";        // ★ área imprimible real (≈ 200-220px)
const FONT_STACK      = `"Courier New", Courier, monospace`;
const CHARS_PER_LINE  = 32;            // 58mm Font A ~ 32 cols

// ---------------------------------------------------------------------
// ★ v1.9.14: Empresa desde localStorage
// ---------------------------------------------------------------------

export interface CompanyInfo {
    name:    string;
    nif:     string;
    address: string;
    phone:   string;
}

const DEFAULT_COMPANY: CompanyInfo = {
    name:    "Restaurante",
    nif:     "",
    address: "",
    phone:   "",
};

/** Lee un valor string de un objeto siguiendo varias claves candidatas. */
function pickStr(obj: any, keys: string[]): string {
    if (!obj || typeof obj !== "object") return "";
    for (const k of keys) {
        const v = obj[k];
        if (typeof v === "string" && v.trim() !== "") return v.trim();
        if (typeof v === "number") return String(v);
    }
    return "";
}

/** Lee un objeto de la primera clave localStorage que contenga un JSON parseable. */
function readJsonAny(keys: string[]): any | null {
    if (typeof localStorage === "undefined") return null;
    for (const key of keys) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") return parsed;
        } catch (e) { /* ignore */ }
    }
    return null;
}

/** ★★★ CARGA EMPRESA DESDE LOCALSTORAGE ★★★
 *  Busca en este orden:
 *    1. mozona.empresa         (panel Empresa oficial v1.9.x)
 *    2. mozona.ticket_config   (panel Ticket contiene también datos de empresa)
 *    3. company_info           (compatibilidad)
 *    4. business_settings      (compatibilidad)
 *  Devuelve la primera coincidencia válida con los 4 campos. */
export function loadCompanyFromLocal(): CompanyInfo {
    const keys = [
        "mozona.empresa",
        "mozona.ticket_config",
        "company_info",
        "business_settings",
        "mozona.company",
    ];
    for (const k of keys) {
        const obj = readJsonAny([k]);
        if (!obj) continue;
        const info: CompanyInfo = {
            name:    pickStr(obj, ["name", "businessName", "razon_social", "razonSocial", "company_name"]),
            nif:     pickStr(obj, ["nif", "cif", "cif_nif", "cifNif", "tax_id"]),
            address: pickStr(obj, ["address", "direccion", "addr"]),
            phone:   pickStr(obj, ["phone", "telefono", "tel"]),
        };
        if (info.name || info.nif || info.address || info.phone) {
            return info;
        }
    }
    return { ...DEFAULT_COMPANY };
}

/** Lee la configuración de impresión de ticket desde localStorage. */
function loadTicketConfigFromLocal(): { header_text: string; footer_text: string; show_vat_breakdown: boolean } {
    const obj = readJsonAny([
        "mozona.ticket_config",
        "mozona.ticket_settings",
        "ticket_settings",
    ]);
    if (!obj) return { header_text: "", footer_text: "¡Gracias por su visita!", show_vat_breakdown: true };
    return {
        header_text:        pickStr(obj, ["header_text", "header_msg", "headerMsg"]),
        footer_text:        pickStr(obj, ["footer_text", "footer_msg", "footerMsg", "footer"]) || "¡Gracias por su visita!",
        show_vat_breakdown: typeof obj.show_vat_breakdown === "boolean"
            ? obj.show_vat_breakdown
            : (typeof obj.showTax === "boolean" ? obj.showTax : true),
    };
}

// ---------------------------------------------------------------------
// Helpers de formato
// ---------------------------------------------------------------------

function fmtLine(left: string, right: string, width = CHARS_PER_LINE): string {
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

/** Formato EXACTO de fecha/hora: DD/MM/YYYY HH:mm:ss */
function fmtDateTime(iso?: string): string {
    const d = new Date(iso ?? Date.now());
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
}

/** Convierte caracteres HTML peligrosos a entidades */
function escapeHtml(s: string): string {
    return s.replace(/[<>&"']/g, c =>
        ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] ?? c)
    );
}

/** Agrupa líneas por tipo de IVA y calcula base/iva/importe */
function summarizeVat(lines: TicketLine[]): Array<{ rate: number; base: number; tax: number; total: number }> {
    const map = new Map<number, { base: number; tax: number; total: number }>();
    for (const l of lines) {
        const r = Number(l.tax_rate ?? 10);
        const sub = Number(l.unit_price) * Number(l.quantity);
        const base = sub / (1 + r / 100);
        const tax  = sub - base;
        const cur = map.get(r) ?? { base: 0, tax: 0, total: 0 };
        cur.base  += base;
        cur.tax   += tax;
        cur.total += sub;
        map.set(r, cur);
    }
    return Array.from(map.entries())
        .map(([rate, v]) => ({ rate, ...v }))
        .sort((a, b) => b.rate - a.rate);
}

function buildTicketHtml(input: TicketInput): string {
    const {
        businessName, cifNif = "—", address = "", phone = "",
        tableNumber, waiterName, lines, subtotal, taxTotal, total,
        paymentMethod, series, invoiceNumber, headerMsg, footerMsg, showTax = true,
        createdAt, orderId,
    } = input;

    const dateStr = fmtDateTime(createdAt);
    const vatSummary = summarizeVat(lines);
    const ticketNumber = `${series}-${String(invoiceNumber).padStart(8, "0")}`;

    // ============================================================
    // 1. CABECERA LIBRE (header_text)
    // ============================================================
    const head: string[] = [];
    if (headerMsg) {
        head.push(padBoth(escapeHtml(headerMsg), CHARS_PER_LINE));
        head.push("-".repeat(CHARS_PER_LINE));
    }

    // 1b. DATOS DEL RESTAURANTE (de localStorage o del input)
    const nameToShow = businessName && businessName.trim() !== ""
        ? businessName
        : DEFAULT_COMPANY.name;
    head.push(padBoth(nameToShow.toUpperCase(), CHARS_PER_LINE));
    if (cifNif && cifNif !== "—") head.push(padBoth("CIF/NIF: " + cifNif, CHARS_PER_LINE));
    if (address) head.push(padBoth(address, CHARS_PER_LINE));
    if (phone)   head.push(padBoth("Tel: " + phone, CHARS_PER_LINE));
    head.push("=".repeat(CHARS_PER_LINE));

    // 1c. DATOS DEL TICKET (serie, fecha/hora, mesa, camarero, pago)
    head.push(fmtLine("Ticket:", ticketNumber));
    head.push(fmtLine("Fecha:", dateStr));
    if (tableNumber) head.push(fmtLine("Mesa:", String(tableNumber)));
    if (waiterName)  head.push(fmtLine("Camarero:", waiterName));
    head.push(fmtLine("Pago:", paymentMethod));
    head.push("-".repeat(CHARS_PER_LINE));

    // ============================================================
    // 2. LÍNEAS DE PRODUCTOS
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
    // 3. TOTALES + DESGLOSE IVA
    // ============================================================
    const foot: string[] = [];
    if (showTax) {
        foot.push(`<div class="ticket-row"><span class="desc">Base imponible:</span><span class="price">${fmtEUR(subtotal)}</span></div>`);
        for (const v of vatSummary) {
            const label = v.rate % 1 === 0 ? `${v.rate}%` : `${v.rate.toFixed(2)}%`;
            foot.push(`<div class="ticket-row"><span class="desc">IVA ${label}:</span><span class="price">${fmtEUR(v.tax)}</span></div>`);
        }
        foot.push(`<div class="ticket-row"><span class="desc">Total IVA:</span><span class="price">${fmtEUR(taxTotal)}</span></div>`);
    }
    foot.push('<hr class="ticket-divider" />');
    foot.push(`<div class="ticket-row ticket-total"><span class="desc">TOTAL:</span><span class="price">${fmtEUR(total)}</span></div>`);
    foot.push('<hr class="ticket-divider" />');

    // ============================================================
    // 4. PIE (footer_text) + identificación
    // ============================================================
    if (footerMsg) {
        foot.push(`<div class="ticket-row"><span class="desc" style="text-align:center">${escapeHtml(footerMsg)}</span></div>`);
    }
    if (orderId) {
        foot.push(`<div class="ticket-row"><span class="desc" style="text-align:center">ID: ${orderId.slice(0, 8)}</span></div>`);
    }

    // 4b. MARCA DE SOFTWARE al final
    foot.push(`<div class="ticket-footer-brand">Software TPV: Mozona TPV</div>`);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ticket ${ticketNumber}</title>
<style>
/* ★ 58mm físico + 54mm imprimible */
@page { size: ${TICKET_WIDTH} auto; margin: 0; }
* { box-sizing: border-box; -webkit-font-smoothing: none; -moz-osx-font-smoothing: unset; }
html, body { margin: 0; padding: 0; }
body {
    margin: 0;
    padding: 2mm 1mm;
    font-family: ${FONT_STACK};
    font-size: 11px;
    font-weight: 800;
    line-height: 1.2;
    color: #000;
    background: #fff;
    display: flex;
    justify-content: center;
}
.ticket-container {
    width: 100%;
    max-width: ${PRINTABLE_WIDTH};
    margin: 0 auto;
    white-space: pre;
    word-break: break-word;
    text-align: center;
    overflow: hidden;
}
.ticket-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    width: 100%;
    margin-bottom: 1px;
    text-align: left;
}
.ticket-row .desc   { flex: 1 1 auto; text-align: left;  word-break: break-word; padding-right: 3px; }
.ticket-row .price  { flex: 0 0 auto; text-align: right; white-space: nowrap; }
.ticket-divider { border: none; border-top: 1px dashed #000; margin: 2px 0; }
.ticket-total   { font-size: 14px; font-weight: 900; }
.ticket-footer-brand { margin-top: 4px; font-size: 9px; text-align: center; letter-spacing: 0.3px; }
</style>
</head>
<body onload="setTimeout(() => window.print(), 300)">
<div class="ticket-container" id="ticket-print-area">
${[...head, ...body, ...foot].join("\n")}
</div>
</body>
</html>`;

    return html;
}

/**
 * ★★★ FUNCIÓN PRINCIPAL ★★★
 *  Imprime un ticket tras el cobro.
 *
 *  Datos de EMPRESA: leídos SIEMPRE de localStorage (loadCompanyFromLocal)
 *  Datos de TICKET:  fusiona BD (ticket_settings) + localStorage + input
 *  Datos de METADATOS: orderId, tableNumber, series, invoiceNumber del input
 *  Datos del COBRO:   lines, subtotal, taxTotal, total, paymentMethod del input
 *
 *  Los campos de input mandan sobre localStorage/BD solo si traen valor real.
 */
export async function printTicket(input: TicketInput): Promise<{ ok: boolean; method: "print" | "skipped" | "error"; error?: string }> {
    try {
        // 1) EMPRESA: SIEMPRE desde localStorage (es donde se guarda de verdad)
        const company = loadCompanyFromLocal();

        // 2) TICKET CONFIG: BD → localStorage → defaults
        let cfg = { header_text: "", footer_text: "¡Gracias por su visita!", show_vat_breakdown: true, paper_width_mm: 80 };
        try {
            const ts = await loadTicketSettings();
            cfg = {
                header_text:        ts.header_text        ?? "",
                footer_text:        ts.footer_text        ?? cfg.footer_text,
                show_vat_breakdown: ts.show_vat_breakdown ?? true,
                paper_width_mm:     ts.paper_width_mm     ?? 80,
            };
        } catch (e) {
            console.warn("[ticketPrinter] no se pudo cargar ticket_settings (BD):", e);
        }
        // Sobrescribir con localStorage si tiene valores
        const localCfg = loadTicketConfigFromLocal();
        if (localCfg.header_text)        cfg.header_text        = localCfg.header_text;
        if (localCfg.footer_text)        cfg.footer_text        = localCfg.footer_text;
        cfg.show_vat_breakdown = localCfg.show_vat_breakdown;

        // 3) MERGE: input gana si trae dato real, si no usa localStorage
        const merged: TicketInput = {
            ...input,
            businessName: (input.businessName && input.businessName.trim() !== "" && input.businessName !== DEFAULT_COMPANY.name)
                          ? input.businessName
                          : company.name,
            cifNif:       (input.cifNif && input.cifNif !== "—") ? input.cifNif : company.nif,
            address:      input.address ?? company.address,
            phone:        input.phone   ?? company.phone,
            headerMsg:    input.headerMsg ?? cfg.header_text,
            footerMsg:    input.footerMsg ?? cfg.footer_text,
            showTax:      input.showTax   ?? cfg.show_vat_breakdown,
        };

        const html = buildTicketHtml(merged);

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
