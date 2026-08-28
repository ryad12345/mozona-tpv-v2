// =====================================================================
// MOZONA TPV — SettingsPage
// =====================================================================
// Personalización completa del restaurante (White-Label) y configuración
// fiscal VeriFactu. La página es self-contained: se le pasa el estado
// inicial y un callback de guardado. Cualquier consumidor (Tauri
// command, Supabase, mock) puede enchufarse vía `onSave`.
//
//   <SettingsPage
//      initial={restaurant}
//      onSave={async (data) => await localApi.updateRestaurant(data)}
//      onClose={() => nav(-1)}
//   />
//
// Estética: iOS / iPadOS Settings. Tarjetas blancas redondeadas,
// tipografía generosa, microinteracciones táctiles.
// =====================================================================

import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// Componentes de UI
import { Card, Field, TextInput, TextArea, Toggle } from "../components/settings/FormControls";
import { ColorPicker }                      from "../components/settings/ColorPicker";
import { ImageUploader }                    from "../components/settings/ImageUploader";
import { LiveTicketPreview }                from "../components/settings/LiveTicketPreview";
import { StoragePanel }                     from "../components/settings/StoragePanel";
import { BillingPanel }                     from "../components/settings/BillingPanel";
import { TeamPanel }                        from "../components/settings/TeamPanel";
import { LANConnectionPanel }               from "../components/settings/LANConnectionPanel";

// Iconos
import {
    IconReceipt, IconSparkles, IconShield,
    IconCheck, IconX, IconChevronLeft, IconPlus,
} from "../components/icons";

import { cn } from "../lib/cn";
import { isValidHex, isValidCifNif } from "../lib/validators";

// ---------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------

/** Estado del formulario. Se persiste tal cual en la tabla `restaurants`. */
export interface RestaurantForm {
    restaurant_id?:       string;
    business_name:        string;
    cif_nif:              string;
    address:              string;
    phone:                string;
    primary_color:        string;
    logo_url:             string | null;
    cover_url:            string | null;
    ticket_footer_msg:    string;
    print_logo_on_ticket: boolean;
    /** Serie de facturación por defecto. Ej: "F26", "T26", "R26" */
    default_series:       string;
    /** % de IVA por defecto (rellenado en el wizard de onboarding) */
    default_tax_rate?:    10 | 21;
}

export interface SettingsPageProps {
    /** Valores iniciales (de la DB) */
    initial: Partial<RestaurantForm>;
    /** Persistencia: devuelve la fila guardada */
    onSave:  (data: RestaurantForm) => Promise<void>;
    /** Volver atrás (opcional) */
    onClose?: () => void;
}

// ---------------------------------------------------------------------
// Estado inicial
// ---------------------------------------------------------------------

const DEFAULTS: RestaurantForm = {
    business_name:        "",
    cif_nif:              "",
    address:              "",
    phone:                "",
    primary_color:        "#2563EB",
    logo_url:             null,
    cover_url:            null,
    ticket_footer_msg:    "¡Gracias por su visita!",
    print_logo_on_ticket: true,
    default_series:       "T26",
};

// Series VeriFactu comunes (España)
const SERIES_PRESETS = [
    { value: "T26", label: "T26 — Ticket simplificado" },
    { value: "F26", label: "F26 — Factura completa" },
    { value: "R26", label: "R26 — Rectificativa" },
    { value: "A26", label: "A26 — Alquileres / otros" },
];

// ---------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------

export function SettingsPage({ initial, onSave, onClose }: SettingsPageProps) {
    // 0) Navegación ------------------------------------------------
    const navigate = useNavigate();
    
    // 1) Estado del formulario -----------------------------------------
    const [form, setForm] = useState<RestaurantForm>(() => ({
        ...DEFAULTS,
        ...initial,
    }));

    // 2) Flags UI ------------------------------------------------------
    const [saving, setSaving]   = useState(false);
    const [toast,  setToast]    = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
    const [touched, setTouched] = useState(false);
    const [activeTab, setActiveTab] = useState<"general" | "items" | "tables" | "categories">("general");

    // 3) Detección de cambios ------------------------------------------
    const isDirty = useMemo(() => {
        const a = JSON.stringify(form);
        const b = JSON.stringify({ ...DEFAULTS, ...initial });
        return a !== b;
    }, [form, initial]);

    // 4) Aplicar el color de marca como CSS variable (global) ----------
    useEffect(() => {
        document.documentElement.style.setProperty("--brand-color", form.primary_color);
    }, [form.primary_color]);

    // 5) Auto-hide del toast -------------------------------------------
    useEffect(() => {
        if (!toast) return;
        const id = window.setTimeout(() => setToast(null), 3000);
        return () => window.clearTimeout(id);
    }, [toast]);

    // 6) Handlers -------------------------------------------------------
    const update = useCallback(<K extends keyof RestaurantForm>(
        key: K,
        value: RestaurantForm[K]
    ) => {
        setForm(f => ({ ...f, [key]: value }));
        setTouched(true);
    }, []);

    // 7) Validación -----------------------------------------------------
    const errors = useMemo(() => validate(form), [form]);
    const hasErrors = Object.keys(errors).length > 0;

    // 8) Guardar --------------------------------------------------------
    const handleSave = async () => {
        if (hasErrors) return;
        setSaving(true);
        try {
            await onSave(form);
            setToast({ kind: "ok", msg: "Cambios guardados correctamente" });
            setTouched(false);
        } catch (e) {
            setToast({
                kind: "err",
                msg: e instanceof Error ? e.message : "Error al guardar",
            });
        } finally {
            setSaving(false);
        }
    };

    // 9) Render ---------------------------------------------------------
    return (
        <div className="min-h-screen bg-[#F0F2F5]">
            {/* HEADER ===================================================== */}
            <header
                className="
                    sticky top-0 z-30
                    h-16
                    flex items-center gap-3
                    px-5
                    bg-white/85 backdrop-blur-xl
                    border-b border-slate-200/80
                    shadow-[0_1px_0_rgba(15,23,42,0.04)]
                "
            >
                <button
                    onClick={() => navigate('/app')}
                    className="h-10 px-4 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-white font-bold rounded-xl flex items-center gap-2 transition active:scale-95"
                    title="Volver al TPV"
                >
                    ⬅ VOLVER AL TPV
                </button>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="
                            w-9 h-9 rounded-xl
                            flex items-center justify-center
                            text-slate-600
                            hover:bg-slate-100
                            active:scale-95 transition
                        "
                        title="Volver"
                    >
                        <IconChevronLeft size={20} strokeWidth={2} />
                    </button>
                )}
                <div className="flex-1">
                    <h1 className="text-[17px] font-bold text-slate-900 leading-tight">
                        Configuración
                    </h1>
                    <p className="text-[11.5px] text-slate-500">
                        Personaliza tu marca, datos fiscales y ticket
                    </p>
                </div>
                <SaveButton
                    dirty={isDirty}
                    saving={saving}
                    disabled={hasErrors}
                    onClick={handleSave}
                />
            </header>

            {/* TAB NAVIGATION ============================================ */}
            <div className="bg-white border-b border-slate-200/80 sticky top-16 z-20 px-5">
                <div className="flex gap-1">
                    <button
                        onClick={() => setActiveTab("general")}
                        className={cn(
                            "px-4 py-3 text-sm font-semibold border-b-2 transition",
                            activeTab === "general"
                                ? "border-blue-600 text-blue-600"
                                : "border-transparent text-slate-600 hover:text-slate-900"
                        )}
                    >
                        General
                    </button>
                    <button
                        onClick={() => setActiveTab("items")}
                        className={cn(
                            "px-4 py-3 text-sm font-semibold border-b-2 transition",
                            activeTab === "items"
                                ? "border-blue-600 text-blue-600"
                                : "border-transparent text-slate-600 hover:text-slate-900"
                        )}
                    >
                        Artículos
                    </button>
                    <button
                        onClick={() => setActiveTab("tables")}
                        className={cn(
                            "px-4 py-3 text-sm font-semibold border-b-2 transition",
                            activeTab === "tables"
                                ? "border-blue-600 text-blue-600"
                                : "border-transparent text-slate-600 hover:text-slate-900"
                        )}
                    >
                        Mesas
                    </button>
                    <button
                        onClick={() => setActiveTab("categories")}
                        className={cn(
                            "px-4 py-3 text-sm font-semibold border-b-2 transition",
                            activeTab === "categories"
                                ? "border-blue-600 text-blue-600"
                                : "border-transparent text-slate-600 hover:text-slate-900"
                        )}
                    >
                        Categorías
                    </button>
                </div>
            </div>

            {/* TOAST ======================================================= */}
            {toast && (
                <div
                    className={cn(
                        "fixed top-32 left-1/2 -translate-x-1/2 z-50",
                        "px-4 py-2.5 rounded-2xl shadow-lg",
                        "flex items-center gap-2",
                        "text-[13px] font-semibold",
                        "animate-[fadeInDown_0.2s_ease-out]",
                        toast.kind === "ok"
                            ? "bg-emerald-600 text-white"
                            : "bg-rose-600 text-white"
                    )}
                >
                    {toast.kind === "ok"
                        ? <IconCheck size={16} strokeWidth={2.4} />
                        : <IconX    size={16} strokeWidth={2.4} />}
                    {toast.msg}
                </div>
            )}

            {/* CONTENT ===================================================== */}
            <main className="max-w-6xl mx-auto p-5">
                {activeTab === "general" && (
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
                        <div className="space-y-5">

                        {/* 1) Branding & Tema Visual ------------------------ */}
                        <Card
                            title="Branding & Tema Visual"
                            subtitle="Color de marca, logotipo y portada"
                            icon={<IconSparkles size={18} strokeWidth={1.8} />}
                        >
                            <Field
                                label="Color Primario"
                                description="Se aplica a botones, acentos y bordes del TPV"
                            >
                                <ColorPicker
                                    value={form.primary_color}
                                    onChange={c => update("primary_color", c)}
                                />
                            </Field>

                            <div className="h-px bg-slate-100" />

                            <ImageUploader
                                label="Logotipo"
                                description="PNG con fondo transparente recomendado. Sale en la cabecera del TPV y opcionalmente en el ticket."
                                value={form.logo_url}
                                onChange={v => update("logo_url", v)}
                                variant="square"
                            />

                            <ImageUploader
                                label="Foto de Portada"
                                description="Imagen panorámica para la pantalla de bienvenida (opcional)"
                                value={form.cover_url}
                                onChange={v => update("cover_url", v)}
                                variant="wide"
                            />
                        </Card>

                        {/* 2) Datos Fiscales --------------------------------- */}
                        <Card
                            title="Datos Fiscales"
                            subtitle="Obligatorios para la emisión de facturas VeriFactu"
                            icon={<IconShield size={18} strokeWidth={1.8} />}
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field
                                    label="Nombre comercial"
                                    required
                                    error={errors.business_name}
                                >
                                    <TextInput
                                        value={form.business_name}
                                        onChange={e => update("business_name", e.target.value)}
                                        placeholder="Ej: Casa Manolo S.L."
                                        error={!!errors.business_name}
                                    />
                                </Field>
                                <Field
                                    label="CIF / NIF del titular"
                                    required
                                    description="Letra + 7-8 dígitos (empresa) o 8 dígitos + letra (persona)"
                                    error={errors.cif_nif}
                                >
                                    <TextInput
                                        value={form.cif_nif}
                                        onChange={e => update("cif_nif", e.target.value.toUpperCase())}
                                        placeholder="B12345678"
                                        maxLength={9}
                                        error={!!errors.cif_nif}
                                    />
                                </Field>
                            </div>
                            <Field
                                label="Dirección física"
                                required
                                error={errors.address}
                            >
                                <TextInput
                                    value={form.address}
                                    onChange={e => update("address", e.target.value)}
                                    placeholder="Calle Mayor 12, 28013 Madrid"
                                    error={!!errors.address}
                                />
                            </Field>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field
                                    label="Teléfono"
                                    description="Sale en la cabecera del ticket"
                                >
                                    <TextInput
                                        type="tel"
                                        value={form.phone}
                                        onChange={e => update("phone", e.target.value)}
                                        placeholder="+34 910 000 000"
                                    />
                                </Field>
                                <Field
                                    label="Serie por defecto"
                                    description="Prefijo de la numeración de facturas"
                                >
                                    <SeriesSelect
                                        value={form.default_series}
                                        onChange={v => update("default_series", v)}
                                    />
                                </Field>
                            </div>
                        </Card>

                        {/* 3) Personalización del Ticket -------------------- */}
                        <Card
                            title="Personalización del Ticket"
                            subtitle="Pie de ticket y opciones de impresión"
                            icon={<IconReceipt size={18} strokeWidth={1.8} />}
                        >
                            <Field
                                label="Mensaje de pie de ticket"
                                description="Aparece al final del recibo, antes del corte de papel"
                            >
                                <TextArea
                                    value={form.ticket_footer_msg}
                                    onChange={e => update("ticket_footer_msg", e.target.value)}
                                    placeholder="¡Gracias por su visita!"
                                    rows={2}
                                    maxLength={120}
                                />
                                <div className="text-right text-[10.5px] text-slate-400 mt-1">
                                    {form.ticket_footer_msg.length} / 120
                                </div>
                            </Field>
                            <div className="h-px bg-slate-100" />
                            <Toggle
                                checked={form.print_logo_on_ticket}
                                onChange={v => update("print_logo_on_ticket", v)}
                                label="Imprimir logotipo en el ticket"
                                description="Si está desactivado, el ticket sólo llevará los datos fiscales"
                                disabled={!form.logo_url}
                            />
                        </Card>

                        {/* 4) Equipo (camareros) ------------------------------ */}
                        <TeamPanel />

                        {/* 5) Conexión de comanderos (LAN / QR) --------------- */}
                        <LANConnectionPanel publicUrl="https://mozona-tpv.vercel.app" />

                        {/* 6) Plan y facturación ------------------------------ */}
                        <BillingPanel />

                        {/* 7) Almacenamiento y Sincronización ---------------- */}
                        <StoragePanel />

                        {/* Pie de página ------------------------------------ */}
                        <div className="text-center text-[11.5px] text-slate-400 py-4">
                            MOZONA TPV · v0.1.0 · Los cambios se aplican al guardar
                        </div>
                        </div>
                        <aside className="lg:order-last">
                            <LiveTicketPreview form={form} />
                        </aside>
                    </div>
                )}

                {activeTab === "items" && (
                    <div className="space-y-5">
                        <Card
                            title="Gestión de Artículos"
                            subtitle="Añade, edita o elimina platos y bebidas"
                            icon={<IconSparkles size={18} strokeWidth={1.8} />}
                        >
                            <div className="space-y-3">
                                <button
                                    className="w-full h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition active:scale-95"
                                >
                                    <IconPlus size={18} strokeWidth={2} /> Nuevo Artículo
                                </button>
                                <div className="text-sm text-slate-600 py-8 text-center">
                                    Funcionalidad de gestión de artículos en desarrollo
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                {activeTab === "tables" && (
                    <div className="space-y-5">
                        <Card
                            title="Gestión de Mesas"
                            subtitle="Define mesas, números y zonas (Sala, Terraza, Barra)"
                            icon={<IconSparkles size={18} strokeWidth={1.8} />}
                        >
                            <div className="space-y-3">
                                <button
                                    className="w-full h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition active:scale-95"
                                >
                                    <IconPlus size={18} strokeWidth={2} /> Nueva Mesa
                                </button>
                                <div className="text-sm text-slate-600 py-8 text-center">
                                    Funcionalidad de gestión de mesas en desarrollo
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                {activeTab === "categories" && (
                    <div className="space-y-5">
                        <Card
                            title="Gestión de Categorías"
                            subtitle="Crea y ordena categorías (Entrantes, Carnes, Pescados, etc.)"
                            icon={<IconSparkles size={18} strokeWidth={1.8} />}
                        >
                            <div className="space-y-3">
                                <button
                                    className="w-full h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition active:scale-95"
                                >
                                    <IconPlus size={18} strokeWidth={2} /> Nueva Categoría
                                </button>
                                <div className="text-sm text-slate-600 py-8 text-center">
                                    Funcionalidad de gestión de categorías en desarrollo
                                </div>
                            </div>
                        </Card>
                    </div>
                )}
            </main>

            {/* BARRA INFERIOR FIJA EN MÓVIL ================================ */}
            <div
                className="
                    lg:hidden sticky bottom-0
                    bg-white/95 backdrop-blur-xl
                    border-t border-slate-200/80
                    p-3
                    flex items-center justify-between gap-3
                "
            >
                <div className="text-[11px] text-slate-500">
                    {touched ? "Tienes cambios sin guardar" : "Sin cambios"}
                </div>
                <SaveButton
                    dirty={isDirty}
                    saving={saving}
                    disabled={hasErrors}
                    onClick={handleSave}
                />
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------
// Subcomponentes privados
// ---------------------------------------------------------------------

function SeriesSelect({
    value, onChange,
}: { value: string; onChange: (v: string) => void }) {
    const isPreset = SERIES_PRESETS.some(s => s.value === value);
    return (
        <div className="flex gap-2">
            <select
                value={isPreset ? value : "__custom__"}
                onChange={e => {
                    if (e.target.value !== "__custom__") onChange(e.target.value);
                }}
                className="
                    h-11 px-3 rounded-xl border border-slate-200
                    bg-white text-[14px] text-slate-900
                    focus:border-blue-500 focus:ring-2 focus:ring-blue-100
                    outline-none transition
                "
            >
                {SERIES_PRESETS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                ))}
                <option value="__custom__">Personalizado…</option>
            </select>
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
                maxLength={4}
                spellCheck={false}
                placeholder="T26"
                className="
                    w-24 h-11 px-3 rounded-xl border border-slate-200
                    bg-white text-[14px] font-mono font-bold text-slate-900
                    text-center uppercase
                    focus:border-blue-500 focus:ring-2 focus:ring-blue-100
                    outline-none transition
                "
            />
        </div>
    );
}

function SaveButton({
    dirty, saving, disabled, onClick,
}: {
    dirty:    boolean;
    saving:   boolean;
    disabled: boolean;
    onClick:  () => void;
}) {
    return (
        <button
            onClick={onClick}
            disabled={!dirty || saving || disabled}
            className={cn(
                "h-10 px-5 rounded-xl",
                "inline-flex items-center gap-2",
                "text-[13.5px] font-bold",
                "transition select-none",
                "active:scale-95",
                !dirty || disabled
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30 hover:bg-emerald-700"
            )}
        >
            {saving ? (
                <>
                    <Spinner /> Guardando…
                </>
            ) : (
                <>
                    <IconCheck size={16} strokeWidth={2.4} />
                    {dirty ? "Guardar Cambios" : "Guardado"}
                </>
            )}
        </button>
    );
}

function Spinner() {
    return (
        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path
                d="M21 12a9 9 0 0 1-9 9"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
            />
        </svg>
    );
}

// ---------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------

function validate(f: RestaurantForm): Partial<Record<keyof RestaurantForm, string>> {
    const errs: Partial<Record<keyof RestaurantForm, string>> = {};
    if (!f.business_name.trim())              errs.business_name = "Requerido";
    if (!f.cif_nif.trim())                    errs.cif_nif       = "Requerido";
    else if (!isValidCifNif(f.cif_nif))       errs.cif_nif       = "Formato no válido";
    if (!f.address.trim())                    errs.address       = "Requerido";
    if (!isValidHex(f.primary_color))         errs.primary_color = "Hex no válido";
    if (!f.default_series.trim())             errs.default_series = "Requerido";
    return errs;
}
