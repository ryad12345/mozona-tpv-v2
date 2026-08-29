// =====================================================================
// MOZONA TPV — DemoVideo (versión INSTANTÁNEA, sin spinner)
// =====================================================================
// El mockup animado del TPV aparece SIEMPRE en el primer frame.
// Si subes /demo.mp4, se superpone y reproduce en autoplay/loop.
// Sin esperas, sin spinners, sin "No se pudo cargar".
// =====================================================================

import { useState, useRef, useEffect } from "react";
import { cn } from "../lib/cn";

export interface DemoVideoProps {
    /** Ruta al vídeo (default: "/demo.mp4") */
    src?: string;
    /** Imagen poster mientras carga */
    poster?: string;
    /** Etiqueta de la esquina superior izquierda */
    badge?: string;
    className?: string;
}

export function DemoVideo({
    src = "/demo.mp4",
    poster = "/demo-poster.svg",
    badge = "TPV en vivo",
    className,
}: DemoVideoProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [videoOk, setVideoOk] = useState(false);
    const [autoplayOk, setAutoplayOk] = useState(false);

    // Intentar cargar y reproducir el vídeo. Si falla, el mockup sigue visible.
    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;

        const onCanPlay = () => {
            setVideoOk(true);
            v.play().then(() => setAutoplayOk(true)).catch(() => { /* ignored */ });
        };
        const onError = () => {
            setVideoOk(false);
        };

        v.addEventListener("canplay", onCanPlay);
        v.addEventListener("error", onError);

        // Forzar el intento de carga
        v.load();

        return () => {
            v.removeEventListener("canplay", onCanPlay);
            v.removeEventListener("error", onError);
        };
    }, [src]);

    return (
        <div className={cn(
            "relative rounded-3xl overflow-hidden border border-slate-200/80 shadow-2xl",
            "aspect-video bg-gradient-to-br from-slate-50 via-white to-blue-50/30",
            className,
        )}>
            {/* ============ MOCKUP ANIMADO (SIEMPRE VISIBLE) ============ */}
            <DemoVideoFallback badge={badge}/>

            {/* ============ VÍDEO REAL (superpuesto cuando carga) ============ */}
            {videoOk && (
                <video
                    ref={videoRef}
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="auto"
                    poster={poster}
                    onError={() => setVideoOk(false)}
                    className={cn(
                        "absolute inset-0 w-full h-full object-cover z-10",
                        "transition-opacity duration-500",
                        autoplayOk ? "opacity-100" : "opacity-90",
                    )}
                >
                    <source src={src} type="video/mp4" />
                    <source src={src.replace(".mp4", ".webm")} type="video/webm" />
                </video>
            )}

            {/* ============ BADGE "4K · 60fps" (solo si hay vídeo) ============ */}
            {videoOk && autoplayOk && (
                <div className="absolute top-4 right-4 z-20
                                bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-full
                                border border-slate-700 shadow-md">
                    <span className="text-[10.5px] font-black text-white tracking-wider">
                        4K · 60fps
                    </span>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------
// FALLBACK — Mockup animado del TPV (renderizado en el primer frame)
// ---------------------------------------------------------------------

function DemoVideoFallback({ badge }: { badge: string }) {
    return (
        <div className="absolute inset-0 p-6 sm:p-8 flex flex-col">
            {/* Badge "TPV en vivo" — pill en esquina superior izquierda */}
            <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5
                            bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full
                            border border-slate-200/60 shadow-sm">
                <div className="relative">
                    <div className="w-2 h-2 rounded-full bg-rose-500" />
                    <div className="absolute inset-0 w-2 h-2 rounded-full bg-rose-500 animate-ping opacity-75" />
                </div>
                <span className="text-[10.5px] font-black text-slate-800 tracking-wider uppercase">
                    {badge}
                </span>
            </div>

            {/* Badge "MOZONA TPV" en esquina superior derecha */}
            <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5
                            bg-slate-900/95 backdrop-blur-md px-3 py-1.5 rounded-full
                            border border-slate-700 shadow-md">
                <span className="text-[10.5px] font-black text-white tracking-wider">
                    MOZONA TPV
                </span>
            </div>

            {/* Top bar del TPV */}
            <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-900 to-slate-700
                                flex items-center justify-center text-white font-black text-[10px]">
                    M
                </div>
                <div className="text-[10px] font-black tracking-tight text-slate-900">
                    MOZONA TPV
                </div>
                <div className="ml-2 px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700
                                text-[8px] font-black tracking-wider">
                    PRO CLOUD
                </div>
                <div className="ml-auto flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[8.5px] font-bold text-emerald-700 tracking-wider">ONLINE</span>
                </div>
            </div>

            {/* Grid: mesas + catálogo + comanda */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3 min-h-0">
                {/* Mesas */}
                <div className="bg-slate-100/60 rounded-xl p-2.5 space-y-1.5 overflow-hidden">
                    <div className="text-[8.5px] font-black text-slate-500 uppercase tracking-wider mb-1">
                        Mesas (1-16)
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                        {Array.from({ length: 16 }).map((_, i) => {
                            const occupied = [2, 5, 7, 11].includes(i + 1);
                            return (
                                <div key={i}
                                     className={cn(
                                         "aspect-square rounded-md text-[8.5px] font-black",
                                         "flex items-center justify-center",
                                         occupied
                                             ? "bg-amber-200 text-amber-900 ring-1 ring-amber-400"
                                             : "bg-emerald-200/60 text-emerald-900"
                                     )}>
                                    {`B-${i + 1}`}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Catálogo */}
                <div className="bg-slate-100/60 rounded-xl p-2.5 overflow-hidden">
                    <div className="text-[8.5px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                        Carta
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                        {[
                            { name: "Ensalada Rusa",  price: "9,00", color: "from-amber-200 to-orange-300" },
                            { name: "Pulpo",          price: "6,00", color: "from-rose-200 to-pink-300" },
                            { name: "Ensalada Mixta", price: "7,00", color: "from-lime-200 to-green-300" },
                            { name: "Coca Cola",      price: "1,50", color: "from-red-200 to-red-400" },
                        ].map((p, i) => (
                            <div key={i}
                                 className="bg-white rounded-md overflow-hidden shadow-sm">
                                <div className={cn("h-8 bg-gradient-to-br", p.color)}/>
                                <div className="p-1.5">
                                    <div className="text-[8.5px] font-black text-slate-900 truncate">
                                        {p.name}
                                    </div>
                                    <div className="text-[8px] font-bold text-slate-500 tabular-nums">
                                        {p.price}€
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Comanda */}
                <div className="bg-white rounded-xl p-2.5 border border-slate-200 flex flex-col overflow-hidden">
                    <div className="text-[8.5px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                        Comanda · Mesa 2
                    </div>
                    <div className="flex-1 space-y-1 overflow-hidden">
                        {[
                            { name: "Ensalada Rusa",  qty: 1, price: "9,00" },
                            { name: "Ensalada Mixta", qty: 2, price: "7,00" },
                            { name: "Coca Cola",      qty: 1, price: "1,50" },
                            { name: "Café",           qty: 2, price: "1,20" },
                        ].map((it, i) => (
                            <div key={i}
                                 className="flex items-center justify-between text-[8.5px] py-0.5
                                            border-b border-slate-100">
                                <span className="text-slate-900 font-semibold truncate">
                                    {it.qty}× {it.name}
                                </span>
                                <span className="font-black tabular-nums text-slate-900">
                                    {it.price}€
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-2 pt-1.5 border-t-2 border-slate-200 flex justify-between
                                    text-[10.5px] font-black text-slate-900">
                        <span>TOTAL</span>
                        <span className="tabular-nums">26,90€</span>
                    </div>
                    <div className="mt-1.5 h-6 rounded-md bg-emerald-500 flex items-center
                                    justify-center text-white text-[9.5px] font-black tracking-wider
                                    shadow-sm shadow-emerald-500/30">
                        COBRAR
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DemoVideo;
