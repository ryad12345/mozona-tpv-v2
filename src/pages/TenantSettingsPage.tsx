// =====================================================================
// MOZONA TPV — TenantSettingsPage (v3.4.0)
// =====================================================================
// Configuración personalizable por tenant:
//   - Diseño de tickets térmicos (preview en vivo)
//   - Tema visual (claro/oscuro/auto + acento + contraste)
//   - UI (tamaño de botones, densidad, layout)
// =====================================================================

import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveSession } from "../hooks/useActiveSession";
import { useTenantSettings, DEFAULT_TENANT_SETTINGS, type TenantSettings } from "../hooks/useTenantSettings";
import { useTheme } from "../context/ThemeContext";
import { buildTicketText, buildTicketHTML, type TicketOptions } from "../lib/ticketPrinter";
import { IconShield, IconCheck, IconUser, IconLock } from "../components/icons";

const COMPANY_PRESETS = [
    { name: "MOZONA TPV", nif: "B00000000", address: "", phone: "" },
    { name: "MI RESTAURANTE", nif: "B12345678", address: "Calle Mayor 1, Madrid", phone: "+34 600 000 000" },
    { name: "BAR LA ESQUINA", nif: "B87654321", address: "Av. Andalucía 22, Sevilla", phone: "+34 954 000 000" },
];

const PAPER_WIDTHS = [
    { value: 58, label: "58mm (32 cols)" },
    { value: 80, label: "80mm (42 cols)" },
];

const ACCENT_OPTIONS = [
    { value: "blue",   label: "Azul",   color: "#2563eb" },
    { value: "green",  label: "Verde",  color: "#16a34a" },
    { value: "orange", label: "Naranja", color: "#ea580c" },
    { value: "red",    label: "Rojo",   color: "#dc2626" },
    { value: "violet", label: "Violeta", color: "#7c3aed" },
];

const BUTTON_SIZES = [
    { value: "sm", label: "Pequeño (36px)" },
    { value: "md", label: "Mediano (44px)" },
    { value: "lg", label: "Grande (56px)" },
];

const GRID_DENSITIES = [
    { value: "compact", label: "Compacto (5 cols)" },
    { value: "normal", label: "Normal (4 cols)" },
    { value: "comfortable", label: "Cómodo (3 cols)" },
];

const PANEL_LAYOUTS = [
    { value: "horizontal", label: "Horizontal" },
    { value: "vertical", label: "Vertical" },
];

export function TenantSettingsPage() {
    const navigate = useNavigate();
    const session = useActiveSession();
    const { settings, saving, save, error } = useTenantSettings();
    const { isDark } = useTheme();
    const [localSettings, setLocalSettings] = useState<TenantSettings>(settings);
    const [savedOk, setSavedOk] = useState(false);

    // Si no hay sesión, redirigir a /auth
    useEffect(() => {
        if (session.isReady && !session.isAuthenticated) {
            navigate("/auth", { replace: true });
        }
    }, [session.isReady, session.isAuthenticated, navigate]);

    // Sincronizar settings remotos
    useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);

    // ★ Preview del ticket en tiempo real
    const previewText = useMemo(() => {
        const opts: TicketOptions = {
            lines: [
                { name: "Tajin de carne picada", quantity: 1, unit_price: 8.00, tax_rate: 10 },
                { name: "Pan", quantity: 1, unit_price: 1.00, tax_rate: 10 },
                { name: "Coca-Cola", quantity: 2, unit_price: 2.50, tax_rate: 10 },
            ],
            series: "PRE",
            invoiceNumber: 1,
            tableNumber: 5,
            waiterName: "Juan",
            paymentMethod: "Efectivo",
            createdAt: Date.now(),
            paperWidth: localSettings.ticket_paper_width as 58 | 80,
            showTax: localSettings.ticket_show_vat,
            headerMsg: localSettings.ticket_header_text,
            footerMsg: localSettings.ticket_footer_text,
            settings: {
                company_name: COMPANY_PRESETS[0].name,
                cif_nif: "",
                address: "",
                phone: "",
            } as any,
        };
        try {
            return buildTicketText(opts);
        } catch (e) {
            return "Error generando preview";
        }
    }, [localSettings]);

    const handleSave = async () => {
        const ok = await save(localSettings);
        if (ok) setSavedOk(true);
        setTimeout(() => setSavedOk(false), 3000);
    };

    const update = <K extends keyof TenantSettings>(key: K, value: TenantSettings[K]) => {
        setLocalSettings(prev => ({ ...prev, [key]: value }));
    };

    if (!session.isReady) {
        return <div className="p-8 text-center text-slate-500">Cargando...</div>;
    }
    if (!session.isAuthenticated) {
        return <div className="p-8 text-center text-slate-500">Redirigiendo al login...</div>;
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
            <div className="max-w-6xl mx-auto space-y-4">
                {/* Cabecera */}
                <div className="bg-gradient-to-br from-blue-600 via-violet-600 to-blue-700 rounded-3xl shadow-2xl p-6 text-white">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <IconShield size={32} />
                            <div>
                                <h1 className="text-2xl font-black">Personalización</h1>
                                <p className="text-[12.5px] text-blue-100">
                                    Configura tu espacio · {session.email}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => navigate("/app")}
                            className="h-10 px-4 rounded-lg bg-white/20 hover:bg-white/30 text-white text-[12.5px] font-bold"
                        >
                            ← Volver
                        </button>
                    </div>
                </div>

                {/* Mensajes */}
                {savedOk && (
                    <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 flex items-center gap-2">
                        <IconCheck size={18} className="text-emerald-600" />
                        <span className="text-[12.5px] text-emerald-900 font-semibold">Configuración guardada</span>
                    </div>
                )}
                {error && (
                    <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4">
                        <span className="text-[12.5px] text-rose-900 font-semibold">❌ {error}</span>
                    </div>
                )}

                {/* ★ Editor de Tickets con Preview en Vivo */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Columna configuración */}
                    <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
                        <h2 className="text-lg font-black flex items-center gap-2">
                            🧾 Diseño del ticket
                        </h2>

                        {/* Ancho del rollo */}
                        <div>
                            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Ancho del rollo</label>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                {PAPER_WIDTHS.map(p => (
                                    <button
                                        key={p.value}
                                        onClick={() => update("ticket_paper_width", p.value as 58 | 80)}
                                        className={`h-10 rounded-lg text-[12.5px] font-bold border-2 transition ${
                                            localSettings.ticket_paper_width === p.value
                                                ? "bg-blue-600 text-white border-blue-600"
                                                : "bg-white text-slate-700 border-slate-200 hover:border-blue-300"
                                        }`}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Textos */}
                        <div>
                            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Cabecera</label>
                            <input
                                type="text"
                                value={localSettings.ticket_header_text}
                                onChange={e => update("ticket_header_text", e.target.value)}
                                placeholder="Ej: PRE-CUENTA, TICKET..."
                                className="w-full h-10 mt-2 px-3 rounded-lg border border-slate-300 text-[12.5px]"
                            />
                        </div>
                        <div>
                            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Pie de página</label>
                            <textarea
                                value={localSettings.ticket_footer_text}
                                onChange={e => update("ticket_footer_text", e.target.value)}
                                placeholder="Ej: Gracias por su visita!"
                                rows={2}
                                className="w-full mt-2 px-3 py-2 rounded-lg border border-slate-300 text-[12.5px]"
                            />
                        </div>

                        {/* Toggles */}
                        <div>
                            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Elementos visibles</label>
                            <div className="space-y-1.5 mt-2">
                                {[
                                    ["ticket_show_id", "ID de ticket"],
                                    ["ticket_show_date", "Fecha"],
                                    ["ticket_show_time", "Hora"],
                                    ["ticket_show_table", "Mesa"],
                                    ["ticket_show_waiter", "Camarero"],
                                    ["ticket_show_payment", "Método de pago"],
                                    ["ticket_show_vat", "Desglose IVA"],
                                ].map(([key, label]) => (
                                    <label key={key} className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-50">
                                        <input
                                            type="checkbox"
                                            checked={localSettings[key as keyof TenantSettings] as boolean}
                                            onChange={e => update(key as keyof TenantSettings, e.target.checked as any)}
                                            className="w-4 h-4 accent-blue-600"
                                        />
                                        <span className="text-[12.5px]">{label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Columna preview */}
                    <div className="bg-white rounded-2xl shadow-xl p-6">
                        <h2 className="text-lg font-black mb-3">Vista previa</h2>
                        <div className="bg-slate-100 p-4 rounded-xl">
                            <div
                                className="bg-white mx-auto shadow-lg"
                                style={{
                                    width: localSettings.ticket_paper_width === 58 ? "220px" : "300px",
                                    padding: "12px",
                                    fontFamily: "'Courier New', monospace",
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    lineHeight: 1.3,
                                    whiteSpace: "pre",
                                    color: "#000",
                                    border: "1px solid #cbd5e1",
                                }}
                            >
                                {previewText}
                            </div>
                        </div>
                        <p className="text-[10.5px] text-slate-500 text-center mt-2">
                            Vista previa en blanco y negro (la impresión real usa el tamaño exacto del rollo)
                        </p>
                    </div>
                </div>

                {/* ★ Tema y estilo */}
                <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
                    <h2 className="text-lg font-black flex items-center gap-2">
                        🎨 Tema y estilo
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Modo</label>
                            <select
                                value={localSettings.theme_mode}
                                onChange={e => update("theme_mode", e.target.value as any)}
                                className="w-full h-10 mt-2 px-3 rounded-lg border border-slate-300 text-[12.5px]"
                            >
                                <option value="light">☀️ Claro</option>
                                <option value="dark">🌙 Oscuro</option>
                                <option value="auto">⚙️ Auto (sistema)</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Color de acento</label>
                            <div className="grid grid-cols-5 gap-1 mt-2">
                                {ACCENT_OPTIONS.map(a => (
                                    <button
                                        key={a.value}
                                        onClick={() => update("theme_accent", a.value as any)}
                                        className={`h-10 rounded-lg border-2 transition ${
                                            localSettings.theme_accent === a.value
                                                ? "border-slate-900 scale-110"
                                                : "border-slate-200"
                                        }`}
                                        style={{ background: a.color }}
                                        title={a.label}
                                    />
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Contraste</label>
                            <select
                                value={localSettings.theme_contrast}
                                onChange={e => update("theme_contrast", e.target.value as any)}
                                className="w-full h-10 mt-2 px-3 rounded-lg border border-slate-300 text-[12.5px]"
                            >
                                <option value="normal">Normal</option>
                                <option value="high">Alto (accesibilidad)</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Tamaño botones</label>
                            <select
                                value={localSettings.button_size}
                                onChange={e => update("button_size", e.target.value as any)}
                                className="w-full h-10 mt-2 px-3 rounded-lg border border-slate-300 text-[12.5px]"
                            >
                                {BUTTON_SIZES.map(b => (
                                    <option key={b.value} value={b.value}>{b.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Densidad cuadrícula</label>
                            <select
                                value={localSettings.grid_density}
                                onChange={e => update("grid_density", e.target.value as any)}
                                className="w-full h-10 mt-2 px-3 rounded-lg border border-slate-300 text-[12.5px]"
                            >
                                {GRID_DENSITIES.map(g => (
                                    <option key={g.value} value={g.value}>{g.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Disposición</label>
                            <select
                                value={localSettings.panel_layout}
                                onChange={e => update("panel_layout", e.target.value as any)}
                                className="w-full h-10 mt-2 px-3 rounded-lg border border-slate-300 text-[12.5px]"
                            >
                                {PANEL_LAYOUTS.map(p => (
                                    <option key={p.value} value={p.value}>{p.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Botón guardar */}
                <div className="bg-white rounded-2xl shadow-xl p-4 flex justify-end gap-2">
                    <button
                        onClick={() => setLocalSettings(settings)}
                        className="h-11 px-5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[13px] font-bold"
                    >
                        Descartar cambios
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="h-11 px-6 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-[13px] font-black flex items-center gap-2"
                    >
                        {saving ? "Guardando..." : <><IconCheck size={14} /> Guardar configuración</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default TenantSettingsPage;
