import React, { useState, useEffect, useCallback } from 'react';
import { fetchCategories, saveCategory, deleteCategory, type PosCategory } from '../../lib/catalog';

export function CategoriesPanel() {
    const [categories, setCategories] = useState<PosCategory[]>([]);
    const [newCat, setNewCat] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchCategories();
            console.log("[CategoriesPanel] cargadas", data.length, "categorías");
            setCategories(data);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
        }
        setLoading(false);
    }, []);

    useEffect(() => { void load(); }, [load]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCat.trim()) return;
        setLoading(true);
        const result = await saveCategory({ name: newCat.trim() });
        if (result.ok) {
            setNewCat('');
            await load();
        } else {
            setError(result.error ?? "Error al guardar");
        }
        setLoading(false);
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`¿Eliminar la categoría "${name}"?`)) return;
        setLoading(true);
        const result = await deleteCategory(id, true);
        if (result.ok) {
            await load();
        } else {
            setError(result.error ?? "Error al eliminar");
        }
        setLoading(false);
    };

    return (
        <div className="flex flex-col gap-4">
            <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Gestión de Categorías</h2>
                <p className="text-xs text-slate-500">
                    Categorías cargadas en vivo desde Supabase ({categories.length})
                </p>
            </div>

            {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
                    {error}
                </div>
            )}

            <form onSubmit={handleAdd} className="flex gap-2 max-w-md">
                <input
                    type="text"
                    value={newCat}
                    onChange={e => setNewCat(e.target.value)}
                    placeholder="Nueva categoría (ej. Postres)"
                    className="flex-1 h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
                />
                <button
                    type="submit"
                    disabled={loading}
                    className="px-4 bg-blue-600 text-white font-bold text-xs rounded-lg disabled:opacity-50"
                >
                    + Añadir
                </button>
            </form>

            <div className="flex flex-wrap gap-2 mt-2">
                {loading && categories.length === 0 ? (
                    <span className="text-xs text-slate-500">Cargando categorías...</span>
                ) : categories.length === 0 ? (
                    <span className="text-xs text-slate-500">
                        No hay categorías. Crea la primera arriba.
                    </span>
                ) : (
                    categories.map(cat => (
                        <span
                            key={cat.id}
                            className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold shadow-sm flex items-center gap-2"
                        >
                            {cat.name}
                            <button
                                type="button"
                                onClick={() => handleDelete(cat.id, cat.name)}
                                className="text-rose-500 hover:text-rose-700 font-bold"
                                title="Eliminar"
                            >
                                ×
                            </button>
                        </span>
                    ))
                )}
            </div>

            <button
                type="button"
                onClick={load}
                disabled={loading}
                className="self-start text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
                {loading ? "Cargando..." : "↻ Recargar"}
            </button>
        </div>
    );
}
