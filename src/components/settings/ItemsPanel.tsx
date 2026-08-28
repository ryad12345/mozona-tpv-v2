import React, { useState, useEffect } from 'react';

export interface CustomProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  image: string;
}

const DEFAULT_CATEGORY_IMAGES: Record<string, string> = {
  Bebidas: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400',
  Carne: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400',
  Pescado: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400',
  Pizza: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400',
  Pasta: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=400',
  Entrantes: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400',
  Postres: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=400'
};

const INITIAL_MENU_PRODUCTS: CustomProduct[] = [
  {
    id: 'prod_1',
    name: 'Ensalada Rusa',
    price: 9.00,
    category: 'Entrantes',
    image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400'
  },
  {
    id: 'prod_2',
    name: 'Ensalada Mixta',
    price: 7.00,
    category: 'Entrantes',
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400'
  },
  {
    id: 'prod_3',
    name: 'Ensalada Griega',
    price: 7.80,
    category: 'Entrantes',
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'
  },
  {
    id: 'prod_4',
    name: 'Ensalada Marroquí',
    price: 6.80,
    category: 'Entrantes',
    image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400'
  },
  {
    id: 'prod_5',
    name: 'Ensalada Marroquí de Berenjenas',
    price: 6.50,
    category: 'Entrantes',
    image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400'
  },
  {
    id: 'prod_6',
    name: 'Gambas al pil pil o al ajillo',
    price: 10.00,
    category: 'Pescado',
    image: 'https://images.unsplash.com/photo-1559742811-822873691df8?w=400'
  },
  {
    id: 'prod_7',
    name: 'Pulpo a la Gallega',
    price: 6.00,
    category: 'Pescado',
    image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400'
  },
  {
    id: 'prod_8',
    name: 'Almejas al gusto',
    price: 7.50,
    category: 'Pescado',
    image: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=400'
  },
  {
    id: 'prod_9',
    name: 'Menú de Kebab',
    price: 7.50,
    category: 'Carne',
    image: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=400'
  },
  {
    id: 'prod_10',
    name: 'Menú de Hamburguesa',
    price: 8.00,
    category: 'Carne',
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400'
  },
  {
    id: 'prod_11',
    name: 'Menú de Nuggets de Pollo',
    price: 6.95,
    category: 'Carne',
    image: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400'
  },
  {
    id: 'prod_12',
    name: 'Pollo entero con patatas',
    price: 12.00,
    category: 'Carne',
    image: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=400'
  },
  {
    id: 'prod_13',
    name: 'Medio pollo con patatas',
    price: 6.50,
    category: 'Carne',
    image: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=400'
  },
  {
    id: 'prod_14',
    name: 'Ración de alitas de pollo',
    price: 5.50,
    category: 'Carne',
    image: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=400'
  },
  {
    id: 'prod_15',
    name: 'Pizza Margarita',
    price: 8.50,
    category: 'Pizza',
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400'
  },
  {
    id: 'prod_16',
    name: 'Pizza Barbacoa',
    price: 10.50,
    category: 'Pizza',
    image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400'
  },
  {
    id: 'prod_17',
    name: 'Coca Cola 33cl',
    price: 2.00,
    category: 'Bebidas',
    image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400'
  },
  {
    id: 'prod_18',
    name: 'Agua Mineral 50cl',
    price: 1.50,
    category: 'Bebidas',
    image: 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=400'
  }
];

export function ItemsPanel() {
  const [items, setItems] = useState<CustomProduct[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CustomProduct | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    category: 'Entrantes',
    image: DEFAULT_CATEGORY_IMAGES['Entrantes']
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pos_custom_products');
      if (saved) {
        setItems(JSON.parse(saved));
      } else {
        // Inicializar con todos los platos por defecto si está vacío
        localStorage.setItem('pos_custom_products', JSON.stringify(INITIAL_MENU_PRODUCTS));
        setItems(INITIAL_MENU_PRODUCTS);
        window.dispatchEvent(new Event('storage'));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const openNewModal = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      price: '',
      category: 'Entrantes',
      image: DEFAULT_CATEGORY_IMAGES['Entrantes']
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item: CustomProduct) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      price: item.price.toString(),
      category: item.category,
      image: item.image
    });
    setIsModalOpen(true);
  };

  const handleCategoryChange = (cat: string) => {
    setFormData(prev => ({
      ...prev,
      category: cat,
      image: DEFAULT_CATEGORY_IMAGES[cat] || DEFAULT_CATEGORY_IMAGES['Entrantes']
    }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.price) return;

    let updated: CustomProduct[];
    if (editingItem) {
      updated = items.map(it =>
        it.id === editingItem.id
          ? {
              ...it,
              name: formData.name.trim(),
              price: parseFloat(formData.price),
              category: formData.category,
              image: formData.image
            }
          : it
      );
    } else {
      const newItem: CustomProduct = {
        id: `prod_${Date.now()}`,
        name: formData.name.trim(),
        price: parseFloat(formData.price),
        category: formData.category,
        image: formData.image || DEFAULT_CATEGORY_IMAGES[formData.category] || DEFAULT_CATEGORY_IMAGES['Entrantes']
      };
      updated = [newItem, ...items];
    }

    setItems(updated);
    localStorage.setItem('pos_custom_products', JSON.stringify(updated));
    window.dispatchEvent(new Event('storage'));
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    const updated = items.filter(it => it.id !== id);
    setItems(updated);
    localStorage.setItem('pos_custom_products', JSON.stringify(updated));
    window.dispatchEvent(new Event('storage'));
  };

  const handleResetDefaults = () => {
    if (confirm('¿Deseas restaurar todos los platos y bebidas por defecto?')) {
      localStorage.setItem('pos_custom_products', JSON.stringify(INITIAL_MENU_PRODUCTS));
      setItems(INITIAL_MENU_PRODUCTS);
      window.dispatchEvent(new Event('storage'));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Gestión de Artículos (Platos y Bebidas)</h2>
          <p className="text-xs text-slate-500">Total registrados: {items.length} productos</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-white font-bold text-xs rounded-xl transition"
          >
            Restaurar Carta
          </button>
          <button
            type="button"
            onClick={openNewModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow active:scale-95 transition"
          >
            + Nuevo Artículo
          </button>
        </div>
      </div>

      {/* Grid de todos los artículos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mt-2">
        {items.map(item => (
          <div key={item.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 flex flex-col justify-between shadow-sm">
            <img src={item.image} alt={item.name} className="w-full h-24 object-cover rounded-lg mb-2 bg-slate-100 dark:bg-slate-700" />
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1 min-w-0 pr-1">
                <h4 className="text-xs font-bold text-slate-800 dark:text-white line-clamp-1" title={item.name}>{item.name}</h4>
                <span className="text-[11px] text-slate-400">{item.category}</span>
              </div>
              <span className="text-xs font-black text-blue-600 dark:text-blue-400 whitespace-nowrap">{Number(item.price).toFixed(2)} €</span>
            </div>
            <div className="grid grid-cols-2 gap-1 pt-1 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => openEditModal(item)}
                className="py-1 text-[11px] font-bold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => handleDelete(item.id)}
                className="py-1 text-[11px] font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Crear / Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">
              {editingItem ? 'Editar Artículo' : 'Nuevo Artículo'}
            </h3>
            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <img src={formData.image} alt="Preview" className="w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shadow-sm" />
                <div className="flex-1">
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Foto del producto</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/40 dark:file:text-blue-200 cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej. Ensalada Rusa"
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
                    placeholder="9.00"
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Categoría</label>
                  <select
                    value={formData.category}
                    onChange={e => handleCategoryChange(e.target.value)}
                    className="w-full h-9 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
                  >
                    <option value="Entrantes">Entrantes</option>
                    <option value="Carne">Carne</option>
                    <option value="Pescado">Pescado</option>
                    <option value="Pizza">Pizza</option>
                    <option value="Pasta">Pasta</option>
                    <option value="Bebidas">Bebidas</option>
                    <option value="Postres">Postres</option>
                  </select>
                </div>
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
                  {editingItem ? 'Guardar Cambios' : 'Crear Artículo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ItemsPanel;
