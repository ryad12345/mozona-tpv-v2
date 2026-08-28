import React, { useState, useEffect } from 'react';

export function CategoriesPanel() {
  const [categories, setCategories] = useState<string[]>(['Entrantes', 'Carne', 'Pescado', 'Pizza', 'Pasta', 'Bebidas']);
  const [newCat, setNewCat] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('pos_custom_categories');
    if (saved) {
      try {
        setCategories(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCat.trim()) return;
    const updated = [...categories, newCat.trim()];
    setCategories(updated);
    localStorage.setItem('pos_custom_categories', JSON.stringify(updated));
    setNewCat('');
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Gestión de Categorías</h2>
        <p className="text-xs text-slate-500">Organiza los grupos de productos</p>
      </div>

      <form onSubmit={handleAdd} className="flex gap-2 max-w-md">
        <input
          type="text"
          value={newCat}
          onChange={e => setNewCat(e.target.value)}
          placeholder="Nueva categoría (ej. Postres)"
          className="flex-1 h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
        />
        <button type="submit" className="px-4 bg-blue-600 text-white font-bold text-xs rounded-lg">
          + Añadir
        </button>
      </form>

      <div className="flex flex-wrap gap-2 mt-2">
        {categories.map((cat, idx) => (
          <span key={idx} className="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold shadow-sm">
            {cat}
          </span>
        ))}
      </div>
    </div>
  );
}
