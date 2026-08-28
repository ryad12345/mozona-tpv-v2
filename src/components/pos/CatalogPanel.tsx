// =====================================================================
// MOZONA TPV — CatalogPanel: columna izquierda (categorías + productos + mesas)
// =====================================================================

import { useMemo, useState, useRef, type ReactNode } from "react";
import type { Category, Product, RestaurantTable, TableStatus } from "../../lib/types";
import { IconPlus } from "../icons";
import { fmtEUR } from "../../lib/format";
import { cn } from "../../lib/cn";

/** Placeholder inline SVG (no necesita red) para cuando falla la imagen. */
const FALLBACK_IMG =
    "data:image/svg+xml;utf8," + encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'>` +
        `<rect width='80' height='80' fill='#F1F5F9'/>` +
        `<text x='50%' y='52%' text-anchor='middle' font-family='system-ui,sans-serif' ` +
        `font-size='32' fill='#94A3B8'>🍽</text></svg>`
    );

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

export interface CatalogPanelProps {
    categories:  Category[];
    products:    Product[];
    tables:      RestaurantTable[];
    selectedCategoryId: string | null;
    onSelectCategory:   (id: string | null) => void;
    selectedTableId:    string | null;
    onSelectTable:      (id: string | null) => void;
    onAddProduct:       (p: Product) => void;
    variant?:            "full" | "controls" | "products";
    search?:             string;
    onSearchChange?:     (value: string) => void;
}

// ---------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------

export function CatalogPanel({
    categories, products, tables,
    selectedCategoryId, onSelectCategory,
    selectedTableId, onSelectTable,
    onAddProduct,
    variant = "full",
    search: controlledSearch,
    onSearchChange,
}: CatalogPanelProps) {
    const [localSearch, setLocalSearch] = useState("");
    const search = controlledSearch ?? localSearch;
    const setSearch = onSearchChange ?? setLocalSearch;
    const categoriesRef = useRef<HTMLDivElement>(null);
    const productsGridRef = useRef<HTMLDivElement>(null);

    const scrollCategories = (direction: 'left' | 'right') => {
        if (categoriesRef.current) {
            const amount = direction === 'left' ? -200 : 200;
            categoriesRef.current.scrollBy({ left: amount, behavior: 'smooth' });
        }
    };

    const scrollProducts = (direction: 'up' | 'down') => {
        if (productsGridRef.current) {
            const amount = direction === 'up' ? -300 : 300;
            productsGridRef.current.scrollBy({ top: amount, behavior: 'smooth' });
        }
    };

    const filteredProducts = useMemo(() => {
        const list = selectedCategoryId
            ? products.filter(p => p.category_id === selectedCategoryId)
            : products;
        if (!search.trim()) return list;
        const q = search.toLowerCase();
        return list.filter(p => p.name.toLowerCase().includes(q));
    }, [products, selectedCategoryId, search]);

    const productsGrid = (
        <section className="flex-1 min-h-0 flex flex-col relative">
            {/* Contenedor principal con overflow */}
            <div 
                ref={productsGridRef}
                className="grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 w-full p-2 content-start flex-1 overflow-y-auto min-h-0"
            >
                {filteredProducts.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-[12px] text-slate-400">
                        No hay productos que coincidan
                    </div>
                ) : (
                    filteredProducts.map(p => (
                        <ProductCard
                            key={p.id}
                            product={p}
                            onAdd={() => onAddProduct(p)}
                        />
                    ))
                )}
            </div>

            {/* Botones flotantes de scroll táctil - vertical */}
            {filteredProducts.length > 0 && (
                <>
                    <button
                        type="button"
                        onClick={() => scrollProducts('up')}
                        className="absolute top-2 right-2 w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center shadow-md active:scale-95 transition z-10"
                        title="Desplazar arriba"
                    >
                        ▲
                    </button>
                    <button
                        type="button"
                        onClick={() => scrollProducts('down')}
                        className="absolute bottom-2 right-2 w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center shadow-md active:scale-95 transition z-10"
                        title="Desplazar abajo"
                    >
                        ▼
                    </button>
                </>
            )}
        </section>
    );

    const categoryAndSearch = (
        <>
            {/* Categorías con scroll táctil ------------------------------------------- */}
            <div className="shrink-0 flex items-center gap-1.5 mb-2">
                <button 
                    type="button" 
                    onClick={() => scrollCategories('left')}
                    className="h-8 w-8 shrink-0 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center justify-center text-sm font-bold active:scale-95 transition"
                >
                    ◀
                </button>
                
                <div ref={categoriesRef} className="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar py-0.5 scroll-smooth bg-white dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 px-2">
                    <CategoryTab
                        active={selectedCategoryId === null}
                        onClick={() => onSelectCategory(null)}
                    >
                        Todo
                    </CategoryTab>
                    {categories.map(c => (
                        <CategoryTab
                            key={c.id}
                            active={selectedCategoryId === c.id}
                            onClick={() => onSelectCategory(c.id)}
                        >
                            {c.name}
                        </CategoryTab>
                    ))}
                </div>

                <button 
                    type="button" 
                    onClick={() => scrollCategories('right')}
                    className="h-8 w-8 shrink-0 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center justify-center text-sm font-bold active:scale-95 transition"
                >
                    ▶
                </button>

                <input 
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar plato…"
                    className="w-40 h-8 text-xs px-2.5 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition"
                />
            </div>
        </>
    );

    const controls = (
        <>
            {/* Selector de mesa ------------------------------------- */}
            <section className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-2 shrink-0">
                <h2 className="text-[10px] font-bold tracking-[0.15em] text-slate-500 uppercase mb-2">
                    Mesas
                </h2>
                <div className="grid grid-cols-8 gap-1.5 shrink-0">
                    {tables.map((t, idx) => (
                        <TableChip
                            key={t.id}
                            table={t}
                            tableNumber={idx + 1}
                            selected={t.id === selectedTableId}
                            onClick={() => onSelectTable(t.id === selectedTableId ? null : t.id)}
                        />
                    ))}
                </div>
            </section>

            {categoryAndSearch}
        </>
    );

    if (variant === "controls") {
        return <div className="h-full min-h-0 flex flex-col justify-between gap-2 overflow-hidden">{controls}</div>;
    }

    if (variant === "products") {
        return productsGrid;
    }

    // variant === "full": mostrar categorías/buscador + grid
    return (
        <div className="h-full min-h-0 flex flex-col overflow-hidden gap-2">
            {categoryAndSearch}

            {/* Grid de productos */}
            {productsGrid}
        </div>
    );
}

// ---------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------

function CategoryTab({
    active, onClick, children,
}: { active: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "shrink-0 px-3.5 h-8 rounded-full",
                "text-[12.5px] font-semibold whitespace-nowrap",
                "transition active:scale-95",
                active
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/30"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
        >
            {children}
        </button>
    );
}

function TableChip({
    table, tableNumber, selected, onClick,
}: { table: RestaurantTable; tableNumber: number; selected: boolean; onClick: () => void }) {
    const tone = STATUS_TONES[table.status];
    return (
        <button
            onClick={onClick}
            className={cn(
                "h-10 text-sm font-bold rounded-lg flex items-center justify-center transition-colors",
                selected
                    ? `${tone.active} ring-2 ring-offset-1 ring-blue-500`
                    : `${tone.idle}`
            )}
        >
            <span className="tabular-nums">{tableNumber}</span>
        </button>
    );
}

const STATUS_TONES: Record<TableStatus, { idle: string; active: string }> = {
    FREE:           { idle: "bg-emerald-100 text-emerald-800",   active: "bg-emerald-500 text-white" },
    OCCUPIED:       { idle: "bg-blue-100 text-blue-800",         active: "bg-blue-500 text-white" },
    BILL_REQUESTED: { idle: "bg-amber-100 text-amber-800",       active: "bg-amber-500 text-white" },
    RESERVED:       { idle: "bg-violet-100 text-violet-800",     active: "bg-violet-500 text-white" },
    DIRTY:          { idle: "bg-slate-200 text-slate-600",       active: "bg-slate-500 text-white" },
};

function ProductCard({
    product, onAdd,
}: { product: Product; onAdd: () => void }) {
    const [imgError, setImgError] = useState(false);
    const hasImg = !!product.image_url && !imgError;

    return (
        <button
            onClick={onAdd}
            disabled={!product.is_available}
            className={cn(
                "group w-full m-0 min-w-0 min-h-[160px] shrink-0 text-left overflow-hidden flex flex-col justify-between",
                "rounded-xl border border-slate-200/80 p-2",
                "bg-white",
                "transition active:scale-[0.98] hover:shadow-md",
                !product.is_available && "opacity-40 cursor-not-allowed"
            )}
        >
            {/* Imagen */}
            <div className="relative w-full h-24 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-700">
                {hasImg ? (
                    <img
                        src={product.image_url!}
                        alt={product.name}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={() => setImgError(true)}
                        className="
                            absolute inset-0 w-full h-full object-cover
                            transition duration-300 group-hover:scale-105
                        "
                    />
                ) : (
                    <img
                        src={FALLBACK_IMG}
                        alt=""
                        aria-hidden
                        className="absolute inset-0 w-full h-full object-cover"
                    />
                )}
                {/* Overlay precio + add */}
                <div className="
                    absolute bottom-1.5 left-1.5 right-1.5
                    flex items-center justify-between gap-1
                    pointer-events-none
                ">
                    <span className="
                        px-2 py-0.5 rounded-full
                        bg-white/95 backdrop-blur
                        text-[12px] font-black text-slate-900 tabular-nums
                        shadow-sm
                    ">
                        {fmtEUR(product.price)}
                    </span>
                    <span
                        className="
                            w-7 h-7 rounded-full
                            bg-blue-600 text-white
                            flex items-center justify-center
                            shadow-sm shadow-blue-600/30
                            pointer-events-auto
                            transition group-hover:scale-110
                        "
                    >
                        <IconPlus size={16} strokeWidth={2.4} />
                    </span>
                </div>
            </div>
            {/* Texto */}
            <div className="mt-1.5">
                <div className="text-sm font-semibold text-slate-900 leading-tight line-clamp-2 min-h-[2.4em]">
                    {product.name}
                </div>
                {product.description && (
                    <div className="text-[10.5px] text-slate-500 line-clamp-1 mt-0.5">
                        {product.description}
                    </div>
                )}
            </div>
        </button>
    );
}
