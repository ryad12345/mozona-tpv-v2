import React, { useRef, useState, useEffect } from 'react';

const FALLBACK_IMG = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400";

export function CatalogPanel(props: any) {
  const categoriesRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  // FIX: usar SIEMPRE props.products (de Supabase vía usePosData).
  // Antes: leía de localStorage 'pos_custom_products_*' lo que causaba
  // desincronización entre Settings y TPV.
  const [productsList, setProductsList] = useState<any[]>(props.products || []);
  const [internalCategory, setInternalCategory] = useState<string>('all');

  useEffect(() => {
    // FORZAR repintar cuando llegan productos reales de Supabase
    if (Array.isArray(props.products) && props.products.length > 0) {
      setProductsList(props.products);
      console.log("[CatalogPanel] productos actualizados:", props.products.length);
    } else if (Array.isArray(props.products) && props.products.length === 0) {
      setProductsList([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify((props.products || []).map((p: any) => p.id))]);

  const activeCategory = props.selectedCategory !== undefined ? props.selectedCategory : internalCategory;

  const handleCategoryClick = (catVal: string) => {
    setInternalCategory(catVal);
    if (typeof props.onSelectCategory === 'function') {
      props.onSelectCategory(catVal);
    }
  };

  const scrollCats = (dir: 'left' | 'right') => {
    if (categoriesRef.current) {
      categoriesRef.current.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
    }
  };

  const scrollGrid = (dir: 'up' | 'down') => {
    if (gridContainerRef.current) {
      gridContainerRef.current.scrollBy({ top: dir === 'up' ? -220 : 220, behavior: 'smooth' });
    }
  };

  // Normaliza un string: minúsculas + sin tildes + trim
  const norm = (s: any) =>
    (s ?? "").toString().toLowerCase().trim()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const filtered = productsList.filter((product: any) => {
    const isAll = !activeCategory
      || activeCategory === "all"
      || norm(activeCategory) === "todo";

    if (isAll) {
      // Sin filtro: solo el filtro de búsqueda
      const searchQuery = norm(props.searchQuery);
      const matchesSearch = !searchQuery
        || norm(product.name).includes(searchQuery);
      return matchesSearch;
    }

    // ★ Matching cruzado: UUID o nombre de categoría
    const cats = Array.isArray(props.categories) ? props.categories : [];
    const currentCat = cats.find(
      (c: any) => norm(c.id) === norm(activeCategory) || norm(c.name) === norm(activeCategory),
    );
    const targetId   = norm(currentCat?.id)     || norm(activeCategory);
    const targetName = norm(currentCat?.name)   || norm(activeCategory);

    const productCat     = norm(product.category);
    const productCatName = norm(product.category_name);
    const productCatId   = (product.category_id ?? "").toString().trim();
    const productCatIdN  = norm(productCatId);

    // Match por UUID exacto O por nombre de categoría
    const matchesCategory =
      productCatIdN === targetId ||
      productCatIdN === targetName ||
      productCat === targetName ||
      productCat === norm(activeCategory) ||
      productCatName === targetName ||
      productCatName === norm(activeCategory) ||
      (productCatId && productCatId === activeCategory);

    const searchQuery = norm(props.searchQuery);
    const matchesSearch = !searchQuery
      || norm(product.name).includes(searchQuery);

    return matchesCategory && matchesSearch;
  });

  // ★ Categorías 100% DINÁMICAS desde Supabase
  //    Prioridad: props.categories (de usePosData → fetchCategories)
  //    Fallback: derivar de productos (solo si no hay categorías)
  const propsCats = Array.isArray(props.categories) ? props.categories : [];
  const categoryList = (() => {
    if (propsCats.length > 0) {
      return [
        { id: 'all', name: 'Todo' },
        ...propsCats
          .filter((c: any) => c && (c.name ?? '').toString().trim() !== '')
          .map((c: any) => ({
            id: c.id ?? c.name,
            name: c.name,
          })),
      ];
    }
    // Fallback: derivar de productos
    const dynamicCategories = Array.from(
      new Set(
        productsList
          .map((p: any) => (p.category ?? "").toString().trim())
          .filter(Boolean)
      )
    ).sort();
    return [
      { id: 'all', name: 'Todo' },
      ...dynamicCategories.map(c => ({ id: c, name: c })),
    ];
  })();

  return (
    <div className="relative w-full h-full flex flex-col p-2 bg-slate-50/50 dark:bg-slate-900/50 rounded-xl overflow-hidden">
      {/* Barra de Categorías Horizontal */}
      <div className="shrink-0 flex items-center gap-1 mb-2">
        <button
          type="button"
          onClick={() => scrollCats('left')}
          className="h-8 w-8 shrink-0 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 flex items-center justify-center text-xs font-bold active:scale-95 transition shadow-sm"
        >
          ◀
        </button>

        <div
          ref={categoriesRef}
          className="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar py-0.5 scroll-smooth items-center"
        >
          {categoryList.map(cat => {
            const isSelected =
              activeCategory === cat.id ||
              (activeCategory === 'all' && cat.id === 'all') ||
              activeCategory?.toLowerCase() === cat.name?.toLowerCase();

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryClick(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition active:scale-95 shadow-sm whitespace-nowrap ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
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
          className="h-8 w-8 shrink-0 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 flex items-center justify-center text-xs font-bold active:scale-95 transition shadow-sm"
        >
          ▶
        </button>

        <input
          type="text"
          value={props.searchQuery || ''}
          onChange={e => props.onSearchChange?.(e.target.value)}
          placeholder="Buscar..."
          className="w-28 sm:w-36 h-8 text-xs px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ml-1"
        />
      </div>

      {/* Grid de Platos Original Compacto */}
      <div
        ref={gridContainerRef}
        className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-2 content-start flex-1 overflow-y-auto min-h-0 scroll-smooth pr-12 pb-2"
      >
        {filtered.map((product: any) => (
          <article
            key={product.id}
            onClick={() => props.onAddProduct?.(product)}
            className="w-full rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1.5 flex flex-col justify-between shadow-sm hover:border-blue-400 transition cursor-pointer select-none active:scale-95"
          >
            <div className="relative w-full h-20 shrink-0 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700">
              <img
                src={product.image_url || product.image || FALLBACK_IMG}
                alt={product.name}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e: any) => {
                  e.target.onerror = null;
                  e.target.src = FALLBACK_IMG;
                }}
              />
              <span className="absolute bottom-1 left-1 bg-slate-900/90 text-white text-[10px] font-black px-1.5 py-0.5 rounded shadow">
                {Number(product.price).toFixed(2)} €
              </span>
            </div>

            <div className="mt-1 flex flex-col justify-between flex-1">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-1 leading-tight">
                {product.name}
              </h4>
              <span className="text-[10px] text-slate-400 truncate">
                {product.description || product.category}
              </span>
            </div>
          </article>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400 text-xs font-semibold">
            {productsList.length === 0 ? (
              <div>
                <p className="mb-1">📭 No hay productos en este tenant.</p>
                <p className="text-[10.5px] text-slate-500 mt-1">
                  Ve a Settings → 🍽️ Productos o ejecuta database/15_seed_products.sql
                </p>
              </div>
            ) : (
              "No hay platos en esta categoría."
            )}
          </div>
        )}
      </div>

      {/* Botones Flotantes de Scroll */}
      <div className="absolute right-2 bottom-2 flex flex-col gap-1.5 z-20">
        <button
          type="button"
          onClick={() => scrollGrid('up')}
          className="w-9 h-9 bg-slate-900/80 hover:bg-slate-900 text-white dark:bg-slate-700/80 rounded-lg shadow flex items-center justify-center text-xs font-black active:scale-90 transition backdrop-blur-sm"
          title="Subir"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={() => scrollGrid('down')}
          className="w-9 h-9 bg-slate-900/80 hover:bg-slate-900 text-white dark:bg-slate-700/80 rounded-lg shadow flex items-center justify-center text-xs font-black active:scale-90 transition backdrop-blur-sm"
          title="Bajar"
        >
          ▼
        </button>
      </div>
    </div>
  );
}

export default CatalogPanel;
