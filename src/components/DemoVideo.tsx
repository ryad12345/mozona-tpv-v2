// =====================================================================
// MOZONA TPV — DemoVideo
// =====================================================================
// Vídeo demostrativo que se reproduce automáticamente como un GIF:
//   • autoplay
//   • loop infinito
//   • muted (obligatorio en iOS Safari para autoplay)
//   • playsInline (iOS no abre fullscreen)
//   • preload="auto" para empezar a cargar de inmediato
//
// Para reemplazarlo: sube el archivo .mp4 a public/demo.mp4
// (recomendado: 1920×1080, H.264, 30-60 fps, < 8MB).
// =====================================================================

import { useState, useRef, useEffect } from "react";
import { cn } from "../lib/cn";

export interface DemoVideoProps {
    /** Ruta al vídeo (default: "/demo.mp4") */
    src?: string;
    /** Imagen poster mientras carga */
    poster?: string;
    /** Etiqueta de la esquina inferior derecha */
    badge?: string;
    className?: string;
}

export function DemoVideo({
    src = "/demo.mp4",
    poster = "/demo-poster.svg",
    badge = "TPV en acción",
    className,
}: DemoVideoProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [loaded, setLoaded]   = useState(false);
    const [error,  setError]    = useState(false);
    const [exists, setExists]   = useState<boolean | null>(null);

    // Detectar si el vídeo existe
    useEffect(() => {
        let cancelled = false;
        fetch(src, { method: "HEAD" }).then(r => {
            if (!cancelled) setExists(r.ok);
        }).catch(() => {
            if (!cancelled) setExists(false);
        });
        return () => { cancelled = true; };
    }, [src]);

    // Intentar reproducir cuando esté listo
    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        const onCanPlay = () => {
            v.play().catch(() => {
                // Si el navegador bloquea el autoplay, no hacer nada
            });
        };
        v.addEventListener("canplay", onCanPlay);
        return () => v.removeEventListener("canplay", onCanPlay);
    }, [exists]);

    if (exists === false) {
        return <DemoVideoFallback badge={badge} className={className} />;
    }

    return (
        <div className={cn(
            "relative rounded-3xl overflow-hidden border border-slate-200/80 shadow-2xl",
            "bg-gradient-to-br from-slate-900 to-slate-800",
            className,
        )}>
            {/* Badge flotante */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5
                            bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-full
                            border border-white/20">
                <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-[10px] font-bold text-white tracking-wider uppercase">
                    {badge}
                </span>
            </div>

            {/* Calidad 4K badge */}
            <div className="absolute top-3 right-3 z-10
                            bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-full
                            border border-white/20">
                <span className="text-[9.5px] font-bold text-white tracking-wider">
                    4K · 60fps
                </span>
            </div>

            <video
                ref={videoRef}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                poster={poster}
                onLoadedData={() => setLoaded(true)}
                onError={() => setError(true)}
                className={cn(
                    "w-full h-full object-cover transition-opacity duration-700",
                    loaded ? "opacity-100" : "opacity-0",
                )}
            >
                <source src={src} type="video/mp4" />
                <source src={src.replace(".mp4", ".webm")} type="video/webm" />
                Tu navegador no soporta el tag de vídeo.
            </video>

            {/* Spinner mientras carga */}
            {!loaded && !error && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40">
                    <div className="w-10 h-10 border-[3px] border-white/30 border-t-white rounded-full animate-spin" />
                </div>
            )}

            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-white text-sm">
                    No se pudo cargar el vídeo
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------
// Fallback cuando el vídeo no existe: mockup animado con CSS
// ---------------------------------------------------------------------

function DemoVideoFallback({ badge, className }: { badge: string; className?: string }) {
    return (
        <div className={cn(
            "relative rounded-3xl overflow-hidden border border-slate-200/80 shadow-2xl",
            "bg-gradient-to-br from-slate-50 to-white aspect-video",
            className,
        )}>
            {/* Badge flotante */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5
                            bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-full
                            border border-white/20">
                <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-[10px] font-bold text-white tracking-wider uppercase">
                    {badge}
                </span>
            </div>

            {/* Mockup del TPV animado */}
            <div className="absolute inset-0 p-6 flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-900 to-slate-700" />
                    <div className="text-[11px] font-black tracking-tight text-slate-900">
                        MOZONA TPV
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-bold text-emerald-700">ONLINE</span>
                    </div>
                </div>

                <div className="flex-1 grid grid-cols-2 gap-3">
                    {/* Columna izquierda: carta */}
                    <div className="bg-slate-100/60 rounded-xl p-2.5 space-y-1.5">
                        {[1,2,3,4].map(i => (
                            <div key={i} className="flex items-center gap-2 bg-white rounded-lg p-1.5 shadow-sm">
                                <div className="w-9 h-9 rounded-md bg-gradient-to-br from-amber-200 to-orange-300 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="h-1.5 bg-slate-300 rounded w-3/4 mb-1" />
                                    <div className="h-1 bg-slate-200 rounded w-1/2" />
                                </div>
                                <div className="text-[9px] font-black text-slate-900 tabular-nums">
                                    {(Math.random() * 10 + 5).toFixed(2)}€
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Columna derecha: comanda */}
                    <div className="bg-white rounded-xl p-2.5 border border-slate-200 flex flex-col">
                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Comanda
                        </div>
                        <div className="flex-1 space-y-1.5">
                            {[
                                { name: "Ensalada Rusa",  qty: 1, price: "9,00" },
                                { name: "Ensalada Mixta", qty: 2, price: "7,00" },
                                { name: "Coca Cola",      qty: 1, price: "1,50" },
                            ].map((it, i) => (
                                <div key={i} className="flex items-center justify-between text-[9px]">
                                    <span className="text-slate-900 font-semibold truncate">
                                        {it.qty}× {it.name}
                                    </span>
                                    <span className="font-black tabular-nums text-slate-900">
                                        {it.price}€
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between
                                        text-[11px] font-black text-slate-900">
                            <span>TOTAL</span>
                            <span className="tabular-nums">24,50€</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Texto de instrucciones */}
            <div className="absolute bottom-3 left-3 right-3 text-center">
                <p className="text-[10px] text-slate-500 italic">
                    Sube <code className="px-1 bg-slate-100 rounded text-slate-700">/public/demo.mp4</code> para ver el vídeo real aquí
                </p>
            </div>
        </div>
    );
}

export default DemoVideo;
