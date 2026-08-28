import React, { useState, useEffect } from 'react';

interface ProductItem {
  id: string;
  name: string;
  price: number;
  category: string;
  image: string;
}

export function ItemsPanel() {
  const [items, setItems] = useState<ProductItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    category: 'Entrantes',
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300'
  });

  useEffect(() => {
    const saved = localStorage.getItem('pos_custom_products');
    if (saved) {
      try {
        setItems(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.price) return;

    const newItem: ProductItem = {
      id: `prod_${Date.now()}`,
      name: formData.name,
      price: parseFloat(formData.price),
      category: formData.category,
      image: formData.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300'
    };

    const updated = [newItem, ...items];
    setItems(updated);
    localStorage.setItem('pos_custom_products', JSON.stringify(updated));
    setIsModalOpen(false);
    setFormData({ name: '', price: '', category: 'Entrantes', image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300' });
  };

  const handleDelete = (id: string) => {
    const updated = items.filter(it => it.id !== id);
    setItems(updated);
    localStorage.setItem('pos_custom_products', JSON.stringify(updated));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Gestión de Artículos</h2>
          <p className="text-xs text-slate-500">Añade platos y bebidas al catálogo del TPV</p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow transition"
        >
          + Nuevo Artículo
        </button>
      </div>

      {/* Grid de artículos añadidos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-2">
        {items.map(item => (
          <div key={item.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 flex flex-col justify-between shadow-sm">
            <img src={item.image} alt={item.name} className="w-full h-24 object-cover rounded-lg mb-2" />
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-white line-clamp-1">{item.name}</h4>
                <span className="text-[11px] text-slate-400">{item.category}</span>
              </div>
              <span className="text-xs font-black text-blue-600 dark:text-blue-400">{item.price.toFixed(2)}€</span>
            </div>
            <button
              type="button"
              onClick={() => handleDelete(item.id)}
              className="w-full py-1 text-[11px] font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition"
            >
              Eliminar
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <div className="col-span-full py-8 text-center text-slate-400 text-xs bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
            No hay artículos personalizados creados. Pulsa en "+ Nuevo Artículo" para registrar el primero.
          </div>
        )}
      </div>

      {/* Modal Formulario Nuevo Artículo */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">Nuevo Artículo</h3>
            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Nombre del plato o bebida</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej. Hamburguesa Especial"
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Precio (€ IVA inc.)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.price}
                    onChange={e => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0.00"
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Categoría</label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full h-9 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
                  >
                    <option value="Entrantes">Entrantes</option>
                    <option value="Carne">Carne</option>
                    <option value="Pescado">Pescado</option>
                    <option value="Pizza">Pizza</option>
                    <option value="Bebidas">Bebidas</option>
                    <option value="Postres">Postres</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">URL de la Imagen</label>
                <input
                  type="url"
                  value={formData.image}
                  onChange={e => setFormData({ ...formData, image: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs"
                />
              </div>
              <div className="flex gap-2 justify-end mt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold"
                >
                  Guardar Artículo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
