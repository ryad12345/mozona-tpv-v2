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
// ★ v1.9.16 — EMPRESA EN BD (no en localStorage):
//   El ticket se imprime abriendo un pop-up en about:blank, contexto
//   AISLADO del origen: NO puede leer localStorage. Por tanto, los
//   datos de Empresa (nombre/NIF/dirección/teléfono) se leen desde
//   Supabase (tabla `ticket_settings`) ANTES del window.open y se
//   inyectan como literales en el HTML.
//   El panel Empresa (SettingsPage.saveEmpresa) hace upsert en
//   `ticket_settings` con los campos `company_name/nif/address/phone`.
// =====================================================================

import { loadTicketSettings, type TicketSettings, companyFromSettingsWithLocal } from "./ticketSettings";

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
    /** ★ v1.9.19: Empresa cruda del localStorage para bypasear cualquier
     *  problema de contexto/RLS. Si viene, tiene prioridad. */
    companyOverride?: any;
}

const TICKET_WIDTH_MM = 58;            // ★ papel 58mm físico
const TICKET_WIDTH    = "58mm";
// ★ v1.9.21 [HOTFIX]: área imprimible conservadora.
//   Margen de seguridad de 2mm a cada lado para que la impresora
//   no recorte el lateral derecho (hora, método de pago, decimales).
const PRINTABLE_WIDTH = "48mm";        // ★ antes 54mm → ahora 48mm
const FONT_STACK      = `"Courier New", Courier, monospace`;
const CHARS_PER_LINE  = 32;            // 58mm Font A ~ 32 cols

// ---------------------------------------------------------------------
// ★ v1.9.16: Empresa desde BD (no desde localStorage)
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

/** Extrae los datos de empresa desde un objeto TicketSettings. */
function companyFromSettings(s: TicketSettings | null | undefined, override?: any): CompanyInfo {
    // ★ v1.9.19: si viene `override` desde el caller (localStorage
    //   leído en la ventana principal), tiene PRIORIDAD absoluta.
    if (override && typeof override === "object") {
        const fromOverride: CompanyInfo = {
            name:    String(override.name || override.businessName || override.razon_social || override.company_name || "").trim() || DEFAULT_COMPANY.name,
            nif:     String(override.nif   || override.cif      || override.cif_nif        || override.tax_id       || "").trim(),
            address: String(override.address || override.direccion || override.addr          || "").trim(),
            phone:   String(override.phone   || override.telefono  || override.tel           || "").trim(),
        };
        // Si el override trae al menos nombre o NIF, lo usamos entero
        if (fromOverride.name !== DEFAULT_COMPANY.name || fromOverride.nif || fromOverride.address || fromOverride.phone) {
            return fromOverride;
        }
    }
    // ★ v1.9.18: usa el helper del módulo con fallback a localStorage
    return companyFromSettingsWithLocal(s);
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

/** ★ v1.9.20: divide un string largo en líneas de `width` chars SIN truncar.
 *  Si la línea cabe, devuelve un array de un solo elemento.
 *  Si no, parte por espacios cuando es posible; si no hay, corta blando. */
function wrapText(s: string, width: number): string[] {
    if (!s) return [];
    if (s.length <= width) return [s];
    const out: string[] = [];
    let remaining = s;
    while (remaining.length > width) {
        // Buscar el último espacio dentro del rango
        let cut = remaining.lastIndexOf(" ", width);
        if (cut <= 0) {
            // Sin espacios, cortar duro en width
            cut = width;
        }
        out.push(remaining.slice(0, cut).trimEnd());
        remaining = remaining.slice(cut).trimStart();
    }
    if (remaining.length > 0) out.push(remaining);
    return out;
}

/** Centra cada línea de un texto multilinea. */
function padBothMultiline(s: string, width: number): string[] {
    return wrapText(s, width).map(line => padBoth(line, width));
}

function fmtEUR(n: number): string {
    // ★ v1.9.21 [HOTFIX]: formato monetario ESTRICTO.
    //   - es-ES: usa coma decimal
    //   - 2 decimales SIEMPRE (min y max)
    //   - símbolo € con espacio antes
    return Number(n ?? 0).toLocaleString("es-ES", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }) + " \u20AC";
}

/** Formato EXACTO de fecha/hora en HORA LOCAL ESPAÑA (Europe/Madrid):
 *  DD/MM/YYYY HH:mm:ss
 *  - Intl.DateTimeFormat con timeZone Europe/Madrid para la hora local
 *  - SIEMPRE padStart(2, '0') por componente (por si Intl devuelve 1 dígito) */
function fmtDateTime(iso?: string): string {
    const d = new Date(iso ?? Date.now());
    const pad = (n: number | string) => String(n).padStart(2, "0");
    try {
        const fmt = new Intl.DateTimeFormat("es-ES", {
            timeZone: "Europe/Madrid",
            day:   "2-digit",
            month: "2-digit",
            year:  "numeric",
            hour:  "2-digit",
            minute:"2-digit",
            second:"2-digit",
            hour12: false,
        });
        const parts = fmt.formatToParts(d);
        const get = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
        // ★ v1.9.20: padStart(2,'0') garantizado incluso si Intl devuelve "4"
        return `${pad(get("day"))}/${pad(get("month"))}/${get("year")} ${pad(get("hour"))}:${pad(get("minute"))}:${pad(get("second"))}`;
    } catch (e) {
        // Fallback manual con padStart (navegadores sin Intl avanzado)
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
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
        businessName, cifNif = "", address = "", phone = "",
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
        head.push(...padBothMultiline(escapeHtml(headerMsg), CHARS_PER_LINE));
        head.push("-".repeat(CHARS_PER_LINE));
    }

    // 1b. DATOS DEL RESTAURANTE (inyectados desde BD)
    const nameToShow = businessName && businessName.trim() !== ""
        ? businessName
        : DEFAULT_COMPANY.name;
    head.push(...padBothMultiline(nameToShow.toUpperCase(), CHARS_PER_LINE));
    if (cifNif)   head.push(...padBothMultiline("CIF/NIF: " + cifNif, CHARS_PER_LINE));
    if (address) head.push(...padBothMultiline(address, CHARS_PER_LINE));
    if (phone)   head.push(...padBothMultiline("Tel: " + phone, CHARS_PER_LINE));
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
/* ★ v1.9.21 [HOTFIX]: papel 58mm, área imprimible 48mm con margen seguridad */
@page { size: ${TICKET_WIDTH} auto; margin: 0; }
* { box-sizing: border-box; -webkit-font-smoothing: none; -moz-osx-font-smoothing: unset; }
html, body { margin: 0; padding: 0; }
body {
    margin: 0;
    padding: 2mm 2mm;        /* ★ margen 2mm a cada lado (antes 1mm) */
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
.ticket-row .price  { flex: 0 0 auto; text-align: right; white-space: nowrap; padding-right: 2mm; }   /* ★ v1.9.21 margen seguridad */
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
 * ★★★ PRE-CUENTA ★★★
 *  v1.9.17: USA EL MISMO MOTOR QUE printTicket.
 *  Mismo formato 58mm, mismos datos de empresa (de ticket_settings),
 *  mismo desglose de IVA. Diferencia: marca "PRE-CUENTA" en lugar de
 *  "TOTAL cerrado" y NO descuenta stock / no cierra mesa.
 *
 *  Como printTicket, pre-resuelve TODO antes de window.open para que
 *  el pop-up en about:blank reciba el HTML autocontenido.
 */
export interface PreBillInput {
    tenantId?:      string | null;
    tableNumber?:   string | number;
    waiterName?:    string | null;
    lines:          TicketLine[];
    /** ★ v1.9.19: Empresa cruda del localStorage. Si viene, prioridad. */
    companyOverride?: any;
}

export async function printPreBill(input: PreBillInput): Promise<{ ok: boolean; method: "print" | "skipped" | "error"; error?: string }> {
    try {
        // 1) Resolver TODO en el contexto de la app
        let ts: TicketSettings | null = null;
        try {
            ts = await loadTicketSettings();
        } catch (e) {
            console.warn("[ticketPrinter] loadTicketSettings falló:", e);
        }
        const company = companyFromSettings(ts, input.companyOverride);

        // 2) Calcular totales
        let gross = 0;
        let taxTotal = 0;
        for (const l of input.lines) {
            const sub = Number(l.unit_price) * Number(l.quantity);
            gross += sub;
            const r = Number(l.tax_rate ?? 10);
            taxTotal += sub - sub / (1 + r / 100);
        }
        const subtotal = gross - taxTotal;

        // 3) Mapear a TicketInput
        const ticketInput: TicketInput = {
            orderId:        "PRE-" + Date.now(),
            tenantId:       input.tenantId ?? ts?.tenant_id ?? null,
            businessName:   company.name,
            cifNif:         company.nif,
            address:        company.address,
            phone:          company.phone,
            tableNumber:    input.tableNumber,
            waiterName:     input.waiterName,
            lines:          input.lines,
            subtotal,
            taxTotal,
            total:          gross,
            paymentMethod:  "PRE-CUENTA",
            series:         "PRE",
            invoiceNumber:  Math.floor(Date.now() / 1000) % 100000000,
            headerMsg:      ts?.header_text,
            footerMsg:      ts?.footer_text,
            showTax:        ts?.show_vat_breakdown ?? true,
            createdAt:      new Date().toISOString(),
        };

        // 4) Generar HTML y abrir pop-up
        const html = buildTicketHtml(ticketInput);

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
        console.error("[ticketPrinter] printPreBill error:", msg);
        return { ok: false, method: "error", error: msg };
    }
}

/**
 * ★★★ FUNCIÓN PRINCIPAL ★★★
 *
 *  v1.9.16: REESCRITA PARA EVITAR about:blank SIN DATOS.
 *
 *  Antes (v1.9.15):  printTicket abría window.open(about:blank) y el
 *    HTML leía localStorage desde el contexto del pop-up. El navegador
 *    AISLA localStorage entre orígenes → siempre salían los defaults.
 *
 *  Ahora:  ANTES de window.open, resolvemos:
 *    1) Empresa + ticket config desde BD (tabla ticket_settings).
 *    2) Fallback a localStorage SOLO en el contexto de la app principal.
 *    3) Inyectamos TODAS las cadenas en el HTML final.
 *    4) Solo entonces abrimos el pop-up y escribimos el HTML completo.
 */
export async function printTicket(input: TicketInput): Promise<{ ok: boolean; method: "print" | "skipped" | "error"; error?: string }> {
    try {
        // ============================================================
        // 1) RESOLVER TODO EN EL CONTEXTO DE LA APP (no en about:blank)
        // ============================================================
        let ts: TicketSettings | null = null;
        try {
            ts = await loadTicketSettings();
        } catch (e) {
            console.warn("[ticketPrinter] loadTicketSettings falló:", e);
        }
        const company = companyFromSettings(ts, input.companyOverride);

        // ============================================================
        // 2) MERGE: input gana si trae dato real, si no usa BD
        // ============================================================
        const merged: TicketInput = {
            ...input,
            businessName: (input.businessName && input.businessName.trim() !== "" && input.businessName !== DEFAULT_COMPANY.name)
                          ? input.businessName
                          : company.name,
            cifNif:       (input.cifNif && input.cifNif !== "" && input.cifNif !== "—") ? input.cifNif : company.nif,
            address:      input.address ?? company.address,
            phone:        input.phone   ?? company.phone,
            headerMsg:    input.headerMsg ?? (ts?.header_text ?? ""),
            footerMsg:    input.footerMsg ?? (ts?.footer_text ?? "¡Gracias por su visita!"),
            showTax:      input.showTax   ?? (ts?.show_vat_breakdown ?? true),
        };

        // ============================================================
        // 3) GENERAR HTML INYECTANDO LITERALES (sin localStorage en el pop-up)
        // ============================================================
        const html = buildTicketHtml(merged);

        // ============================================================
        // 4) ABRIR POP-UP Y ESCRIBIR HTML (no se necesita contexto)
        // ============================================================
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
