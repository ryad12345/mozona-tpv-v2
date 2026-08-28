// =====================================================================
// MOZONA TPV — TeamPanel (Camareros en tiempo real)
// =====================================================================
// Lista, añade, edita y borra camareros del tenant.  Conectado
// directamente a tenant_users en Supabase.  Caché en IndexedDB
// para que la validación de PIN funcione offline.
// =====================================================================

import { useState } from "react";
import { useWaiters } from "../../hooks/useWaiters";
import { Card } from "./FormControls";
import { IconPlus, IconCheck, IconX, IconRefresh, IconAlert, IconUser, IconPencil, IconTrash } from "../icons";
import type { WaiterRole } from "../../lib/waiters";

const ROLE_LABELS: Record<WaiterRole, string> = {
    owner:   "Dueño",
    manager: "Encargado",
    waiter:  "Camarero",
    kitchen: "Cocina",
};
const ROLE_TONES: Record<WaiterRole, string> = {
    owner:   "bg-violet-100 text-violet-700",
    manager: "bg-amber-100 text-amber-700",
    waiter:  "bg-blue-100 text-blue-700",
    kitchen: "bg-emerald-100 text-emerald-700",
};

interface FormState {
    open:     boolean;
    editingId: string | null;
    name:     string;
    pin:      string;
    role:     WaiterRole;
}

const EMPTY_FORM: FormState = { open: false, editingId: null, name: "", pin: "", role: "waiter" };

export function TeamPanel() {
    const { waiters, loading, error, refresh, create, update, remove } = useWaiters();
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [busy,  setBusy]  = useState(false);
    const [msg,   setMsg]   = useState<{ kind: "ok" | "err"; text: string } | null>(null);

    const startCreate = () => setForm({ ...EMPTY_FORM, open: true });
    const startEdit   = (id: string) => {
        const w = waiters.find(x => x.id === id);
        if (!w) return;
        setForm({ open: true, editingId: id, name: w.name, pin: w.pin_code, role: w.role });
    };
    const cancel = () => { setForm(EMPTY_FORM); setMsg(null); };

    const save = async () => {
        if (!form.name.trim()) {
            setMsg({ kind: "err", text: "El nombre es obligatorio" });
            return;
        }
        if (!/^\d{4}$/.test(form.pin)) {
            setMsg({ kind: "err", text: "El PIN debe tener exactamente 4 dígitos" });
            return;
        }
        setBusy(true);
        setMsg(null);
        try {
            if (form.editingId) {
                const w = await update(form.editingId, {
                    name: form.name.trim(),
                    pin_code: form.pin,
                    role: form.role,
                });
                if (w) setMsg({ kind: "ok", text: `Camarero ${w.name} actualizado` });
                else if (!error) setMsg({ kind: "err", text: "No se pudo actualizar" });
            } else {
                const w = await create({ name: form.name.trim(), pin_code: form.pin, role: form.role });
                if (w) setMsg({ kind: "ok", text: `Camarero ${w.name} creado` });
                else if (!error) setMsg({ kind: "err", text: "No se pudo crear" });
            }
            if (!error) setForm(EMPTY_FORM);
        } catch (e) {
            setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
        } finally {
            setBusy(false);
        }
    };

    const del = async (id: string) => {
        const w = waiters.find(x => x.id === id);
        if (!w) return;
        if (!confirm(`¿Borrar al camarero "${w.name}"?  No se puede deshacer.`)) return;
        setBusy(true);
        try {
            const ok = await remove(id);
            setMsg(ok ? { kind: "ok", text: `${w.name} eliminado` } : { kind: "err", text: "No se pudo borrar" });
        } finally {
            setBusy(false);
        }
    };

    const active = waiters.filter(w => w.is_active !== false);
    const inactive = waiters.filter(w => w.is_active === false);

    return (
        <Card
            icon={<span className="text-[15px]">👥</span>}
            title="Equipo / Camareros"
            subtitle={`${active.length} activo${active.length !== 1 ? "s" : ""} · PINs validados offline`}
        >
            <div className="space-y-3">
                {/* Cabecera acciones */}
                <div className="flex gap-2">
                    <button onClick={startCreate} disabled={form.open}
                            className="flex-1 h-10 rounded-xl bg-slate-900 hover:bg-slate-800
                                       text-white text-[12.5px] font-bold flex items-center
                                       justify-center gap-1.5 disabled:opacity-50
                                       active:scale-95 transition">
                        <IconPlus size={14} strokeWidth={2.4} />
                        Añadir camarero
                    </button>
                    <button onClick={refresh} disabled={loading}
                            className="h-10 w-10 rounded-xl bg-slate-100 hover:bg-slate-200
                                       flex items-center justify-center text-slate-600
                                       disabled:opacity-50 active:scale-95 transition"
                            title="Refrescar">
                        <IconRefresh size={14} strokeWidth={2} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>

                {/* Formulario crear/editar */}
                {form.open && (
                    <div className="p-3 rounded-2xl bg-blue-50/50 border border-blue-200/80 space-y-2.5">
                        <div className="text-[11.5px] font-black text-blue-900 uppercase tracking-wider">
                            {form.editingId ? "Editar camarero" : "Nuevo camarero"}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-[10.5px] font-bold text-slate-600 mb-1">Nombre</label>
                                <input type="text" value={form.name}
                                       onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                       placeholder="Juan Pérez"
                                       className="h-9 w-full px-2.5 rounded-lg border border-slate-200
                                                  bg-white text-[12.5px] outline-none
                                                  focus:border-blue-400" />
                            </div>
                            <div>
                                <label className="block text-[10.5px] font-bold text-slate-600 mb-1">PIN (4 dígitos)</label>
                                <input type="text" value={form.pin}
                                       onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                                       inputMode="numeric"
                                       placeholder="0000"
                                       maxLength={4}
                                       className="h-9 w-full px-2.5 rounded-lg border border-slate-200
                                                  bg-white text-[14px] font-black tracking-[0.4em]
                                                  text-center tabular-nums outline-none
                                                  focus:border-blue-400" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10.5px] font-bold text-slate-600 mb-1">Rol</label>
                            <div className="grid grid-cols-4 gap-1">
                                {(Object.keys(ROLE_LABELS) as WaiterRole[]).map(r => (
                                    <button key={r} type="button"
                                            onClick={() => setForm(f => ({ ...f, role: r }))}
                                            className={`h-9 rounded-lg text-[11px] font-bold transition active:scale-95
                                                ${form.role === r
                                                    ? ROLE_TONES[r] + " ring-2 ring-offset-1 ring-blue-500"
                                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                                        {ROLE_LABELS[r]}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button onClick={cancel}
                                    className="h-9 px-3 rounded-lg bg-slate-100 hover:bg-slate-200
                                               text-[12px] font-bold text-slate-600
                                               flex items-center gap-1 active:scale-95 transition">
                                <IconX size={12} strokeWidth={2.2} />
                                Cancelar
                            </button>
                            <button onClick={save} disabled={busy}
                                    className="flex-1 h-9 rounded-lg bg-blue-600 hover:bg-blue-700
                                               text-white text-[12px] font-bold
                                               flex items-center justify-center gap-1
                                               disabled:opacity-50 active:scale-95 transition">
                                <IconCheck size={12} strokeWidth={2.4} />
                                {busy ? "Guardando…" : (form.editingId ? "Guardar cambios" : "Crear camarero")}
                            </button>
                        </div>
                    </div>
                )}

                {msg && (
                    <div className={`p-2.5 rounded-xl border text-[12px] flex items-start gap-2
                                    ${msg.kind === "ok"
                                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                        : "bg-rose-50 border-rose-200 text-rose-700"}`}>
                        {msg.kind === "ok" ? (
                            <IconCheck size={13} strokeWidth={2.4} className="mt-0.5 shrink-0" />
                        ) : (
                            <IconAlert size={13} strokeWidth={2.4} className="mt-0.5 shrink-0" />
                        )}
                        <span>{msg.text}</span>
                    </div>
                )}

                {error && !msg && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[12px] text-rose-700
                                    flex items-start gap-2">
                        <IconAlert size={13} strokeWidth={2.4} className="mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Lista */}
                <div className="space-y-1.5">
                    {active.length === 0 && !loading && (
                        <div className="py-6 text-center text-[12px] text-slate-400">
                            <IconUser size={20} strokeWidth={1.5} className="mx-auto mb-1 opacity-50" />
                            No hay camareros.  Añade el primero arriba.
                        </div>
                    )}
                    {active.map(w => (
                        <WaiterRow key={w.id} waiter={w}
                                   onEdit={() => startEdit(w.id)}
                                   onDelete={() => del(w.id)}
                                   busy={busy} />
                    ))}
                    {inactive.length > 0 && (
                        <div className="pt-2 mt-2 border-t border-slate-100">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                Desactivados ({inactive.length})
                            </div>
                            {inactive.map(w => (
                                <WaiterRow key={w.id} waiter={w} dim
                                           onEdit={() => startEdit(w.id)}
                                           onDelete={() => del(w.id)}
                                           busy={busy} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );
}

function WaiterRow({
    waiter, onEdit, onDelete, busy, dim = false,
}: {
    waiter:   { id: string; name: string; role: WaiterRole; pin_code: string; email: string | null };
    onEdit:   () => void;
    onDelete: () => void;
    busy:     boolean;
    dim?:     boolean;
}) {
    return (
        <div className={`flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200/80 bg-white
                        ${dim ? "opacity-50" : ""}`}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300
                            flex items-center justify-center text-slate-700 font-black text-[12px] shrink-0">
                {waiter.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-semibold text-slate-900 truncate">
                    {waiter.name}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`inline-flex px-1.5 h-4 items-center rounded text-[9.5px] font-bold ${ROLE_TONES[waiter.role]}`}>
                        {ROLE_LABELS[waiter.role]}
                    </span>
                    <span className="text-[10.5px] text-slate-400 font-mono tabular-nums">
                        PIN · {waiter.pin_code}
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-0.5">
                <button onClick={onEdit} disabled={busy}
                        className="w-7 h-7 rounded-md text-slate-500 hover:text-blue-600
                                   hover:bg-blue-50 flex items-center justify-center
                                   active:scale-90 transition"
                        title="Editar">
                    <IconPencil size={12} strokeWidth={2.2} />
                </button>
                <button onClick={onDelete} disabled={busy}
                        className="w-7 h-7 rounded-md text-slate-500 hover:text-rose-600
                                   hover:bg-rose-50 flex items-center justify-center
                                   active:scale-90 transition"
                        title="Borrar">
                    <IconTrash size={12} strokeWidth={2.2} />
                </button>
            </div>
        </div>
    );
}

export default TeamPanel;
