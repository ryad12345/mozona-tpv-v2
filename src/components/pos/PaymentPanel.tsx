// =====================================================================
// MOZONA TPV — PaymentPanel: columna derecha (numpad + acciones de cobro)
// =====================================================================

import { IconBackspace, IconCash, IconCard, IconQr } from "../icons";
import { fmtEUR, parseAmount } from "../../lib/format";
import { cn } from "../../lib/cn";
import type { PaymentMethod } from "../../lib/types";
import { useMemo, type ReactNode } from "react";

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

export interface PaymentPanelProps {
    /** Importe total del pedido (a pagar) */
    total:            number;
    /** Texto en pantalla del numpad (importe recibido) */
    paymentAmount:    string;
    /** Método seleccionado (null = sin selección) */
    paymentMethod:    PaymentMethod | null;
    /** Si hay un pedido en curso que se puede cobrar */
    canCharge:        boolean;
    /** Si está procesando el cobro */
    isProcessing:     boolean;
    onNumpadKey:      (key: string) => void;
    onSetMethod:      (m: PaymentMethod | null) => void;
    onCharge:         () => void;
    onChargeVeriFactu:() => void;
}

// ---------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------

export function PaymentPanel({
    total, paymentAmount, paymentMethod,
    canCharge, isProcessing,
    onNumpadKey, onSetMethod, onCharge, onChargeVeriFactu,
}: PaymentPanelProps) {

    const received = useMemo(
        () => parseAmount(paymentAmount || "0"),
        [paymentAmount]
    );
    const change = useMemo(
        () => Math.max(0, received - total),
        [received, total]
    );
    const showChange = paymentMethod === "CASH" && received > 0;

    return (
        <div className="h-full flex flex-col justify-between p-2 min-h-0">
            {/* Display digital compacto ------------------------------------- */}
            <section className="bg-slate-900 text-white rounded-xl p-1.5 mb-1 shadow-lg shrink-0">
                <div className="text-[9px] font-bold tracking-[0.2em] text-slate-400 uppercase mb-0.5">
                    Importe recibido
                </div>
                <div className="flex items-baseline gap-1">
                    <span className="text-xl font-black tabular-nums leading-none tracking-tight">
                        {paymentAmount || "0"}
                    </span>
                    <span className="text-sm font-bold text-slate-400 tabular-nums">€</span>
                </div>
                {showChange && (
                    <div className="mt-1 pt-1 border-t border-slate-700 flex items-baseline justify-between">
                        <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">
                            A devolver
                        </span>
                        <span className="text-sm font-black text-emerald-400 tabular-nums">
                            {fmtEUR(change)}
                        </span>
                    </div>
                )}
            </section>

            {/* Teclado numérico compacto ----------------------------------- */}
            <section className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-1 shrink-0 my-1">
                <div className="grid grid-cols-3 gap-1">
                    <NumKey onClick={() => onNumpadKey("7")}>7</NumKey>
                    <NumKey onClick={() => onNumpadKey("8")}>8</NumKey>
                    <NumKey onClick={() => onNumpadKey("9")}>9</NumKey>
                    <NumKey onClick={() => onNumpadKey("4")}>4</NumKey>
                    <NumKey onClick={() => onNumpadKey("5")}>5</NumKey>
                    <NumKey onClick={() => onNumpadKey("6")}>6</NumKey>
                    <NumKey onClick={() => onNumpadKey("1")}>1</NumKey>
                    <NumKey onClick={() => onNumpadKey("2")}>2</NumKey>
                    <NumKey onClick={() => onNumpadKey("3")}>3</NumKey>
                    <NumKey onClick={() => onNumpadKey("C")} tone="muted">C</NumKey>
                    <NumKey onClick={() => onNumpadKey("0")}>0</NumKey>
                    <NumKey onClick={() => onNumpadKey("⌫")} tone="muted">
                        <IconBackspace size={16} strokeWidth={2} />
                    </NumKey>
                </div>
            </section>

            {/* Botones de pago compactos ------------------------------------ */}
            <section className="flex-1 flex flex-col gap-1 shrink-0 min-h-0">
                <PaymentButton
                    onClick={() => { onSetMethod("CASH"); onCharge(); }}
                    disabled={!canCharge || isProcessing}
                    tone="emerald"
                    icon={<IconCash size={16} strokeWidth={1.8} />}
                    variant="standard"
                >
                    EFECTIVO
                </PaymentButton>
                <PaymentButton
                    onClick={() => { onSetMethod("CARD"); onCharge(); }}
                    disabled={!canCharge || isProcessing}
                    tone="blue"
                    icon={<IconCard size={16} strokeWidth={1.8} />}
                    variant="standard truncate"
                >
                    TARJETA / DATÁFONO
                </PaymentButton>
                <PaymentButton
                    onClick={() => { onSetMethod("CARD"); onChargeVeriFactu(); }}
                    disabled={!canCharge || isProcessing}
                    tone="violet"
                    icon={<IconQr size={18} strokeWidth={1.8} />}
                    variant="invoice"
                >
                    <div className="leading-tight text-left">
                        <div className="font-semibold tracking-wide">
                            FACTURA
                        </div>
                        <div className="text-[8px] font-semibold opacity-80 tracking-wider">
                            VERIFACTU
                        </div>
                    </div>
                </PaymentButton>
            </section>
        </div>
    );
}

// ---------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------

function NumKey({
    onClick, children, tone = "default",
}: { onClick: () => void; children: ReactNode; tone?: "default" | "muted" }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full h-8 rounded-lg border border-slate-200",
                "text-sm font-bold tabular-nums text-slate-800",
                "flex items-center justify-center shadow-sm",
                "transition-transform active:scale-95",
                tone === "muted"
                    ? "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    : "bg-slate-50 text-slate-900 hover:bg-slate-100"
            )}
        >
            {children}
        </button>
    );
}

type Tone = "emerald" | "blue" | "violet";

const TONE_CLASSES: Record<Tone, string> = {
    emerald: "bg-emerald-600 text-white shadow-emerald-600/30 hover:bg-emerald-700",
    blue:    "bg-blue-600 text-white shadow-blue-600/30 hover:bg-blue-700",
    violet:  "bg-violet-600 text-white shadow-violet-600/30 hover:bg-violet-700",
};

function PaymentButton({
    onClick, disabled, tone, icon, variant, children,
}: {
    onClick:    () => void;
    disabled:   boolean;
    tone:       Tone;
    icon:       ReactNode;
    variant:    "standard" | "standard truncate" | "invoice";
    children:   ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "w-full min-w-0 tracking-wide whitespace-nowrap",
                "flex items-center justify-center gap-2",
                "shadow-lg transition active:scale-[0.98]",
                "disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none",
                TONE_CLASSES[tone],
                variant === "invoice"
                    ? "h-7 px-1 text-[10px] font-semibold rounded-lg"
                    : "h-8 px-1.5 text-xs font-bold rounded-lg",
                variant === "standard truncate" && "truncate"
            )}
        >
            {icon}
            {children}
        </button>
    );
}
