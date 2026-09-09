// =====================================================================
// MOZONA TPV — AdminPanelPage (v3.1.4)
// =====================================================================
// Panel de control completo del superadmin.
// Acceso automático cuando rofixinsta@gmail.com hace login en /auth.
// =====================================================================

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isSuperAdminEmail } from "../lib/vip";
import { IconShield, IconArrowRight, IconUser, IconCheck, IconLock } from "../components/icons";

interface Tenant {
    id: string;
    name?: string;
    business_name?: string;
    contact_email?: string;
    plan_selected?: string;
    plan?: string;
    activation_status?: string;
    business_type?: string;
    created_at?: string;
    approved_at?: string;
    trial_ends_at?: string;
}

const PLANS = [
    { code: "plus_30", label: "Plus 30€", price: 30 },
    { code: "pro_50", label: "Pro 50€", price: 50 },
    { code: "vip", label: "VIP Lifetime", price: 0 },
    { code: "basic", label: "Basic (gratis)", price: 0 },
];

export function AdminPanelPage() {
    const navigate = useNavigate();
    const auth = useAuth();
    const isAdmin = isSuperAdminEmail(auth.user?.email);

    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [stats, setStats] = useState<any>(null);
    const [editing, setEditing] = useState<Tenant | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // ★ Redirigir si no es admin
    useEffect(() => {
        if (auth.isReady && !isAdmin) {
            navigate("/", { replace: true });
        }
    }, [auth.isReady, isAdmin, navigate]);

    // ★ Cargar datos
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search) params.set("search", search);
            if (statusFilter) params.set("status", statusFilter);
            params.set("action", "list");

            const token = "mozona-approve-2025";
            const r = await fetch(`/api/admin?action=list&token=${token}&${params.toString()}`);
            const json = await r.json();
            if (json.ok) {
                setTenants(json.tenants || []);
            } else {
                setError(json.error);
            }

            // Stats
            const sr = await fetch(`/api/admin?action=stats&token=${token}`);
            const sjson = await sr.json();
            if (sjson.ok) setStats(sjson.stats);
        } catch (e) {
            setError(String(e));
        }
        setLoading(false);
    }, [search, statusFilter]);

    useEffect(() => {
        if (isAdmin) fetchData();
    }, [isAdmin, fetchData]);

    // ★ Aprobar tenant
    const approve = async (tenant: Tenant, days = 7) => {
        setBusy(true);
        setError(null);
        try {
            const r = await fetch("/api/admin?action=approve&token=mozona-approve-2025", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tenantId: tenant.id, trialDays: days }),
            });
            const json = await r.json();
            if (json.ok) {
                setSuccess(`✅ Aprobado: ${tenant.name || tenant.contact_email} (${days}d trial)`);
                fetchData();
            } else {
                setError(json.error);
            }
        } catch (e) {
            setError(String(e));
        }
        setBusy(false);
    };

    // ★ Cambiar plan
    const changePlan = async (tenant: Tenant, plan: string) => {
        setBusy(true);
        try {
            const r = await fetch("/api/admin?action=change-plan&token=mozona-approve-2025", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tenantId: tenant.id, plan }),
            });
            const json = await r.json();
            if (json.ok) {
                setSuccess(`Plan cambiado a ${plan}`);
                fetchData();
            } else {
                setError(json.error);
            }
        } catch (e) {
            setError(String(e));
        }
        setBusy(false);
    };

    // ★ Reset password
    const resetPassword = async (tenant: Tenant) => {
        const newPass = prompt(`Nueva contraseña para ${tenant.contact_email} (mín 6 caracteres):`);
        if (!newPass || newPass.length < 6) {
            setError("Contraseña muy corta");
            return;
        }
        setBusy(true);
        try {
            const r = await fetch("/api/admin?action=reset-password&token=mozona-approve-2025", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: tenant.contact_email, newPassword: newPass }),
            });
            const json = await r.json();
            if (json.ok) {
                setSuccess(`✅ Password actualizado para ${tenant.contact_email}`);
            } else {
                setError(json.error);
            }
        } catch (e) {
            setError(String(e));
        }
        setBusy(false);
    };

    // ★ Guardar edición
    const saveEdit = async () => {
        if (!editing) return;
        setBusy(true);
        try {
            const r = await fetch("/api/admin?action=edit&token=mozona-approve-2025", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tenantId: editing.id,
                    name: editing.name,
                    businessName: editing.business_name,
                    contactEmail: editing.contact_email,
                    businessType: editing.business_type,
                }),
            });
            const json = await r.json();
            if (json.ok) {
                setSuccess("Datos actualizados");
                setEditing(null);
                fetchData();
            } else {
                setError(json.error);
            }
        } catch (e) {
            setError(String(e));
        }
        setBusy(false);
    };

    if (!isAdmin) {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-slate-50">
                <div className="bg-white rounded-2xl shadow-xl p-6 text-center">
                    <IconShield size={48} className="mx-auto text-rose-500 mb-3" />
                    <h1 className="text-xl font-black mb-2">Acceso restringido</h1>
                    <p className="text-sm text-slate-600">Solo el superadmin puede acceder.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-dvh bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
            <div className="max-w-6xl mx-auto space-y-4">
                {/* Cabecera */}
                <div className="bg-gradient-to-br from-blue-600 via-violet-600 to-blue-700 rounded-3xl shadow-2xl p-6 text-white">
                    <div className="flex items-center gap-3 mb-2">
                        <IconShield size={32} />
                        <h1 className="text-2xl font-black">Panel de Admin</h1>
                    </div>
                    <p className="text-[12.5px] text-blue-100">
                        Bienvenido {auth.user?.email}. Tienes control total sobre la plataforma.
                    </p>
                </div>

                {/* Stats */}
                {stats && (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <StatBox label="Total" value={stats.total} color="bg-slate-700" />
                        <StatBox label="Pendientes" value={stats.pending} color="bg-amber-500" />
                        <StatBox label="Trial" value={stats.trial} color="bg-blue-500" />
                        <StatBox label="Activos" value={stats.active} color="bg-emerald-500" />
                        <StatBox label="VIP" value={stats.vip} color="bg-violet-500" />
                    </div>
                )}

                {/* Mensajes */}
                {success && (
                    <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 flex items-center gap-2">
                        <IconCheck size={18} className="text-emerald-600" />
                        <span className="text-[12.5px] text-emerald-900 font-semibold">{success}</span>
                        <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-700">✕</button>
                    </div>
                )}
                {error && (
                    <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4">
                        <span className="text-[12.5px] text-rose-900 font-semibold">❌ {error}</span>
                        <button onClick={() => setError(null)} className="ml-auto text-rose-700">✕</button>
                    </div>
                )}

                {/* Filtros */}
                <div className="bg-white rounded-2xl shadow-xl p-4 flex flex-wrap gap-2">
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por nombre o email..."
                        className="flex-1 min-w-[200px] h-10 px-3 rounded-lg border border-slate-300 text-[12.5px]"
                    />
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="h-10 px-3 rounded-lg border border-slate-300 text-[12.5px]"
                    >
                        <option value="">Todos los estados</option>
                        <option value="pending_activation">⏳ Pendientes</option>
                        <option value="active_trial">🎁 Trial</option>
                        <option value="active">✅ Activos</option>
                        <option value="vip">⭐ VIP</option>
                        <option value="expired">❌ Expirados</option>
                    </select>
                    <button
                        onClick={fetchData}
                        className="h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-black"
                    >
                        Buscar
                    </button>
                </div>

                {/* Tabla de tenants */}
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                    <div className="p-4 border-b border-slate-200">
                        <h2 className="text-sm font-black">
                            Tenants ({tenants.length})
                        </h2>
                    </div>
                    {loading ? (
                        <div className="p-8 text-center text-slate-500 text-[12px]">Cargando...</div>
                    ) : tenants.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-[12px]">No hay tenants</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12px]">
                                <thead className="bg-slate-50 text-slate-700">
                                    <tr>
                                        <th className="text-left p-2">Nombre</th>
                                        <th className="text-left p-2">Email</th>
                                        <th className="text-left p-2">Estado</th>
                                        <th className="text-left p-2">Plan</th>
                                        <th className="text-left p-2">Trial hasta</th>
                                        <th className="text-left p-2">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tenants.map(t => (
                                        <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                                            <td className="p-2 font-semibold">{t.name || t.business_name || "—"}</td>
                                            <td className="p-2 text-slate-600">{t.contact_email || "—"}</td>
                                            <td className="p-2">
                                                <StatusBadge status={t.activation_status} />
                                            </td>
                                            <td className="p-2">
                                                <select
                                                    value={t.plan_selected || t.plan || "basic"}
                                                    onChange={e => changePlan(t, e.target.value)}
                                                    disabled={busy}
                                                    className="h-7 px-2 rounded border border-slate-200 text-[11px]"
                                                >
                                                    {PLANS.map(p => (
                                                        <option key={p.code} value={p.code}>{p.label}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="p-2 text-slate-500 text-[10.5px]">
                                                {t.trial_ends_at ? new Date(t.trial_ends_at).toLocaleDateString("es-ES") : "—"}
                                            </td>
                                            <td className="p-2">
                                                <div className="flex gap-1 flex-wrap">
                                                    {t.activation_status === "pending_activation" && (
                                                        <button
                                                            onClick={() => approve(t, 7)}
                                                            disabled={busy}
                                                            className="h-7 px-2 rounded bg-emerald-500 hover:bg-emerald-600 text-white text-[10.5px] font-black"
                                                        >
                                                            ✅ Aprobar 7d
                                                        </button>
                                                    )}
                                                    {t.activation_status === "pending_activation" && (
                                                        <button
                                                            onClick={() => approve(t, 30)}
                                                            disabled={busy}
                                                            className="h-7 px-2 rounded bg-blue-500 hover:bg-blue-600 text-white text-[10.5px] font-black"
                                                        >
                                                            30d
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => setEditing(t)}
                                                        disabled={busy}
                                                        className="h-7 px-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10.5px] font-black"
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        onClick={() => resetPassword(t)}
                                                        disabled={busy}
                                                        className="h-7 px-2 rounded bg-amber-100 hover:bg-amber-200 text-amber-800 text-[10.5px] font-black"
                                                    >
                                                        🔑
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Modal de edición */}
                {editing && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                            <h2 className="text-lg font-black mb-4">Editar tenant</h2>
                            <div className="space-y-3">
                                <Field label="Nombre" value={editing.name || ""} onChange={v => setEditing({ ...editing, name: v })} />
                                <Field label="Email" value={editing.contact_email || ""} onChange={v => setEditing({ ...editing, contact_email: v })} />
                                <Field label="Tipo de negocio" value={editing.business_type || ""} onChange={v => setEditing({ ...editing, business_type: v })} />
                            </div>
                            <div className="flex gap-2 mt-6">
                                <button
                                    onClick={() => setEditing(null)}
                                    className="flex-1 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12.5px] font-black"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={saveEdit}
                                    disabled={busy}
                                    className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-black"
                                >
                                    Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className={`${color} rounded-2xl p-4 text-white shadow-lg`}>
            <div className="text-[10.5px] uppercase tracking-widest opacity-80 font-bold">{label}</div>
            <div className="text-2xl font-black mt-1">{value}</div>
        </div>
    );
}

function StatusBadge({ status }: { status?: string }) {
    const config: Record<string, { label: string; color: string }> = {
        pending_activation: { label: "⏳ Pendiente", color: "bg-amber-100 text-amber-800" },
        active_trial: { label: "🎁 Trial", color: "bg-blue-100 text-blue-800" },
        active: { label: "✅ Activo", color: "bg-emerald-100 text-emerald-800" },
        vip: { label: "⭐ VIP", color: "bg-violet-100 text-violet-800" },
        expired: { label: "❌ Expirado", color: "bg-rose-100 text-rose-800" },
    };
    const c = config[status || ""] || { label: status || "?", color: "bg-slate-100 text-slate-800" };
    return <span className={`inline-block px-2 py-0.5 rounded-full text-[10.5px] font-black ${c.color}`}>{c.label}</span>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <div>
            <label className="text-[10.5px] font-bold text-slate-600 uppercase tracking-widest">{label}</label>
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                className="w-full h-10 mt-1 px-3 rounded-lg border border-slate-300 text-[12.5px]"
            />
        </div>
    );
}

export default AdminPanelPage;
