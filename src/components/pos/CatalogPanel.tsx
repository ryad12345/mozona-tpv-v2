// =====================================================================
// MOZONA TPV — CatalogPanel: columna izquierda (categorías + productos + mesas)
// =====================================================================

import { useMemo, useState, type ReactNode } from "react";
import type { Category, Product, RestaurantTable, TableStatus } from "../../lib/types";
import { IconPlus, IconSearch } from "../icons";
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
}

// ---------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------

export function CatalogPanel({
    categories, products, tables,
    selectedCategoryId, onSelectCategory,
    selectedTableId, onSelectTable,
    onAddProduct,
}: CatalogPanelProps) {
    const [search, setSearch] = useState("");

    const filteredProducts = useMemo(() => {
        const list = selectedCategoryId
            ? products.filter(p => p.category_id === selectedCategoryId)
            : products;
        if (!search.trim()) return list;
        const q = search.toLowerCase();
        return list.filter(p => p.name.toLowerCase().includes(q));
    }, [products, selectedCategoryId, search]);

    return (
        <div className="h-full min-h-0 flex flex-col overflow-hidden gap-2">
            {/* Selector de mesa ------------------------------------- */}
            <section className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-2 shrink-0">
                <h2 className="text-[10px] font-bold tracking-[0.15em] text-slate-500 uppercase mb-2">
                    Sala
                </h2>
                <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 shrink-0">
                    {tables.map(t => (
                        <TableChip
                            key={t.id}
                            table={t}
                            selected={t.id === selectedTableId}
                            onClick={() => onSelectTable(t.id === selectedTableId ? null : t.id)}
                        />
                    ))}
                </div>
            </section>

            {/* Categorías ------------------------------------------- */}
            <section className="bg-white rounded-xl border border-slate-200/80 shadow-sm shrink-0">
                <div className="shrink-0 py-2 px-2 overflow-x-auto no-scrollbar flex flex-nowrap gap-1.5">
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
            </section>

            {/* Buscador + Grid de productos ------------------------ */}
            <section className="flex-1 min-h-0 flex flex-col">
                <div className="relative mb-2 shrink-0">
                    <IconSearch
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar plato…"
                        className="
                            w-full h-9 pl-9 pr-3
                            rounded-xl border border-slate-200
                            text-sm
                            focus:border-blue-500 focus:ring-2 focus:ring-blue-100
                            outline-none transition
                        "
                    />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 w-full p-1 content-start flex-1 overflow-y-auto">
                        {filteredProducts.length === 0 ? (
                            <div className="col-span-2 py-12 text-center text-[12px] text-slate-400">
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
            </section>
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
    table, selected, onClick,
}: { table: RestaurantTable; selected: boolean; onClick: () => void }) {
    const tone = STATUS_TONES[table.status];
    const tableNumber = table.table_number.match(/\d+/)?.[0] ?? table.table_number;
    return (
        <button
            onClick={onClick}
            className={cn(
                "h-10 px-2 rounded-lg",
                "text-sm font-bold tabular-nums",
                "flex items-center justify-center",
                "transition active:scale-95",
                "border-2",
                selected
                    ? `${tone.active} border-transparent ring-2 ring-blue-500`
                    : `${tone.idle} border-transparent`
            )}
        >
            <span>{tableNumber}</span>
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
                "group w-full min-w-0 text-left overflow-hidden",
                "rounded-xl border border-slate-200/80 p-2.5",
                "bg-white",
                "transition active:scale-[0.98]",
                "hover:border-blue-300 hover:shadow-sm",
                !product.is_available && "opacity-40 cursor-not-allowed"
            )}
        >
            {/* Imagen */}
            <div className="relative h-24 sm:h-28 mb-2 w-full overflow-hidden rounded-lg bg-slate-50">
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
            <div>
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
