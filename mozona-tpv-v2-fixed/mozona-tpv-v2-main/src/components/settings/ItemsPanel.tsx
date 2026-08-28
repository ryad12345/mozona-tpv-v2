// =====================================================================
// MOZONA TPV — ItemsPanel: gestión de productos (Supabase)
// =====================================================================

import { useState, useEffect } from "react";
import { useAuth } from "../../lib/auth";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { usePosData } from "../../hooks/usePosData";
import { IconPlus, IconCheck, IconX, IconAlert, IconRefresh, IconTrash, IconPencil } from "../icons";

interface DbProduct {
    id: string;
    tenant_id: string;
    category_id: string | null;
    name: string;
    description: string | null;
    price: number;
    tax_rate: number;
    image_url: string | null;
    is_active: boolean;
}

interface DbCategory {
    id: string;
    name: string;
}

const EMPTY_FORM = { name: "", price: "", description: "", category_id: "", image_url: "", tax_rate: "10" };

export function ItemsPanel() {
    const auth = useAuth();
    const { refresh } = usePosData();
    const [list, setList]         = useState<DbProduct[]>([]);
    const [cats, setCats]         = useState<DbCategory[]>([]);
    const [loading, setLoading]   = useState(false);
    const [msg, setMsg]           = useState<{ kind: "ok" | "err"; text: string } | null>(null);
    const [form, setForm]         = useState({ ...EMPTY_FORM });
    const [editing, setEditing]   = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [busy, setBusy]         = useState(false);

    const tenantId = auth.tenant?.id ?? null;

    const load = async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            const [{ data: ps, error: e1 }, { data: cs, error: e2 }] = await Promise.all([
                supabase.from("products")
                    .select("id, tenant_id, category_id, name, description, price, tax_rate, image_url, is_active")
                    .eq("tenant_id", tenantId)
                    .order("name"),
                supabase.from("categories")
                    .select("id, name")
                    .eq("tenant_id", tenantId)
                    .order("sort_order"),
            ]);
            if (e1) throw e1;
            if (e2) throw e2;
            setList((ps ?? []).map(p => ({ ...p, is_active: p.is_active ?? true })));
            setCats(cs ?? []);
        } catch (e) {
            setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, [tenantId]);

    const startNew = () => {
        setForm({ ...EMPTY_FORM, category_id: cats[0]?.id ?? "" });
        setEditing(null);
        setShowForm(true);
    };

    const startEdit = (p: DbProduct) => {
        setForm({
            name:        p.name,
            price:       String(p.price),
            description: p.description ?? "",
            category_id: p.category_id ?? "",
            image_url:   p.image_url ?? "",
            tax_rate:    String(p.tax_rate),
        });
        setEditing(p.id);
        setShowForm(true);
    };

    const save = async () => {
        if (!tenantId) return;
        if (!form.name.trim())  { setMsg({ kind: "err", text: "El nombre es obligatorio" }); return; }
        const price = parseFloat(form.price.replace(",", "."));
        if (!Number.isFinite(price) || price < 0) {
            setMsg({ kind: "err", text: "Precio inválido" });
            return;
        }
        setBusy(true);
        try {
            const payload = {
                name:        form.name.trim(),
                price,
                description: form.description.trim() || null,
                category_id: form.category_id || null,
                image_url:   form.image_url.trim() || null,
                tax_rate:    parseInt(form.tax_rate, 10) || 10,
                is_active:   true,
            };
            if (editing) {
                const { error } = await supabase.from("products").update(payload).eq("id", editing);
                if (error) throw error;
                setMsg({ kind: "ok", text: `Producto "${form.name}" actualizado` });
            } else {
                const { error } = await supabase.from("products").insert({ ...payload, tenant_id: tenantId });
                if (error) throw error;
                setMsg({ kind: "ok", text: `Producto "${form.name}" creado` });
            }
            setShowForm(false);
            setEditing(null);
            setForm({ ...EMPTY_FORM });
            await load();
            await refresh();
        } catch (e) {
            setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
        } finally {
            setBusy(false);
        }
    };

    const del = async (id: string, name: string) => {
        if (!confirm(`¿Borrar el producto "${name}"?`)) return;
        setBusy(true);
        try {
            const { error } = await supabase.from("products").delete().eq("id", id);
            if (error) throw error;
            setMsg({ kind: "ok", text: `Producto "${name}" eliminado` });
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
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Productos (Platos y Bebidas)</h2>
                    <p className="text-[11.5px] text-slate-500">
                        {list.length} producto{list.length !== 1 ? "s" : ""} · Sincronizado con Supabase
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={load} disabled={loading}
                            className="h-9 w-9 rounded-xl bg-slate-100 hover:bg-slate-200
                                       flex items-center justify-center text-slate-600
                                       disabled:opacity-50 active:scale-95 transition"
                            title="Refrescar">
                        <IconRefresh size={14} strokeWidth={2} className={loading ? "animate-spin" : ""} />
                    </button>
                    <button onClick={startNew} disabled={showForm}
                            className="h-9 px-3 rounded-xl bg-blue-600 hover:bg-blue-700
                                       text-white text-[12.5px] font-bold
                                       flex items-center gap-1.5
                                       disabled:opacity-50 active:scale-95 transition">
                        <IconPlus size={13} strokeWidth={2.4} />
                        Nuevo
                    </button>
                </div>
            </div>

            {showForm && (
                <div className="p-4 rounded-2xl bg-blue-50/40 border border-blue-200/80 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                        <label className="block text-[10.5px] font-bold text-slate-600 mb-1">Nombre</label>
                        <input type="text" value={form.name}
                               onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                               placeholder="Tajen de Cordero"
                               className="h-9 w-full px-2.5 rounded-lg border border-slate-200 bg-white
                                          text-[12.5px] outline-none focus:border-blue-400" />
                    </div>
                    <div>
                        <label className="block text-[10.5px] font-bold text-slate-600 mb-1">Precio (€)</label>
                        <input type="text" value={form.price}
                               onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                               placeholder="17.00"
                               className="h-9 w-full px-2.5 rounded-lg border border-slate-200 bg-white
                                          text-[12.5px] tabular-nums outline-none focus:border-blue-400" />
                    </div>
                    <div>
                        <label className="block text-[10.5px] font-bold text-slate-600 mb-1">Categoría</label>
                        <select value={form.category_id}
                                onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                                className="h-9 w-full px-2.5 rounded-lg border border-slate-200 bg-white
                                           text-[12.5px] outline-none">
                            <option value="">— Sin categoría —</option>
                            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10.5px] font-bold text-slate-600 mb-1">IVA</label>
                        <select value={form.tax_rate}
                                onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))}
                                className="h-9 w-full px-2.5 rounded-lg border border-slate-200 bg-white
                                           text-[12.5px] outline-none">
                            <option value="10">10% (restauración)</option>
                            <option value="21">21% (bebidas alcoholicas)</option>
                            <option value="4">4% (básico)</option>
                        </select>
                    </div>
                    <div className="sm:col-span-2">
                        <label className="block text-[10.5px] font-bold text-slate-600 mb-1">Descripción</label>
                        <input type="text" value={form.description}
                               onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                               placeholder="Tajín de cordero especiado"
                               className="h-9 w-full px-2.5 rounded-lg border border-slate-200 bg-white
                                          text-[12.5px] outline-none focus:border-blue-400" />
                    </div>
                    <div className="sm:col-span-2">
                        <label className="block text-[10.5px] font-bold text-slate-600 mb-1">URL de imagen</label>
                        <input type="text" value={form.image_url}
                               onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                               placeholder="https://images.unsplash.com/..."
                               className="h-9 w-full px-2.5 rounded-lg border border-slate-200 bg-white
                                          text-[12px] font-mono outline-none focus:border-blue-400" />
                    </div>
                    <div className="sm:col-span-2 flex gap-2 pt-1">
                        <button onClick={() => { setShowForm(false); setEditing(null); }}
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
                            {busy ? "Guardando…" : (editing ? "Guardar cambios" : "Crear producto")}
                        </button>
                    </div>
                </div>
            )}

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
                        No hay productos.  Añade el primero arriba.
                    </div>
                )}
                {list.map(p => {
                    const cat = cats.find(c => c.id === p.category_id);
                    return (
                        <div key={p.id}
                             className="flex items-center gap-2.5 p-2 rounded-xl border border-slate-200/80 bg-white">
                            {p.image_url ? (
                                <img src={p.image_url} alt="" loading="lazy"
                                     className="w-10 h-10 rounded-lg object-cover bg-slate-50 shrink-0" />
                            ) : (
                                <div className="w-10 h-10 rounded-lg bg-slate-100 shrink-0
                                                flex items-center justify-center text-slate-400 text-[10px]">N/A</div>
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="text-[12.5px] font-semibold text-slate-900 truncate">
                                    {p.name}
                                </div>
                                <div className="text-[10.5px] text-slate-500 truncate">
                                    {cat?.name ?? "Sin categoría"} · IVA {p.tax_rate}%
                                </div>
                            </div>
                            <div className="text-[14px] font-black tabular-nums text-slate-900">
                                {Number(p.price).toFixed(2)}€
                            </div>
                            <button onClick={() => startEdit(p)} disabled={busy}
                                    className="w-7 h-7 rounded-md text-slate-500 hover:text-blue-600
                                               hover:bg-blue-50 flex items-center justify-center
                                               active:scale-90 transition"
                                    title="Editar">
                                <IconPencil size={12} strokeWidth={2.2} />
                            </button>
                            <button onClick={() => del(p.id, p.name)} disabled={busy}
                                    className="w-7 h-7 rounded-md text-slate-500 hover:text-rose-600
                                               hover:bg-rose-50 flex items-center justify-center
                                               active:scale-90 transition"
                                    title="Borrar">
                                <IconTrash size={12} strokeWidth={2.2} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default ItemsPanel;
