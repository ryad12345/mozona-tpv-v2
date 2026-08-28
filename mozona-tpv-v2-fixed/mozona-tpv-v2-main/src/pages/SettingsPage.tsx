// =====================================================================
// MOZONA TPV — SettingsPage (gestión completa del local)
// =====================================================================

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ItemsPanel }      from "../components/settings/ItemsPanel";
import { TablesPanel }     from "../components/settings/TablesPanel";
import { CategoriesPanel } from "../components/settings/CategoriesPanel";
import { TeamPanel }       from "../components/settings/TeamPanel";
import { LANConnectionPanel } from "../components/settings/LANConnectionPanel";
import { BillingPanel }    from "../components/settings/BillingPanel";
import { StoragePanel }    from "../components/settings/StoragePanel";
import { LiveTicketPreview } from "../components/settings/LiveTicketPreview";
import { useAuth } from "../lib/auth";
import { isSupabaseConfigured } from "../lib/supabase";
import type { Restaurant } from "../lib/types";

/** Form del restaurante — incluye campos extra que la UI usa (logo, footer, etc.) */
export interface RestaurantForm {
    restaurant_id?:        string;
    business_name?:        string;
    cif_nif?:              string;
    address?:              string;
    phone?:                string | null;
    primary_color?:        string;
    ticket_footer_msg?:    string;
    print_logo_on_ticket?: boolean;
    logo_url?:             string | null;
    default_series?:       string;
    default_tax_rate?:     number;
    [key: string]:         unknown;
}

export interface SettingsPageProps {
    initial?: RestaurantForm;
    onSave?:  (data: RestaurantForm) => void;
}

type Tab = "general" | "articulos" | "categorias" | "mesas" | "equipo" | "conexion" | "plan" | "almacen" | "ticket";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
    { id: "general",    label: "Empresa",     icon: "🏪" },
    { id: "articulos",  label: "Productos",   icon: "🍽" },
    { id: "categorias", label: "Categorías",  icon: "🗂" },
    { id: "mesas",      label: "Mesas",       icon: "🪑" },
    { id: "equipo",     label: "Camareros",   icon: "👥" },
    { id: "conexion",   label: "Conexión",    icon: "📡" },
    { id: "plan",       label: "Plan",        icon: "💳" },
    { id: "almacen",    label: "Almacén",     icon: "💾" },
    { id: "ticket",     label: "Ticket",      icon: "🧾" },
];

export function SettingsPage({ initial, onSave }: SettingsPageProps) {
    const navigate = useNavigate();
    const auth = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>("general");
    const [formData, setFormData]   = useState<RestaurantForm>(initial || {});

    const handleGeneralSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (onSave) onSave(formData);
    };

    return (
        <div className="min-h-dvh w-full bg-slate-100 dark:bg-slate-900 flex flex-col">
            {/* Cabecera */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur sticky top-0 z-20">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigate("/app")}
                        className="h-9 px-3 bg-white dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700
                                   text-slate-800 dark:text-white font-bold text-[11px] rounded-xl
                                   shadow-sm border border-slate-200 dark:border-slate-700
                                   flex items-center gap-1.5 transition active:scale-95">
                        ← TPV
                    </button>
                    <div>
                        <h1 className="text-[15px] font-black text-slate-900 dark:text-white">
                            Configuración
                        </h1>
                        <p className="text-[10.5px] text-slate-500">
                            {auth.tenant?.name ?? "Tu local"} · {auth.tenant?.plan ?? "free"}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col md:flex-row gap-4 p-4 sm:p-6 max-w-6xl mx-auto w-full">
                {/* Sidebar de tabs (md+) */}
                <nav className="md:w-56 shrink-0">
                    <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible pb-1">
                        {TABS.map(t => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setActiveTab(t.id)}
                                className={`shrink-0 md:w-full text-left px-3 h-9 rounded-xl
                                            text-[12px] font-bold transition flex items-center gap-2
                                            ${activeTab === t.id
                                                ? "bg-blue-600 text-white shadow-sm"
                                                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"}`}>
                                <span className="text-[14px]">{t.icon}</span>
                                {t.label}
                            </button>
                        ))}
                    </div>
                </nav>

                {/* Contenido */}
                <div className="flex-1 bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm min-w-0">
                    {activeTab === "general" && (
                        <form onSubmit={handleGeneralSave} className="flex flex-col gap-4 max-w-lg">
                            <div>
                                <h2 className="text-[15px] font-black text-slate-900 dark:text-white">Datos del local</h2>
                                <p className="text-[11.5px] text-slate-500">Aparecen en tickets y facturas.</p>
                            </div>
                            <Field label="Nombre del Negocio">
                                <input type="text" value={formData.business_name ?? ""}
                                       onChange={e => setFormData({ ...formData, business_name: e.target.value })}
                                       className="input" />
                            </Field>
                            <Field label="NIF / CIF">
                                <input type="text" value={formData.cif_nif ?? ""}
                                       onChange={e => setFormData({ ...formData, cif_nif: e.target.value })}
                                       className="input" />
                            </Field>
                            <Field label="Dirección">
                                <input type="text" value={formData.address ?? ""}
                                       onChange={e => setFormData({ ...formData, address: e.target.value })}
                                       className="input" />
                            </Field>
                            <Field label="Teléfono">
                                <input type="text" value={formData.phone ?? ""}
                                       onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                       className="input" />
                            </Field>
                            <button type="submit"
                                    className="self-start px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white
                                               rounded-lg text-xs font-bold active:scale-95 transition">
                                Guardar Datos
                            </button>
                            {!isSupabaseConfigured && (
                                <p className="text-[10.5px] text-amber-600">
                                    ⚠ Modo demo: los cambios no se persisten en la nube.
                                </p>
                            )}
                        </form>
                    )}

                    {activeTab === "articulos"  && <ItemsPanel />}
                    {activeTab === "categorias" && <CategoriesPanel />}
                    {activeTab === "mesas"      && <TablesPanel />}
                    {activeTab === "equipo"     && <TeamPanel />}
                    {activeTab === "conexion"   && <LANConnectionPanel publicUrl="https://mozona-tpv.vercel.app" />}
                    {activeTab === "plan"       && <BillingPanel />}
                    {activeTab === "almacen"    && <StoragePanel />}
                    {activeTab === "ticket"     && <LiveTicketPreview form={{
                        business_name: formData.business_name ?? "MOZONA TPV",
                        cif_nif:       formData.cif_nif ?? "—",
                        address:       formData.address ?? "",
                        phone:         formData.phone ?? null,
                        primary_color: "#2563EB",
                        ticket_footer_msg: "¡Gracias por su visita!",
                        print_logo_on_ticket: false,
                        logo_url:      null,
                        default_series: "T26",
                    }} />}
                </div>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="text-[10.5px] font-semibold text-slate-500 block mb-1">{label}</label>
            {children}
        </div>
    );
}

export default SettingsPage;
