// =====================================================================
// MOZONA TPV — Logo component
// =====================================================================
// Logo oficial SVG inline para máxima nitidez y escalabilidad.
// Variantes:
//   - variant="full":   icono + texto MOZONA + TPV + nube
//   - variant="mark":   solo el icono (monitor + plato con check)
//   - variant="text":   solo el texto
//   - variant="square": cuadrado 1:1 (para favicon, avatares)
// =====================================================================

import { cn } from "../lib/cn";

export type LogoVariant = "full" | "mark" | "text" | "square";
export type LogoSize = "xs" | "sm" | "md" | "lg" | "xl";

interface LogoProps {
    variant?: LogoVariant;
    size?:    LogoSize;
    className?: string;
    /** Color principal de marca (azul oscuro por defecto) */
    brandColor?: string;
    /** Color de acento (verde por defecto) */
    accentColor?: string;
}

const SIZE_MAP: Record<LogoSize, { h: number; w: number; text: string }> = {
    xs: { h: 20,  w: 64,  text: "text-[10px]" },
    sm: { h: 28,  w: 90,  text: "text-[12px]" },
    md: { h: 36,  w: 120, text: "text-[14px]" },
    lg: { h: 48,  w: 160, text: "text-[18px]" },
    xl: { h: 64,  w: 220, text: "text-[22px]" },
};

export function Logo({
    variant = "full",
    size = "md",
    className,
    brandColor = "#0F2942",
    accentColor = "#10B981",
}: LogoProps) {
    const s = SIZE_MAP[size];

    if (variant === "square") {
        return (
            <div
                className={cn("inline-flex items-center justify-center rounded-2xl shadow-sm shrink-0",
                             className)}
                style={{
                    width:  s.h,
                    height: s.h,
                    background: `linear-gradient(135deg, ${brandColor}, ${brandColor}dd)`,
                }}
            >
                <svg viewBox="0 0 64 64" className="w-3/5 h-3/5">
                    <text x="32" y="46" textAnchor="middle"
                          fontSize="42" fontWeight="900"
                          fontFamily="system-ui, -apple-system, sans-serif"
                          fill="white">M</text>
                    <path d="M 20 22 L 28 30 L 44 14" fill="none"
                          stroke={accentColor} strokeWidth="5"
                          strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            </div>
        );
    }

    if (variant === "mark") {
        return (
            <svg viewBox="0 0 200 180" height={s.h} className={cn("inline-block", className)}>
                <defs>
                    <linearGradient id={`mg-${size}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={brandColor}/>
                        <stop offset="100%" stopColor={brandColor} stopOpacity="0.85"/>
                    </linearGradient>
                </defs>
                {/* Cloche */}
                <g transform="translate(125, 8)">
                    <path d="M 8 38 Q 8 4 38 4 Q 68 4 68 38 L 68 42 L 8 42 Z"
                          fill={accentColor} stroke={accentColor} strokeWidth="2"/>
                    <line x1="0" y1="44" x2="76" y2="44" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round"/>
                    <path d="M 26 22 L 36 30 L 52 14"
                          fill="none" stroke="white" strokeWidth="5"
                          strokeLinecap="round" strokeLinejoin="round"/>
                </g>
                {/* Monitor */}
                <rect x="0" y="22" width="128" height="100" rx="11"
                      fill={`url(#mg-${size})`} stroke={brandColor} strokeWidth="2.5"/>
                <rect x="11" y="33" width="106" height="76" rx="5" fill="white"/>
                <text x="64" y="98" textAnchor="middle"
                      fontSize="60" fontWeight="900"
                      fontFamily="system-ui, -apple-system, sans-serif"
                      fill={brandColor} letterSpacing="-3">M</text>
                <path d="M 58 60 L 64 66 L 73 55"
                      fill="none" stroke={accentColor} strokeWidth="4.5"
                      strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="15" y="115" width="98" height="11" rx="2"
                      fill={brandColor}/>
                <rect x="87" y="117.5" width="16" height="6" rx="1" fill={accentColor}/>
            </svg>
        );
    }

    if (variant === "text") {
        return (
            <div className={cn("inline-flex items-baseline gap-1.5", className)}>
                <span className="font-black tracking-tight"
                      style={{ color: brandColor, fontSize: `${s.h * 0.6}px` }}>
                    MOZONA
                </span>
                <span className="font-bold"
                      style={{ color: accentColor, fontSize: `${s.h * 0.45}px` }}>
                    TPV
                </span>
            </div>
        );
    }

    // variant === "full": icono + texto
    return (
        <div className={cn("inline-flex items-center gap-2.5", className)}>
            <Logo variant="mark" size={size} brandColor={brandColor} accentColor={accentColor}/>
            <div className="flex flex-col leading-none">
                <span className="font-black tracking-tight"
                      style={{ color: brandColor, fontSize: `${s.h * 0.55}px`, letterSpacing: "-0.04em" }}>
                    MOZONA
                </span>
                <div className="flex items-center gap-1 mt-0.5">
                    <span className="font-bold"
                          style={{ color: accentColor, fontSize: `${s.h * 0.32}px`, letterSpacing: "-0.02em" }}>
                        TPV
                    </span>
                    {/* Mini nube */}
                    <svg width={s.h * 0.28} height={s.h * 0.28} viewBox="0 0 24 24" fill="none">
                        <path d="M 4 14 Q 4 8 10 8 Q 12 2 20 2 Q 24 4 24 8 Q 24 14 20 14 L 10 14 Q 4 14 4 14 Z"
                              transform="translate(0 4)"
                              fill={accentColor} opacity="0.85"/>
                    </svg>
                </div>
            </div>
        </div>
    );
}

export default Logo;
