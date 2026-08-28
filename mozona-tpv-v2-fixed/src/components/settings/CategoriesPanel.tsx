// =====================================================================
// MOZONA TPV — CategoriesPanel: gestión de categorías (Supabase)
// =====================================================================

import { useState, useEffect } from "react";
import { useAuth } from "../../lib/auth";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { usePosData } from "../../hooks/usePosData";
import { IconPlus, IconCheck, IconX, IconAlert, IconRefresh, IconTrash } from "../icons";

interface DbCategory {
    id: string;
    tenant_id: string;
    name: string;
    sort_order: number;
}

export function CategoriesPanel() {
    const auth = useAuth();
    const { refresh } = usePosData();
    const [list, setList]     = useState<DbCategory[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg]       = useState<{ kind: "ok" | "err"; text: string } | null>(null);
    const [newName, setNewName] = useState("");
    const [busy, setBusy]     = useState(false);

    const tenantId = auth.tenant?.id ?? null;

    const load = async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("categories")
                .select("id, tenant_id, name, sort_order")
                .eq("tenant_id", tenantId)
                .order("sort_order", { ascending: true });
            if (error) throw error;
            setList(data ?? []);
        } catch (e) {
            setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, [tenantId]);

    const add = async () => {
        if (!tenantId || !newName.trim()) {
            setMsg({ kind: "err", text: "El nombre es obligatorio" });
            return;
        }
        setBusy(true);
        try {
            const nextOrder = (list[list.length - 1]?.sort_order ?? 0) + 10;
            const { error } = await supabase.from("categories").insert({
                tenant_id:  tenantId,
                name:       newName.trim(),
                sort_order: nextOrder,
            });
            if (error) throw error;
            setNewName("");
            setMsg({ kind: "ok", text: `Categoría "${newName.trim()}" añadida` });
            await load();
            await refresh();
        } catch (e) {
            setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
        } finally {
            setBusy(false);
        }
    };

    const del = async (id: string, name: string) => {
        if (!confirm(`¿Borrar la categoría "${name}"?  Los productos vinculados quedarán sin categoría.`)) return;
        setBusy(true);
        try {
            const { error } = await supabase.from("categories").delete().eq("id", id);
            if (error) throw error;
            setMsg({ kind: "ok", text: `Categoría "${name}" eliminada` });
            await load();
            await refresh();
        } catch (e) {
            setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
        } finally {
            setBusy(false);
        }
    };

    if (!isSupabaseConfigured) {
        return <div className="p-4 text-[12px] text-slate-500">
            Supabase no está configurado.
        </div>;
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Categorías</h2>
                    <p className="text-[11.5px] text-slate-500">
                        {list.length} categoría{list.length !== 1 ? "s" : ""} · Sincronizadas con Supabase
                    </p>
                </div>
                <button onClick={load} disabled={loading}
                        className="h-9 w-9 rounded-xl bg-slate-100 hover:bg-slate-200
                                   flex items-center justify-center text-slate-600
                                   disabled:opacity-50 active:scale-95 transition"
                        title="Refrescar">
                    <IconRefresh size={14} strokeWidth={2} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            <div className="p-3 rounded-2xl bg-blue-50/40 border border-blue-200/80 flex gap-2">
                <input type="text" value={newName}
                       onChange={e => setNewName(e.target.value)}
                       onKeyDown={e => { if (e.key === "Enter") void add(); }}
                       placeholder="Nombre (ej: Postres, Vinos...)"
                       className="flex-1 h-9 px-2.5 rounded-lg border border-slate-200 bg-white
                                  text-[12.5px] outline-none focus:border-blue-400" />
                <button onClick={add} disabled={busy || !newName.trim()}
                        className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700
                                   text-white text-[12.5px] font-bold
                                   flex items-center justify-center gap-1
                                   disabled:opacity-50 active:scale-95 transition">
                    <IconPlus size={13} strokeWidth={2.4} />
                    Añadir
                </button>
            </div>

            {msg && (
                <div className={`p-2.5 rounded-xl border text-[12px] flex items-start gap-2
                                ${msg.kind === "ok"
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                    : "bg-rose-50 border-rose-200 text-rose-700"}`}>
                    {msg.kind === "ok"
                        ? <IconCheck size={13} strokeWidth={2.4} className="mt-0.5 shrink-0" />
                        : <IconAlert size={13} strokeWidth={2.4} className="mt-0.5 shrink-0" />}
                    <span>{msg.text}</span>
                </div>
            )}

            <div className="space-y-1.5">
                {list.length === 0 && !loading && (
                    <div className="py-6 text-center text-[12px] text-slate-400">
                        No hay categorías.  Añade la primera arriba.
                    </div>
                )}
                {list.map(c => (
                    <div key={c.id}
                         className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200/80 bg-white">
                        <div className="w-8 h-8 rounded-full bg-blue-100
                                        flex items-center justify-center text-blue-700
                                        font-black text-[12px] shrink-0">
                            {c.name?.[0]?.toUpperCase() ?? "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[12.5px] font-semibold text-slate-900 truncate">
                                {c.name}
                            </div>
                            <div className="text-[10.5px] text-slate-400">
                                Orden: {c.sort_order}
                            </div>
                        </div>
                        <button onClick={() => del(c.id, c.name)} disabled={busy}
                                className="w-7 h-7 rounded-md text-slate-500 hover:text-rose-600
                                           hover:bg-rose-50 flex items-center justify-center
                                           active:scale-90 transition"
                                title="Borrar">
                            <IconTrash size={12} strokeWidth={2.2} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default CategoriesPanel;
