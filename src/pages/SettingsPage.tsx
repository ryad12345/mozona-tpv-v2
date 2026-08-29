// =====================================================================
// MOZONA TPV — SettingsPage
// =====================================================================
// Panel de configuración: Empresa, Diseño de Ticket, Camareros.
// Los datos del TICKET se guardan en `public.tenants` (Supabase) para que
// persistan entre dispositivos.  Los camareros siguen en `tenant_users`.
// =====================================================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ItemsPanel } from '../components/settings/ItemsPanel';
import { TablesPanel } from '../components/settings/TablesPanel';
import { CategoriesPanel } from '../components/settings/CategoriesPanel';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Tab = 'empresa' | 'ticket' | 'camareros';

interface TicketForm {
    header_msg:  string;   // texto libre encima del nombre
    footer_msg:  string;
    showTax:     boolean;
}

export function SettingsPage() {
    const navigate = useNavigate();
    const auth = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('empresa');

    // Estado de Empresa (guardado en tenants)
    const [empresa, setEmpresa] = useState({
        name:       '',
        nif:        '',
        address:    '',
        phone:      '',
    });

    // Estado de Diseño de Ticket (parte del tenant)
    const [ticket, setTicket] = useState<TicketForm>({
        header_msg: '',
        footer_msg: '¡Gracias por su visita!',
        showTax:    true,
    });

    const [loading, setLoading]     = useState(true);
    const [saving,  setSaving]      = useState(false);
    const [msg,     setMsg]         = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    // Cargar datos del tenant
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!isSupabaseConfigured || !auth.user) {
                setLoading(false);
                return;
            }
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
                    setTicket({
                        header_msg: (data as any).ticket_header_msg ?? '',
                        footer_msg: data.ticket_footer_msg ?? '¡Gracias por su visita!',
                        showTax:    (data as any).ticket_show_tax ?? true,
                    });
                }
            } catch (e) {
                console.warn("[SettingsPage] load exception:", e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
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
            const { error } = await supabase
                .from("tenants")
                .update({
                    name:    empresa.name.trim()    || null,
                    cif_nif: empresa.nif.trim()      || null,
                    address: empresa.address.trim() || null,
                    phone:   empresa.phone.trim()   || null,
                })
                .eq("owner_id", auth.user.id);
            if (error) throw error;
            setMsg({ kind: 'ok', text: 'Datos de empresa guardados correctamente.' });
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
            const { error } = await supabase
                .from("tenants")
                .update({
                    ticket_header_msg:  ticket.header_msg.trim() || null,
                    ticket_footer_msg:  ticket.footer_msg.trim() || '¡Gracias por su visita!',
                    ticket_show_tax:    ticket.showTax,
                } as any)
                .eq("owner_id", auth.user.id);
            if (error) {
                // Si la columna no existe aún, mensaje claro
                if (error.message.includes("ticket_header_msg") || error.message.includes("ticket_show_tax")) {
                    throw new Error("Ejecuta la migración que añade ticket_header_msg a la tabla tenants.");
                }
                throw error;
            }
            setMsg({ kind: 'ok', text: 'Diseño de ticket guardado correctamente.' });
        } catch (e) {
            setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Error al guardar' });
        }
        setSaving(false);
    };

    return (
        <div className="min-h-dvh w-full bg-slate-100 flex flex-col p-4 sm:p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-6">
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={() => navigate('/app')}
                        className="h-10 px-4 bg-white text-slate-800 font-bold text-xs rounded-xl shadow-sm border border-slate-200 flex items-center gap-2 active:scale-95 transition"
                    >
                        ⬅ VOLVER AL TPV
                    </button>
                    <div>
                        <h1 className="text-xl font-black text-slate-900">Panel de Configuración</h1>
                        <p className="text-xs text-slate-500">Empresa, diseño de ticket, camareros</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
                {(['empresa', 'ticket', 'camareros'] as Tab[]).map(t => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => { setActiveTab(t); setMsg(null); }}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 ${activeTab === t ? 'bg-blue-600 text-white shadow' : 'bg-white text-slate-600'}`}
                    >
                        {t === 'empresa'    ? '🏢 Empresa' :
                         t === 'ticket'     ? '🧾 Diseño del Ticket' :
                                              '👥 Camareros'}
                    </button>
                ))}
            </div>

            {msg && (
                <div className={`mb-4 p-3 rounded-xl text-sm ${msg.kind === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-800'}`}>
                    {msg.text}
                </div>
            )}

            {/* EMPRESA */}
            {activeTab === 'empresa' && (
                <form onSubmit={saveEmpresa} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 max-w-2xl space-y-4">
                    <h3 className="text-base font-bold text-slate-900">Datos de la empresa</h3>
                    <p className="text-xs text-slate-500 -mt-3">Estos datos aparecerán en la cabecera del ticket / pre-cuenta.</p>

                    <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Nombre del restaurante</label>
                        <input
                            type="text"
                            value={empresa.name}
                            onChange={e => setEmpresa({ ...empresa, name: e.target.value })}
                            placeholder="Ej. Restaurante El Rincón de Casablanca"
                            className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">NIF / CIF</label>
                        <input
                            type="text"
                            value={empresa.nif}
                            onChange={e => setEmpresa({ ...empresa, nif: e.target.value })}
                            placeholder="Ej. B12345678"
                            className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Dirección</label>
                        <input
                            type="text"
                            value={empresa.address}
                            onChange={e => setEmpresa({ ...empresa, address: e.target.value })}
                            placeholder="Ej. Calle Mayor 12, Madrid"
                            className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Teléfono</label>
                        <input
                            type="tel"
                            value={empresa.phone}
                            onChange={e => setEmpresa({ ...empresa, phone: e.target.value })}
                            placeholder="Ej. 600 000 000"
                            className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={saving || loading}
                        className="h-11 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow active:scale-95 transition disabled:opacity-50"
                    >
                        {saving ? 'Guardando…' : 'Guardar datos de empresa'}
                    </button>
                </form>
            )}

            {/* DISEÑO DEL TICKET */}
            {activeTab === 'ticket' && (
                <form onSubmit={saveTicket} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 max-w-2xl space-y-4">
                    <h3 className="text-base font-bold text-slate-900">Diseño del Ticket</h3>
                    <p className="text-xs text-slate-500 -mt-3">Personaliza la cabecera y el pie del ticket impreso.</p>

                    <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Cabecera (opcional, encima del nombre)</label>
                        <textarea
                            rows={2}
                            value={ticket.header_msg}
                            onChange={e => setTicket({ ...ticket, header_msg: e.target.value })}
                            placeholder="Ej. ¡Bienvenido a nuestro restaurante!"
                            className="w-full p-3 rounded-xl border border-slate-300 text-xs font-mono"
                        />
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Pie de página (mensaje de despedida)</label>
                        <textarea
                            rows={2}
                            value={ticket.footer_msg}
                            onChange={e => setTicket({ ...ticket, footer_msg: e.target.value })}
                            placeholder="Ej. ¡Gracias por su visita! Conserve este ticket."
                            className="w-full p-3 rounded-xl border border-slate-300 text-xs font-mono"
                        />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={ticket.showTax}
                            onChange={e => setTicket({ ...ticket, showTax: e.target.checked })}
                            className="rounded"
                        />
                        <span className="text-sm text-slate-700">Imprimir desglose de IVA (Base 10% / I.V.A. 10%)</span>
                    </label>

                    <button
                        type="submit"
                        disabled={saving || loading}
                        className="h-11 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow active:scale-95 transition disabled:opacity-50"
                    >
                        {saving ? 'Guardando…' : 'Guardar diseño del ticket'}
                    </button>
                </form>
            )}

            {/* CAMAREROS */}
            {activeTab === 'camareros' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 max-w-4xl">
                    <p className="text-sm text-slate-600 mb-4">
                        Para crear camareros y generar credenciales, abre el panel completo en la versión actual.
                    </p>
                    <a
                        href="/settings#camareros"
                        className="inline-block h-10 px-4 bg-blue-600 text-white text-sm font-bold rounded-xl"
                    >
                        Ir al panel de camareros
                    </a>
                </div>
            )}
        </div>
    );
}

export default SettingsPage;
