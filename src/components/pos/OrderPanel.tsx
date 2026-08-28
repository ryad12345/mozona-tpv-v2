// =====================================================================
// MOZONA TPV — OrderPanel: columna central (comanda fiscal)
// =====================================================================

import type { OrderItem } from "../../lib/types";
import { fmtEUR, fmtNum } from "../../lib/format";
import { IconMinus, IconPlus, IconX, IconReceipt } from "../icons";

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

export interface OrderPanelProps {
    items:        OrderItem[];
    tableLabel:   string | null;
    waiterName:   string | null;
    taxByRate:    Array<{ rate: number; base: number; tax: number; label: string }>;
    total:        number;
    itemCount:    number;
    onIncrement:  (id: string) => void;
    onDecrement:  (id: string) => void;
    onRemove:     (id: string) => void;
    onClear:      () => void;
    onPrintPreBill: () => void;
}

// ---------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------

export function OrderPanel({
    items, tableLabel, waiterName,
    taxByRate, total, itemCount,
    onIncrement, onDecrement, onRemove, onClear, onPrintPreBill,
}: OrderPanelProps) {

    return (
        <div className="h-full flex flex-col bg-white rounded-2xl border border-slate-200/80 shadow-sm min-h-0">
            {/* Cabecera compacta */}
            <header className="px-2.5 py-2.5 border-b border-slate-100 flex items-center gap-2 shrink-0">
                <div className="w-7 h-7 rounded-lg bg-slate-50 text-slate-700 flex items-center justify-center">
                    <IconReceipt size={15} strokeWidth={1.8} />
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className="text-[13px] font-bold text-slate-900 leading-tight truncate">
                        Comanda {tableLabel ? `· Mesa ${tableLabel.match(/\d+/)?.[0] ?? tableLabel}` : ""}
                    </h2>
                    <p className="text-[10px] text-slate-500 truncate">
                        {itemCount === 0
                            ? "Sin líneas"
                            : `${itemCount} ${itemCount === 1 ? "plato" : "platos"}`}
                        {waiterName && ` · ${waiterName}`}
                    </p>
                </div>
                {items.length > 0 && (
                    <button
                        onClick={onClear}
                        className="
                            px-2 h-7 rounded-lg
                            text-[10.5px] font-semibold
                            text-rose-600 hover:bg-rose-50
                            active:scale-95 transition
                        "
                    >
                        Vaciar
                    </button>
                )}
            </header>

            {/* Lista de líneas con scroll fluido */}
            <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
                {items.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-2">
                            <IconReceipt size={28} strokeWidth={1.4} />
                        </div>
                        <p className="text-[13px] font-semibold text-slate-500">
                            Añade productos desde el catálogo
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            Selecciona una mesa para empezar
                        </p>
                    </div>
                ) : (
                    <ul className="space-y-1.5">
                        {items.map(it => (
                            <OrderLine
                                key={it.id}
                                item={it}
                                onIncrement={() => onIncrement(it.id)}
                                onDecrement={() => onDecrement(it.id)}
                                onRemove={() => onRemove(it.id)}
                            />
                        ))}
                    </ul>
                )}
            </div>

            {/* Footer compacto con totales + acción de pre-cuenta */}
            <footer className="border-t border-slate-100 px-2.5 py-2.5 shrink-0 space-y-1">
                <div className="space-y-0.5">
                    {taxByRate.map(t => (
                        <div key={t.rate} className="flex justify-between text-[9px] text-slate-600">
                            <span>Subtotal {t.label} ({t.rate}%)</span>
                            <span className="tabular-nums">{fmtEUR(t.base)}</span>
                        </div>
                    ))}
                    {taxByRate.map(t => (
                        <div key={`tax-${t.rate}`} className="flex justify-between text-[9px] text-slate-600">
                            <span>IVA {t.rate}%</span>
                            <span className="tabular-nums">{fmtEUR(t.tax)}</span>
                        </div>
                    ))}
                </div>
                <div className="flex items-end justify-between pt-0.5 border-t border-slate-100">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                        Total
                    </span>
                    <span className="text-[18px] font-black text-slate-900 tabular-nums leading-none">
                        {fmtEUR(total)}
                    </span>
                </div>
                <button
                    onClick={onPrintPreBill}
                    disabled={items.length === 0}
                    className="
                        w-full h-7 rounded-lg
                        bg-amber-50 text-amber-800 border border-amber-200/80
                        text-[9px] font-bold
                        disabled:opacity-40 disabled:cursor-not-allowed
                        hover:bg-amber-100 active:scale-95 transition
                    "
                >
                    🧾 Pre-cuenta
                </button>
            </footer>
        </div>
    );
}

// ---------------------------------------------------------------------
// Subcomponente: línea de pedido
// ---------------------------------------------------------------------

function OrderLine({
    item, onIncrement, onDecrement, onRemove,
}: {
    item: OrderItem;
    onIncrement: () => void;
    onDecrement: () => void;
    onRemove:    () => void;
}) {
    const lineTotal = item.unit_price * item.quantity;
    return (
        <li className="group bg-slate-50 rounded-xl p-2 hover:bg-slate-100/80 transition">
            <div className="flex items-start gap-2">
                {/* Controles de cantidad */}
                <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <button
                        onClick={onIncrement}
                        className="w-6 h-6 rounded-md bg-white border border-slate-200 text-slate-700 flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 active:scale-90 transition"
                    >
                        <IconPlus size={12} strokeWidth={2.4} />
                    </button>
                    <span className="text-[13px] font-black tabular-nums text-slate-900 w-6 text-center">
                        {item.quantity}
                    </span>
                    <button
                        onClick={onDecrement}
                        className="w-6 h-6 rounded-md bg-white border border-slate-200 text-slate-700 flex items-center justify-center hover:bg-rose-50 hover:text-rose-600 active:scale-90 transition"
                    >
                        <IconMinus size={12} strokeWidth={2.4} />
                    </button>
                </div>

                {/* Contenido */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="text-[13px] font-semibold text-slate-900 leading-tight line-clamp-2 min-w-0">
                            {item.name}
                        </div>
                        <button
                            onClick={onRemove}
                            className="shrink-0 w-5 h-5 rounded text-slate-300 hover:text-rose-500 transition opacity-0 group-hover:opacity-100"
                        >
                            <IconX size={14} strokeWidth={2.4} />
                        </button>
                    </div>
                    <div className="flex items-baseline justify-between mt-0.5">
                        <span className="text-[10.5px] text-slate-500">
                            {fmtNum(item.unit_price)} € · IVA {item.tax_rate}%
                        </span>
                        <span className="text-[14px] font-black text-slate-900 tabular-nums">
                            {fmtEUR(lineTotal)}
                        </span>
                    </div>
                </div>
            </div>
        </li>
    );
}
