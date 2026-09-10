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
