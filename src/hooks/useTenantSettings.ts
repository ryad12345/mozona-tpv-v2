// =====================================================================
// MOZONA TPV — useTenantSettings (v3.4.0)
// =====================================================================
// Hook que carga y guarda la configuración del tenant actual.
// Persiste en localStorage como cache para UX instantáneo.
// Sincroniza con Supabase periódicamente.
// =====================================================================

import { useEffect, useState, useCallback } from "react";
import { useActiveSession } from "./useActiveSession";

export interface TenantSettings {
    id?: string;
    tenant_id?: string;

    // Tickets
    ticket_paper_width: 58 | 80;
    ticket_header_text: string;
    ticket_footer_text: string;
    ticket_show_id: boolean;
    ticket_show_date: boolean;
    ticket_show_time: boolean;
    ticket_show_table: boolean;
    ticket_show_waiter: boolean;
    ticket_show_payment: boolean;
    ticket_show_vat: boolean;

    // ★ v3.4.5: Editor visual tipo Canva
    ticket_logo_url?: string;
    ticket_layout_json?: TicketElement[];

    // Tema
    theme_mode: "light" | "dark" | "auto";
    theme_accent: "blue" | "green" | "orange" | "red" | "violet";
    theme_contrast: "normal" | "high";

    // UI
    button_size: "sm" | "md" | "lg";
    grid_density: "compact" | "normal" | "comfortable";
    panel_layout: "horizontal" | "vertical";
    show_product_images: boolean;
}

// ★ v3.4.5: Elementos del canvas
export type TicketElementType =
    | "logo"        // imagen/logo
    | "text"        // texto libre
    | "block_info"  // ID/Fecha/Hora/Mesa
    | "block_lines" // líneas de productos
    | "block_totals"; // subtotal/IVA/total

export interface TicketElement {
    id: string;
    type: TicketElementType;
    x: number;       // % desde la izquierda (0-100)
    y: number;       // % desde arriba (0-100)
    w: number;       // % del ancho (0-100)
    h: number;       // % del alto (0-100)
    visible: boolean;
    // Para type=text
    content?: string;
    fontSize?: number;
    fontWeight?: number;
    align?: "left" | "center" | "right";
    // Para type=logo
    src?: string;
    // Para type=block_info
    fields?: Array<"id" | "date" | "time" | "table" | "waiter" | "payment">;
}

// ★ Layout por defecto
export const DEFAULT_TICKET_LAYOUT: TicketElement[] = [
    { id: "logo-1",  type: "logo",        x: 35, y: 0,  w: 30, h: 14, visible: false, src: "" },
    { id: "text-1",  type: "text",        x: 0,  y: 15, w: 100, h: 6, visible: true, content: "MI RESTAURANTE", fontSize: 13, fontWeight: 900, align: "center" },
    { id: "info-1",  type: "block_info",  x: 0,  y: 23, w: 100, h: 16, visible: true, fields: ["id", "date", "time", "table", "waiter"] },
    { id: "lines-1", type: "block_lines", x: 0,  y: 41, w: 100, h: 40, visible: true },
    { id: "tot-1",   type: "block_totals",x: 0,  y: 84, w: 100, h: 9, visible: true },
    { id: "foot-1",  type: "text",        x: 0,  y: 95, w: 100, h: 5, visible: true, content: "Gracias por su visita!", fontSize: 9, fontWeight: 700, align: "center" },
];

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
    ticket_paper_width: 58,
    ticket_header_text: "",
    ticket_footer_text: "",
    ticket_show_id: true,
    ticket_show_date: true,
    ticket_show_time: true,
    ticket_show_table: true,
    ticket_show_waiter: true,
    ticket_show_payment: true,
    ticket_show_vat: true,
    theme_mode: "light",
    theme_accent: "blue",
    theme_contrast: "normal",
    button_size: "md",
    grid_density: "normal",
    panel_layout: "horizontal",
    show_product_images: true,
};

const CACHE_KEY = "mozona.tenantSettings";

export function useTenantSettings() {
    const session = useActiveSession();
    const [settings, setSettings] = useState<TenantSettings>(() => {
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                return { ...DEFAULT_TENANT_SETTINGS, ...parsed };
            }
        } catch (_) {}
        return DEFAULT_TENANT_SETTINGS;
    });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Cargar desde Supabase
    const load = useCallback(async () => {
        if (!session.email && !session.isAuthenticated) return;
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (session.email) params.set("email", session.email);
            const r = await fetch(`/api/tenant-settings?${params.toString()}`);
            const json = await r.json();
            if (json.ok && json.settings) {
                const merged = { ...DEFAULT_TENANT_SETTINGS, ...json.settings };
                setSettings(merged);
                try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch (_) {}
            }
        } catch (e: any) {
            setError(e?.message || "Error cargando");
        }
        setLoading(false);
    }, [session.email, session.isAuthenticated]);

    // Guardar en Supabase
    const save = useCallback(async (newSettings: Partial<TenantSettings>) => {
        if (!session.email && !session.isAuthenticated) {
            setError("No hay sesión activa");
            return false;
        }
        setSaving(true);
        setError(null);
        try {
            const merged = { ...settings, ...newSettings };
            // Aplicar optimistamente
            setSettings(merged);
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch (_) {}

            const r = await fetch("/api/tenant-settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: session.email,
                    ...merged,
                }),
            });
            const json = await r.json();
            if (json.ok && json.settings) {
                const final = { ...DEFAULT_TENANT_SETTINGS, ...json.settings };
                setSettings(final);
                try { localStorage.setItem(CACHE_KEY, JSON.stringify(final)); } catch (_) {}
                setSaving(false);
                return true;
            } else {
                setError(json.error || "Error guardando");
                setSaving(false);
                return false;
            }
        } catch (e: any) {
            setError(e?.message || "Error guardando");
            setSaving(false);
            return false;
        }
    }, [settings, session.email, session.isAuthenticated]);

    // Cargar al montar
    useEffect(() => {
        if (session.isAuthenticated) {
            load();
        }
    }, [session.isAuthenticated, load]);

    return { settings, loading, saving, error, save, load, setSettings };
}
