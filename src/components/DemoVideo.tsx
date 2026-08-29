// =====================================================================
// MOZONA TPV — HeroImage
// =====================================================================
// Imagen estática en el hero.  Para reemplazar:
//   1. Sube tu imagen a:  public/demo-hero.jpg  (o .png / .webp)
//   2. Listo, se muestra automáticamente.
// =====================================================================

import { cn } from "../lib/cn";

export interface DemoVideoProps {
    src?: string;
    poster?: string;
    badge?: string;
    className?: string;
}

export function DemoVideo({
    src = "/demo-hero.jpg",
    badge,
    className,
}: DemoVideoProps) {
    return (
        <div className={cn(
            "relative rounded-3xl overflow-hidden border border-slate-200/80 shadow-2xl",
            "bg-slate-100",
            className,
        )}>
            <img
                src={src}
                alt="MOZONA TPV — Sistema de punto de venta"
                className="w-full h-auto block"
                loading="eager"
                decoding="async"
                onError={(e) => {
                    // Si la imagen no existe, mostrar el placeholder
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                    const fallback = (e.currentTarget as HTMLImageElement)
                        .nextElementSibling as HTMLElement | null;
                    if (fallback) fallback.style.display = "flex";
                }}
            />
            {/* Placeholder fallback si la imagen no existe */}
            <div
                className="hidden absolute inset-0 flex-col items-center justify-center
                           bg-gradient-to-br from-slate-50 to-blue-50/30 p-8 text-center"
            >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700
                                text-white flex items-center justify-center mb-3 shadow-lg
                                shadow-blue-600/30">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                         strokeLinejoin="round">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                        <line x1="8" y1="21" x2="16" y2="21"/>
                        <line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                </div>
                <p className="text-[13px] font-black text-slate-700 mb-1">
                    Sube tu imagen aquí
                </p>
                <p className="text-[11px] text-slate-500 max-w-xs">
                    Coloca el archivo <code className="px-1 bg-slate-200/80 rounded text-slate-700">public/demo-hero.jpg</code>
                </p>
            </div>

            {badge && (
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
            )}
        </div>
    );
}

export default DemoVideo;
