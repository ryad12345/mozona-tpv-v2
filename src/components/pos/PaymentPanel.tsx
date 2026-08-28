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
        <div className="flex flex-col justify-between h-full w-full min-w-0 min-h-0">
            {/* Display digital ------------------------------------- */}
            <section className="bg-slate-900 text-white rounded-xl p-3 shadow-lg shrink-0">
                <div className="text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase mb-1">
                    Importe recibido
                </div>
                <div className="flex items-baseline gap-1.5">
                    <span className="text-[42px] font-black tabular-nums leading-none tracking-tight">
                        {paymentAmount || "0"}
                    </span>
                    <span className="text-[18px] font-bold text-slate-400 tabular-nums">€</span>
                </div>
                {showChange && (
                    <div className="mt-2 pt-2 border-t border-slate-700 flex items-baseline justify-between">
                        <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                            A devolver
                        </span>
                        <span className="text-[20px] font-black text-emerald-400 tabular-nums">
                            {fmtEUR(change)}
                        </span>
                    </div>
                )}
            </section>

            {/* Teclado numérico ----------------------------------- */}
            <section className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-2 shrink-0 my-2">
                <div className="grid grid-cols-3 gap-1.5">
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
                        <IconBackspace size={18} strokeWidth={2} />
                    </NumKey>
                </div>
            </section>

            {/* Botones de pago ------------------------------------ */}
            <section className="flex-1 flex flex-col gap-1.5 shrink-0 min-h-0">
                <PaymentButton
                    onClick={() => { onSetMethod("CASH"); onCharge(); }}
                    disabled={!canCharge || isProcessing}
                    tone="emerald"
                    icon={<IconCash size={20} strokeWidth={1.8} />}
                    variant="standard"
                >
                    EFECTIVO
                </PaymentButton>
                <PaymentButton
                    onClick={() => { onSetMethod("CARD"); onCharge(); }}
                    disabled={!canCharge || isProcessing}
                    tone="blue"
                    icon={<IconCard size={20} strokeWidth={1.8} />}
                    variant="standard truncate"
                >
                    TARJETA / DATÁFONO
                </PaymentButton>
                <PaymentButton
                    onClick={() => { onSetMethod("CARD"); onChargeVeriFactu(); }}
                    disabled={!canCharge || isProcessing}
                    tone="violet"
                    icon={<IconQr size={22} strokeWidth={1.8} />}
                    variant="invoice"
                >
                    <div className="leading-tight text-left">
                        <div className="font-semibold tracking-wide">
                            EMITIR FACTURA
                        </div>
                        <div className="text-[9px] font-semibold opacity-80 tracking-wider">
                            VERIFACTU + QR
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
                "w-full h-11 rounded-lg border border-slate-200",
                "text-base font-bold tabular-nums text-slate-800",
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
                "flex items-center justify-center gap-2.5",
                "shadow-lg transition active:scale-[0.98]",
                "disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none",
                TONE_CLASSES[tone],
                variant === "invoice"
                    ? "h-9 px-2 text-[11px] font-semibold rounded-lg"
                    : "h-10 px-2 text-xs sm:text-sm font-bold rounded-lg",
                variant === "standard truncate" && "truncate"
            )}
        >
            {icon}
            {children}
        </button>
    );
}
