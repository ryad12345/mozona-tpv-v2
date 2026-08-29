// =====================================================================
// MOZONA TPV — HeroMockup
// =====================================================================
// Recrea el mockup del TPV de la landing con HTML/CSS.  Es una vista
// "tipo screenshot" del producto real con datos demo:
//   - Cabecera con branding
//   - Grid 16 mesas con colores realistas
//   - Catálogo con productos
//   - Comanda con líneas + total
//   - Botón COBRAR prominente
//
// Sin iframes, sin imágenes externas, sin esperas: se ve al instante.
// =====================================================================

import { cn } from "../lib/cn";

const MESAS = [
    { id: 1,  label: "B-1",  estado: "libre" },
    { id: 2,  label: "B-2",  estado: "ocupada" },
    { id: 3,  label: "B-3",  estado: "libre" },
    { id: 4,  label: "B-4",  estado: "libre" },
    { id: 5,  label: "B-5",  estado: "cuenta" },
    { id: 6,  label: "B-6",  estado: "libre" },
    { id: 7,  label: "B-7",  estado: "ocupada" },
    { id: 8,  label: "B-8",  estado: "libre" },
    { id: 9,  label: "S-1",  estado: "libre" },
    { id: 10, label: "S-2",  estado: "libre" },
    { id: 11, label: "S-3",  estado: "ocupada" },
    { id: 12, label: "S-4",  estado: "libre" },
    { id: 13, label: "S-5",  estado: "libre" },
    { id: 14, label: "S-6",  estado: "cuenta" },
    { id: 15, label: "S-7",  estado: "libre" },
    { id: 16, label: "S-8",  estado: "libre" },
] as const;

const PRODUCTOS = [
    { name: "Ensalada Rusa",  price: "9,00", color: "from-amber-200 to-orange-300" },
    { name: "Ensalada Mixta", price: "7,00", color: "from-lime-200 to-green-300" },
    { name: "Pulpo",          price: "6,00", color: "from-rose-200 to-pink-300" },
    { name: "Coca Cola",      price: "1,50", color: "from-red-200 to-red-400" },
] as const;

const COMANDA = [
    { qty: 1, name: "Ensalada Rusa",  price: "9,00" },
    { qty: 2, name: "Ensalada Mixta", price: "7,00" },
    { qty: 1, name: "Coca Cola",      price: "1,50" },
];

export interface HeroMockupProps {
    className?: string;
}

export function HeroMockup({ className }: HeroMockupProps) {
    return (
        <div className={cn(
            "relative rounded-3xl overflow-hidden border border-slate-200/80 shadow-2xl",
            "bg-gradient-to-br from-slate-900 to-slate-800",
            "aspect-[16/10]",
            className,
        )}>
            {/* ============ FRAME / DEVICE ============ */}
            <div className="absolute inset-0 p-3 sm:p-4 flex flex-col">

                {/* Top bar del navegador / monitor */}
                <div className="flex items-center gap-1.5 mb-2 px-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <div className="ml-2 flex-1 h-5 rounded-md bg-slate-700/60
                                    flex items-center justify-center">
                        <span className="text-[9px] text-slate-400 font-mono">
                            mozonatpv.vercel.app/app
                        </span>
                    </div>
                </div>

                {/* ============ TPV INTERIOR ============ */}
                <div className="flex-1 bg-white rounded-xl overflow-hidden flex flex-col">

                    {/* Cabecera TPV */}
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200
                                    bg-white">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-900 to-slate-700
                                        flex items-center justify-center text-white font-black text-[10px] shrink-0">
                            M
                        </div>
                        <div className="text-[10px] sm:text-[11px] font-black tracking-tight text-slate-900 truncate">
                            MOZONA TPV
                        </div>
                        <div className="hidden sm:inline-block ml-1.5 px-1.5 py-0.5 rounded-full
                                        bg-violet-100 text-violet-700 text-[8px] font-black tracking-wider">
                            PRO CLOUD
                        </div>
                        <div className="ml-auto flex items-center gap-1 shrink-0">
                            <div className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700
                                            text-[8px] font-black tracking-wider flex items-center gap-1">
                                <div className="w-1 h-1 rounded-full bg-emerald-500" />
                                ONLINE
                            </div>
                        </div>
                    </div>

                    {/* Grid principal: mesas + carta + comanda */}
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-2 p-2 sm:p-2.5 min-h-0 bg-slate-50/50">

                        {/* ===== MESAS ===== */}
                        <div className="bg-white rounded-lg p-1.5 sm:p-2 border border-slate-200 overflow-hidden">
                            <div className="text-[8px] sm:text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1 px-0.5">
                                Mesas (1-16)
                            </div>
                            <div className="grid grid-cols-4 gap-1">
                                {MESAS.map(m => {
                                    const cls = m.estado === "ocupada"
                                        ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300"
                                        : m.estado === "cuenta"
                                            ? "bg-blue-100 text-blue-900 ring-1 ring-blue-300"
                                            : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100";
                                    return (
                                        <div key={m.id}
                                             className={cn(
                                                 "aspect-square rounded text-[8px] sm:text-[9px] font-black",
                                                 "flex items-center justify-center transition-colors",
                                                 cls,
                                             )}>
                                            {m.label}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ===== CARTA ===== */}
                        <div className="bg-white rounded-lg p-1.5 sm:p-2 border border-slate-200 overflow-hidden">
                            <div className="flex items-center gap-1 mb-1.5">
                                <div className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[8px] font-black">
                                    TODO
                                </div>
                                <div className="text-[7.5px] text-slate-400 truncate">
                                    Ensaladas · Carnes · Pescados · Pasta
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                                {PRODUCTOS.map((p, i) => (
                                    <div key={i}
                                         className="bg-slate-50 rounded overflow-hidden border border-slate-200/60">
                                        <div className={cn("h-7 sm:h-10 bg-gradient-to-br", p.color)}/>
                                        <div className="p-1">
                                            <div className="text-[7.5px] sm:text-[8.5px] font-black text-slate-900 truncate">
                                                {p.name}
                                            </div>
                                            <div className="text-[7px] sm:text-[8px] font-bold text-slate-500 tabular-nums">
                                                {p.price}€
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ===== COMANDA ===== */}
                        <div className="bg-white rounded-lg p-1.5 sm:p-2 border border-slate-200 flex flex-col overflow-hidden">
                            <div className="flex items-center justify-between mb-1">
                                <div className="text-[8px] sm:text-[9px] font-black text-slate-900">
                                    Comanda · Mesa 2
                                </div>
                                <div className="text-[7.5px] text-rose-600 font-bold">Vaciar</div>
                            </div>
                            <div className="flex-1 space-y-0.5 overflow-hidden">
                                {COMANDA.map((it, i) => (
                                    <div key={i}
                                         className="flex items-center justify-between text-[8px] sm:text-[9px] py-0.5
                                                    border-b border-slate-100">
                                        <span className="text-slate-900 font-semibold truncate">
                                            {it.qty}× {it.name}
                                        </span>
                                        <span className="font-black tabular-nums text-slate-900 shrink-0 ml-1">
                                            {it.price}€
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-1 pt-1 border-t border-slate-200 space-y-0.5">
                                <div className="flex justify-between text-[7.5px] text-slate-500">
                                    <span>Subtotal</span><span className="tabular-nums">23,00€</span>
                                </div>
                                <div className="flex justify-between text-[7.5px] text-slate-500">
                                    <span>IVA 10%</span><span className="tabular-nums">2,30€</span>
                                </div>
                                <div className="flex justify-between text-[10px] sm:text-[11px] font-black text-slate-900 pt-0.5">
                                    <span>TOTAL</span><span className="tabular-nums">25,30€</span>
                                </div>
                            </div>
                            <div className="mt-1 h-5 sm:h-6 rounded bg-emerald-500 flex items-center
                                            justify-center text-white text-[8.5px] sm:text-[10px] font-black tracking-wider
                                            shadow-sm shadow-emerald-500/30">
                                COBRAR
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ============ BADGES SUPERPUESTOS ============ */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5
                            bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-full
                            border border-slate-200/60 shadow-sm pointer-events-none">
                <div className="relative">
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    <div className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping opacity-75" />
                </div>
                <span className="text-[9px] sm:text-[10px] font-black text-slate-800 tracking-wider uppercase">
                    TPV en vivo
                </span>
            </div>
        </div>
    );
}

export default HeroMockup;
