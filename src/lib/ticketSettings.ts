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
 *  Orden: BD (ticket_settings) → localStorage → defaults. */
export async function loadTicketSettings(): Promise<TicketSettings> {
    const tenantId = (await resolveRealTenantId(null)) || FALLBACK_TENANT_ID;
    const local = readLocal(tenantId);

    if (!supabase) return local;
    try {
        const { data, error } = await supabase
            .from("ticket_settings")
            .select("tenant_id, header_text, footer_text, show_vat_breakdown, paper_width_mm, company_name, nif, address, phone")
            .eq("tenant_id", tenantId)
            .maybeSingle();
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
        const { error } = await supabase
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
