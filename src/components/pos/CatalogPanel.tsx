import React, { useRef, useState, useEffect } from 'react';

export function CatalogPanel(props: any) {
  const categoriesRef = useRef<HTMLDivElement>(null);
  const [customProducts, setCustomProducts] = useState<any[]>([]);

  useEffect(() => {
    const sync = () => {
      try {
        const raw = localStorage.getItem('pos_custom_products');
        if (raw) setCustomProducts(JSON.parse(raw));
      } catch (err) {
        console.error(err);
      }
    };
    sync();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const scrollCats = (dir: 'left' | 'right') => {
    if (categoriesRef.current) {
      categoriesRef.current.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
    }
  };

  const baseList = props.products || [];
  const allList = [...customProducts, ...baseList];

  const filtered = allList.filter((p: any) => {
    const activeCat = props.selectedCategory || 'all';
    const matchesCat = activeCat === 'all' || activeCat === 'Todo' || p.category?.toLowerCase() === activeCat.toLowerCase();
    const matchesQuery = !props.searchQuery || p.name?.toLowerCase().includes(props.searchQuery.toLowerCase());
    return matchesCat && matchesQuery;
  });

  const categories = props.categories || [
    { id: 'all', name: 'Todo' },
    { id: 'Entrantes', name: 'Entrantes' },
    { id: 'Carne', name: 'Carne' },
    { id: 'Pescado', name: 'Pescado' },
    { id: 'Pizza', name: 'Pizza' },
    { id: 'Pasta', name: 'Pasta' },
    { id: 'Bebidas', name: 'Bebidas' },
    { id: 'Postres', name: 'Postres' }
  ];

  return (
    <div className="w-full h-full flex flex-col p-2 overflow-hidden">
      {/* Selector de Categorías y Buscador */}
      <div className="shrink-0 flex items-center gap-1.5 mb-2.5">
        <button
          type="button"
          onClick={() => scrollCats('left')}
          className="h-8 w-8 shrink-0 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 flex items-center justify-center text-xs font-bold active:scale-95"
        >
          ◀
        </button>

        <div ref={categoriesRef} className="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar py-0.5 scroll-smooth">
          {categories.map((cat: any) => {
            const isSelected = (props.selectedCategory || 'all') === cat.id || (props.selectedCategory === 'all' && cat.name === 'Todo');
            return (
              <button
                key={cat.id || cat.name}
                type="button"
                onClick={() => props.onSelectCategory?.(cat.id || cat.name)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold shrink-0 transition active:scale-95 ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => scrollCats('right')}
          className="h-8 w-8 shrink-0 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 flex items-center justify-center text-xs font-bold active:scale-95"
        >
          ▶
        </button>

        <input
          type="text"
          value={props.searchQuery || ''}
          onChange={e => props.onSearchChange?.(e.target.value)}
          placeholder="Buscar plato..."
          className="w-36 sm:w-44 h-8 text-xs px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent ml-1"
        />
      </div>

      {/* Grid de Platos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 p-1 content-start flex-1 overflow-y-auto min-h-0">
        {filtered.map((product: any) => (
          <article
            key={product.id}
            onClick={() => props.onAddProduct?.(product)}
            className="w-full rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 flex flex-col justify-between shadow-sm hover:shadow-md transition cursor-pointer select-none active:scale-98"
          >
            <div className="relative w-full h-24 shrink-0 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700">
              <img
                src={product.image_url || product.image}
                alt={product.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <span className="absolute bottom-1 left-1 bg-black/80 text-white text-[11px] font-bold px-1.5 py-0.5 rounded shadow">
                {Number(product.price).toFixed(2)} €
              </span>
            </div>

            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-2 mt-1.5 leading-tight">
              {product.name}
            </h4>
          </article>
        ))}
      </div>
    </div>
  );
}
