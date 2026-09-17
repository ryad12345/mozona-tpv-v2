// =====================================================================
// MOZONA TPV — SettingsPage (versión completa, todas las pestañas)
// =====================================================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ItemsPanel } from '../components/settings/ItemsPanel';
import { TablesPanel } from '../components/settings/TablesPanel';
import { CategoriesPanel } from '../components/settings/CategoriesPanel';
import { TeamPanel } from '../components/settings/TeamPanel';
import { LiveTicketPreview, type RestaurantForm } from '../components/settings/LiveTicketPreview';
import { loadTicketSettings, saveTicketSettings } from '../lib/ticketSettings';
import { BillingPanel } from '../components/settings/BillingPanel';
import { StoragePanel } from '../components/settings/StoragePanel';
import { SalesPanel } from '../components/settings/SalesPanel';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { resolveRealTenantId } from '../lib/waiters';

type Tab =
    | 'empresa'
    | 'productos'
    | 'categorias'
    | 'mesas'
    | 'camareros'
    | 'ticket'
    | 'ventas'
    | 'plan'
    | 'almacen';

const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'empresa',     label: 'Empresa',     icon: '🏢' },
    { id: 'productos',   label: 'Productos',   icon: '🍽️' },
    { id: 'categorias',  label: 'Categorías',  icon: '🗂️' },
    { id: 'mesas',       label: 'Mesas',       icon: '🪑' },
    { id: 'camareros',   label: 'Camareros',   icon: '👥' },
    { id: 'ticket',      label: 'Ticket',      icon: '🧾' },
    { id: 'ventas',      label: 'Ventas',      icon: '📊' },
    { id: 'plan',        label: 'Plan',        icon: '💳' },
    { id: 'almacen',     label: 'Almacén',     icon: '💾' },
];

export function SettingsPage() {
    const navigate = useNavigate();
    const auth = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('empresa');

    // Empresa (persistido en `tenants`)
    const [empresa, setEmpresa] = useState({
        name:       '',
        nif:        '',
        address:    '',
        phone:      '',
    });
    const [loading,  setLoading] = useState(false);
    const [saving,   setSaving]  = useState(false);
    const [msg,      setMsg]     = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    // Ticket (parte de `tenants`)
    const [ticketForm, setTicketForm] = useState<RestaurantForm>({
        name:    '',
        nif:     '',
        address: '',
        phone:   '',
        header_msg: '',
        footer_msg: '¡Gracias por su visita!',
        showTax:    true,
    });

    // Cargar datos del tenant (empresa + ticket)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!isSupabaseConfigured || !auth.user) return;
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from("tenants")
                    .select("name, cif_nif, address, phone, ticket_header_msg, ticket_footer_msg, ticket_show_tax")
                    .eq("owner_id", auth.user.id)
                    .maybeSingle();
                if (cancelled) return;
                if (error) {
                    console.warn("[SettingsPage] load error:", error.message);
                }
                if (data) {
                    setEmpresa({
                        name:    data.name     ?? '',
                        nif:     data.cif_nif  ?? '',
                        address: data.address  ?? '',
                        phone:   data.phone    ?? '',
                    });
                    setTicketForm({
                        ...ticketForm,
                        name:        data.name     ?? '',
                        nif:         data.cif_nif  ?? '',
                        address:     data.address  ?? '',
                        phone:       data.phone    ?? '',
                        header_msg:  (data as any).ticket_header_msg ?? '',
                        footer_msg:  data.ticket_footer_msg ?? '¡Gracias por su visita!',
                        showTax:     (data as any).ticket_show_tax ?? true,
                    });
                }
                // ★ v1.9.13: además cargar config de ticket_settings
                const ts = await loadTicketSettings();
                if (!cancelled) {
                    setTicketForm(prev => ({
                        ...prev,
                        header_msg:  ts.header_text ?? prev.header_msg ?? '',
                        footer_msg:  ts.footer_text ?? prev.footer_msg ?? '¡Gracias por su visita!',
                        showTax:     ts.show_vat_breakdown ?? prev.showTax ?? true,
                    }));
                }
            } catch (e) {
                console.warn("[SettingsPage] load exception:", e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auth.user]);

    const saveEmpresa = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!auth.user) {
            setMsg({ kind: 'err', text: 'No hay sesión activa' });
            return;
        }
        setSaving(true);
        setMsg(null);
        try {
            // ★ v1.9.4: owner_id no existe, usar localStorage + intentar BD
            const tenantId = (await resolveRealTenantId(null)) || "58a8e6f5-3172-409c-8aa5-ae02be0b7e76";
            // Guardar SIEMPRE en localStorage como respaldo
            localStorage.setItem("mozona.empresa", JSON.stringify(empresa));

            // ★ v1.9.16: upsert directo en ticket_settings
            //   El ticket se imprime desde about:blank y NO puede leer
            //   localStorage, así que la Empresa vive también en BD.
            const tsResult = await saveTicketSettings({
                company_name: empresa.name?.trim()    || "",
                nif:          empresa.nif?.trim()      || "",
                address:      empresa.address?.trim() || "",
                phone:        empresa.phone?.trim()   || "",
            });
            const empresaSource = tsResult.source;

            // Mantener también el intento en `tenants` (best-effort)
            try {
                await supabase
                    .from("tenants")
                    .update({
                        name:    empresa.name.trim()    || null,
                        cif_nif: empresa.nif.trim()      || null,
                        address: empresa.address.trim() || null,
                        phone:   empresa.phone.trim()   || null,
                    })
                    .eq("id", tenantId);
            } catch (e) { /* silenciado: la fuente de verdad es ticket_settings */ }

            setMsg({
                kind: 'ok',
                text: empresaSource === "db"
                    ? 'Datos de empresa guardados (BD).'
                    : 'Guardado en local (BD no disponible).'
            });
        } catch (e) {
            setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Error al guardar' });
        }
        setSaving(false);
    };

    const saveTicket = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!auth.user) {
            setMsg({ kind: 'err', text: 'No hay sesión activa' });
            return;
        }
        setSaving(true);
        setMsg(null);
        try {
            // ★ v1.9.13: usar tabla dedicada ticket_settings
            localStorage.setItem("mozona.ticket_config", JSON.stringify(ticketForm));

            const result = await saveTicketSettings({
                header_text:        ticketForm.header_msg ?? "",
                footer_text:        ticketForm.footer_msg ?? "¡Gracias por su visita!",
                show_vat_breakdown: ticketForm.showTax ?? true,
                paper_width_mm:     80,
            });
            if (result.source === "db") {
                setMsg({ kind: 'ok', text: 'Configuración del ticket guardada.' });
            } else {
                setMsg({ kind: 'ok', text: 'Guardado en local (BD no disponible)' });
            }
        } catch (e) {
            setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Error al guardar' });
        }
        setSaving(false);
    };

    return (
        <div className="min-h-dvh w-full bg-slate-100 flex flex-col p-3 sm:p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-4">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigate('/app')}
                        className="h-9 px-3 bg-white text-slate-800 font-bold text-xs rounded-xl shadow-sm border border-slate-200 flex items-center gap-1.5 active:scale-95 transition"
                    >
                        ⬅ Volver al TPV
                    </button>
                    <div>
                        <h1 className="text-lg sm:text-xl font-black text-slate-900">Configuración</h1>
                        <p className="text-[11px] text-slate-500">Empresa, menú, mesas, camareros, ticket</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {/* ★ v3.5.0: AI Studio */}
                    <button
                        type="button"
                        onClick={() => navigate('/ai-studio')}
                        className="h-9 px-3.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 active:scale-95 transition"
                        title="IA local: facturas, voz, precios"
                    >
                        🤖 AI Studio
                    </button>
                    {/* ★ v3.4.5: Acceso a Personalización (editor visual de tickets + temas) */}
                    <button
                        type="button"
                        onClick={() => navigate('/tenant-settings')}
                        className="h-9 px-3.5 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 active:scale-95 transition"
                        title="Editor visual de tickets, temas y estilos"
                    >
                        🎨 Personalizar
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => { setActiveTab(t.id); setMsg(null); }}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
                            activeTab === t.id
                                ? 'bg-blue-600 text-white shadow'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                        <span className="mr-1">{t.icon}</span>{t.label}
                    </button>
                ))}
            </div>

            {msg && (
                <div className={`mb-3 p-3 rounded-xl text-[12.5px] ${
                    msg.kind === 'ok'
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border border-rose-200 text-rose-800'
                }`}>
                    {msg.text}
                </div>
            )}

            {/* ============ EMPRESA ============ */}
            {activeTab === 'empresa' && (
                <form onSubmit={saveEmpresa} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 max-w-2xl space-y-3">
                    <h3 className="text-base font-bold text-slate-900">Datos de la empresa</h3>
                    <p className="text-[11px] text-slate-500 -mt-2">Aparecen en la cabecera del ticket / pre-cuenta.</p>
                    <Field label="Nombre del restaurante">
                        <input type="text" value={empresa.name}
                               onChange={e => setEmpresa({ ...empresa, name: e.target.value })}
                               placeholder="Ej. Restaurante El Rincón de Casablanca"
                               className="input" />
                    </Field>
                    <Field label="NIF / CIF">
                        <input type="text" value={empresa.nif}
                               onChange={e => setEmpresa({ ...empresa, nif: e.target.value })}
                               placeholder="Ej. B12345678"
                               className="input" />
                    </Field>
                    <Field label="Dirección">
                        <input type="text" value={empresa.address}
                               onChange={e => setEmpresa({ ...empresa, address: e.target.value })}
                               placeholder="Ej. Calle Mayor 12, Madrid"
                               className="input" />
                    </Field>
                    <Field label="Teléfono">
                        <input type="tel" value={empresa.phone}
                               onChange={e => setEmpresa({ ...empresa, phone: e.target.value })}
                               placeholder="Ej. 600 000 000"
                               className="input" />
                    </Field>
                    <SubmitBtn saving={saving} loading={loading}>Guardar datos de empresa</SubmitBtn>
                </form>
            )}

            {/* ============ PRODUCTOS ============ */}
            {activeTab === 'productos' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <ItemsPanel />
                </div>
            )}

            {/* ============ CATEGORÍAS ============ */}
            {activeTab === 'categorias' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <CategoriesPanel />
                </div>
            )}

            {/* ============ MESAS ============ */}
            {activeTab === 'mesas' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <TablesPanel />
                </div>
            )}

            {/* ============ CAMAREROS ============ */}
            {activeTab === 'camareros' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <TeamPanel />
                </div>
            )}

            {/* ============ TICKET ============ */}
            {activeTab === 'ticket' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <form onSubmit={saveTicket} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                        <h3 className="text-base font-bold text-slate-900">Diseño del Ticket</h3>
                        <p className="text-[11px] text-slate-500 -mt-2">Personaliza cabecera y pie del ticket impreso.</p>
                        <Field label="Cabecera (texto libre, encima del nombre)">
                            <textarea
                                rows={2}
                                value={ticketForm.header_msg ?? ''}
                                onChange={e => setTicketForm({ ...ticketForm, header_msg: e.target.value })}
                                placeholder="Ej. ¡Bienvenido a nuestro restaurante!"
                                className="input font-mono text-xs" />
                        </Field>
                        <Field label="Pie de página (mensaje de despedida)">
                            <textarea
                                rows={2}
                                value={ticketForm.footer_msg ?? ''}
                                onChange={e => setTicketForm({ ...ticketForm, footer_msg: e.target.value })}
                                placeholder="Ej. ¡Gracias por su visita! Conserve este ticket."
                                className="input font-mono text-xs" />
                        </Field>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={ticketForm.showTax ?? true}
                                onChange={e => setTicketForm({ ...ticketForm, showTax: e.target.checked })}
                                className="rounded"
                            />
                            <span className="text-sm text-slate-700">Imprimir desglose de IVA (Base 10% / I.V.A. 10%)</span>
                        </label>
                        <SubmitBtn saving={saving} loading={loading}>Guardar diseño del ticket</SubmitBtn>
                    </form>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <h3 className="text-base font-bold text-slate-900 mb-2">Vista previa</h3>
                        <LiveTicketPreview form={ticketForm} bare />
                    </div>
                </div>
            )}

            {/* ============ VENTAS ============ */}
            {activeTab === 'ventas' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <SalesPanel />
                </div>
            )}

            {/* ============ PLAN ============ */}
            {activeTab === 'plan' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <BillingPanel />
                </div>
            )}

            {/* ============ ALMACÉN ============ */}
            {activeTab === 'almacen' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <StoragePanel />
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------
// Helpers UI
// ---------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="block text-[11px] font-bold text-slate-600 mb-1">{label}</span>
            {children}
        </label>
    );
}

function SubmitBtn({ children, saving, loading, disabled }: {
    children: React.ReactNode; saving: boolean; loading?: boolean; disabled?: boolean;
}) {
    return (
        <button
            type="submit"
            disabled={saving || loading || disabled}
            className="h-11 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow active:scale-95 transition disabled:opacity-50"
        >
            {saving ? 'Guardando…' : children}
        </button>
    );
}

export default SettingsPage;
