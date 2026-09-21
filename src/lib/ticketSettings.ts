// =====================================================================
// MOZONA TPV — ticketSettings: persistencia por tenant
// =====================================================================
// Lee/escribe la fila de configuración del ticket + datos de empresa
// en public.ticket_settings usando como PK el tenant_id resuelto.
//
// Esquema (v1.9.16):
//   tenant_id            UUID        PRIMARY KEY
//   header_text          TEXT        NULL
//   footer_text          TEXT        NULL DEFAULT '¡Gracias por su visita!'
//   show_vat_breakdown   BOOLEAN     NOT NULL DEFAULT TRUE
//   paper_width_mm       INTEGER     NOT NULL DEFAULT 80
//   company_name         TEXT        NULL  -- ★ v1.9.16
//   nif                  TEXT        NULL  -- ★ v1.9.16
//   address              TEXT        NULL  -- ★ v1.9.16
//   phone                TEXT        NULL  -- ★ v1.9.16
//   updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
//
// Si la tabla no existe o falla la BD, se usa SIEMPRE localStorage
// como fallback (mismo patrón que el resto del proyecto).
// =====================================================================

import { supabase } from "./supabase";
import { resolveRealTenantId } from "./waiters";

const FALLBACK_TENANT_ID = "58a8e6f5-3172-409c-8aa5-ae02be0b7e76";
const LS_KEY = "mozona.ticket_settings";

export interface TicketSettings {
    tenant_id:          string;
    header_text:        string;
    footer_text:        string;
    show_vat_breakdown: boolean;
    paper_width_mm:     number;
    company_name:       string;
    nif:                string;
    address:            string;
    phone:              string;
}

export const DEFAULT_TICKET_SETTINGS: Omit<TicketSettings, "tenant_id"> = {
    header_text:        "",
    footer_text:        "¡Gracias por su visita!",
    show_vat_breakdown: true,
    paper_width_mm:     58,
    company_name:       "",
    nif:                "",
    address:            "",
    phone:              "",
};

function lsKey(tenantId: string): string {
    return `${LS_KEY}::${tenantId}`;
}

function readLocal(tenantId: string): TicketSettings {
    try {
        const raw = localStorage.getItem(lsKey(tenantId));
        if (raw) {
            const obj = JSON.parse(raw);
            return { ...DEFAULT_TICKET_SETTINGS, tenant_id: tenantId, ...obj };
        }
    } catch (e) { /* ignore */ }
    return { ...DEFAULT_TICKET_SETTINGS, tenant_id: tenantId };
}

function writeLocal(s: TicketSettings): void {
    try {
        localStorage.setItem(lsKey(s.tenant_id), JSON.stringify(s));
    } catch (e) { /* ignore */ }
}

/** Carga la configuración del ticket del tenant activo.
 *  Orden: BD (ticket_settings) → localStorage → defaults.
 *  Si la columna paper_width_mm no existe en la tabla, fallback automático sin ella. */
export async function loadTicketSettings(): Promise<TicketSettings> {
    const tenantId = (await resolveRealTenantId(null)) || FALLBACK_TENANT_ID;
    const local = readLocal(tenantId);

    if (!supabase) return local;
    try {
        // ★ v4.0.7-rls-fix: Primer intento CON paper_width_mm
        let result = await supabase
            .from("ticket_settings")
            .select("tenant_id, header_text, footer_text, show_vat_breakdown, paper_width_mm, company_name, nif, address, phone")
            .eq("tenant_id", tenantId)
            .maybeSingle();

        // ★ Si falla por columna inexistente, reintentar SIN paper_width_mm
        if (result.error && /paper_width_mm.*does not exist|column.*paper_width_mm/i.test(result.error.message)) {
            console.warn("[ticketSettings] columna paper_width_mm no existe, reintentando sin ella");
            result = await supabase
                .from("ticket_settings")
                .select("tenant_id, header_text, footer_text, show_vat_breakdown, company_name, nif, address, phone")
                .eq("tenant_id", tenantId)
                .maybeSingle();
        }

        const { data, error } = result;
        if (error) {
            console.warn("[ticketSettings] load BD error:", error.message);
            return local;
        }
        if (!data) return local;
        const merged: TicketSettings = {
            ...DEFAULT_TICKET_SETTINGS,
            tenant_id: tenantId,
            header_text:        (data as any).header_text        ?? "",
            footer_text:        (data as any).footer_text        ?? DEFAULT_TICKET_SETTINGS.footer_text,
            show_vat_breakdown: (data as any).show_vat_breakdown ?? true,
            paper_width_mm:     (data as any).paper_width_mm     ?? 58,
            company_name:       (data as any).company_name       ?? "",
            nif:                (data as any).nif                ?? "",
            address:            (data as any).address            ?? "",
            phone:              (data as any).phone              ?? "",
        };
        writeLocal(merged);   // refresca cache local
        return merged;
    } catch (e) {
        console.warn("[ticketSettings] load exception:", e);
        return local;
    }
}

/** Upsert de la configuración del ticket (incluye empresa). */
export async function saveTicketSettings(input: Partial<TicketSettings>): Promise<{ ok: boolean; error?: string; source: "db" | "local" }> {
    const tenantId = (await resolveRealTenantId(null)) || FALLBACK_TENANT_ID;
    const payload: TicketSettings = {
        ...DEFAULT_TICKET_SETTINGS,
        ...readLocal(tenantId),
        ...input,
        tenant_id: tenantId,
    };
    // Guardar SIEMPRE en local primero (fallback garantizado)
    writeLocal(payload);

    if (!supabase) return { ok: true, source: "local" };
    try {
        // ★ v4.0.7-rls-fix: Primer intento CON paper_width_mm
        let result = await supabase
            .from("ticket_settings")
            .upsert({
                tenant_id:          payload.tenant_id,
                header_text:        payload.header_text || null,
                footer_text:        payload.footer_text || null,
                show_vat_breakdown: payload.show_vat_breakdown,
                paper_width_mm:     payload.paper_width_mm,
                company_name:       payload.company_name || null,
                nif:                payload.nif          || null,
                address:            payload.address      || null,
                phone:              payload.phone        || null,
                updated_at:         new Date().toISOString(),
            }, { onConflict: "tenant_id" });

        // ★ Si falla por columna inexistente, reintentar SIN paper_width_mm
        if (result.error && /paper_width_mm.*does not exist|column.*paper_width_mm/i.test(result.error.message)) {
            console.warn("[ticketSettings] paper_width_mm no existe en BD, guardando sin esa columna");
            result = await supabase
                .from("ticket_settings")
                .upsert({
                    tenant_id:          payload.tenant_id,
                    header_text:        payload.header_text || null,
                    footer_text:        payload.footer_text || null,
                    show_vat_breakdown: payload.show_vat_breakdown,
                    company_name:       payload.company_name || null,
                    nif:                payload.nif          || null,
                    address:            payload.address      || null,
                    phone:              payload.phone        || null,
                    updated_at:         new Date().toISOString(),
                }, { onConflict: "tenant_id" });
        }

        const { error } = result;
        if (error) {
            console.warn("[ticketSettings] save BD error:", error.message);
            return { ok: true, source: "local", error: error.message };
        }
        console.log("[ticketSettings] ✓ saved in DB");
        return { ok: true, source: "db" };
    } catch (e: any) {
        console.warn("[ticketSettings] save exception:", e?.message ?? e);
        return { ok: true, source: "local", error: e?.message };
    }
}

// ---------------------------------------------------------------------
// ★ v1.9.18: helper de FALLBACK para Empresa
// ---------------------------------------------------------------------
// Si la BD no tiene los datos de empresa, completa con lo que esté en
// `localStorage["mozona.empresa"]` (donde el panel Empresa guarda).
// Esto evita que la cabecera del ticket salga con "RESTAURANTE" / "—".

export interface CompanyInfoLite {
    name:    string;
    nif:     string;
    address: string;
    phone:   string;
}

function pickStr(obj: any, keys: string[]): string {
    if (!obj || typeof obj !== "object") return "";
    for (const k of keys) {
        const v = obj[k];
        if (typeof v === "string" && v.trim() !== "") return v.trim();
        if (typeof v === "number") return String(v);
    }
    return "";
}

/** Lee empresa del localStorage `mozona.empresa` con varias claves candidatas. */
export function readCompanyFromLocalStorage(): CompanyInfoLite {
    const DEFAULT_NAME = "Restaurante";
    try {
        const raw = localStorage.getItem("mozona.empresa");
        if (!raw) return { name: DEFAULT_NAME, nif: "", address: "", phone: "" };
        const obj = JSON.parse(raw);
        return {
            name:    pickStr(obj, ["name", "businessName", "razon_social", "company_name"]) || DEFAULT_NAME,
            nif:     pickStr(obj, ["nif", "cif", "cif_nif", "tax_id"]),
            address: pickStr(obj, ["address", "direccion", "addr"]),
            phone:   pickStr(obj, ["phone", "telefono", "tel"]),
        };
    } catch (e) {
        return { name: DEFAULT_NAME, nif: "", address: "", phone: "" };
    }
}

/** Fusiona la empresa: BD (TicketSettings) → fallback localStorage. */
export function companyFromSettingsWithLocal(s: TicketSettings | null | undefined): CompanyInfoLite {
    const fromDb: CompanyInfoLite = {
        name:    (s?.company_name ?? "").trim(),
        nif:     (s?.nif          ?? "").trim(),
        address: (s?.address      ?? "").trim(),
        phone:   (s?.phone        ?? "").trim(),
    };
    const fromLocal = readCompanyFromLocalStorage();

    const isPlaceholder = (s: string) =>
        !s || s.toUpperCase() === "RESTAURANTE" || s === "—";

    return {
        name:    isPlaceholder(fromDb.name)    ? fromLocal.name    : fromDb.name,
        nif:     isPlaceholder(fromDb.nif)     ? fromLocal.nif     : fromDb.nif,
        address: isPlaceholder(fromDb.address) ? fromLocal.address : fromDb.address,
        phone:   isPlaceholder(fromDb.phone)   ? fromLocal.phone   : fromDb.phone,
    };
}
