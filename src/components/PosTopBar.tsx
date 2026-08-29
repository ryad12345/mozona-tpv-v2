// =====================================================================
// MOZONA TPV — PosTopBar: barra superior del terminal
// =====================================================================

import type { Restaurant, ConnectionStatus } from "../lib/types";
import {
    IconStore, IconShield, IconUsb, IconWifi, IconSettings,
    IconUser, IconBell, IconLock, IconPrint, IconQr,
} from "./icons";
import { cn } from "../lib/cn";

// ---------------------------------------------------------------------
// Tipos del componente
// ---------------------------------------------------------------------

export interface PosTopBarProps {
    restaurant: Restaurant | null;
    connection: ConnectionStatus;
    /** "192.168.1.42:7421" — opcional, si está bindeando LAN server */
    lanEndpoint?: string;
    /** "192.168.1.42" — IP local detectada */
    localIp?:     string | null;
    /** Versión de la build, sale en el badge PRO */
    version?: string;
    /** Cajero activo (en real sale de auth) */
    cashier?: { name: string; role: string; avatar?: string };
    onOpenSettings?:  () => void;
    onOpenCustomerDisplay?: () => void;
    onOpenMenuScanner?:    () => void;
    onShowQR?:            () => void;
    onLogout?:            () => void;
    pendingAlerts?: number;
}

// ---------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------

export function PosTopBar({
    restaurant, connection, lanEndpoint, localIp, version = "0.1.0",
    cashier = { name: "Cajero 01", role: "Camarero" },
    onOpenSettings, onOpenCustomerDisplay, onOpenMenuScanner, onShowQR, onLogout,
    pendingAlerts = 0,
}: PosTopBarProps) {
    const initial = restaurant?.business_name?.[0] ?? "M";
    const shortName =
        restaurant?.business_name?.split(/\s+/).slice(0, 2).join(" ") ?? "MOZONA TPV";

    return (
        <header
            className="
                sticky top-0 z-30
                h-14 shrink-0
                flex items-center justify-between gap-2 sm:gap-3
                overflow-hidden
                px-4
                bg-white/85 backdrop-blur-xl
                border-b border-slate-200/80
                shadow-[0_1px_0_rgba(15,23,42,0.04)]
            "
        >
            {/* LOGO + Nombre ============================================ */}
            <div className="flex items-center gap-2 sm:gap-3 sm:pr-4 sm:border-r sm:border-slate-200/80 sm:h-10 shrink-0">
                <div
                    className="
                        w-9 h-9 sm:w-10 sm:h-10 rounded-2xl
                        bg-gradient-to-br from-blue-600 to-blue-700
                        flex items-center justify-center
                        text-white font-black text-base sm:text-lg
                        shadow-sm shadow-blue-600/20
                    "
                >
                    {initial}
                </div>
                <div className="leading-tight min-w-0">
                    <div className="text-[14px] sm:text-[15px] font-bold tracking-tight text-slate-900 truncate">
                        {shortName}
                    </div>
                    <div className="hidden sm:flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold tracking-wider text-slate-500">
                            MOZONA
                        </span>
                        <span
                            className="
                                inline-flex items-center gap-1
                                px-1.5 py-0.5 rounded-md
                                bg-violet-600 text-white
                                text-[9px] font-black tracking-wider
                                shadow-sm shadow-violet-600/30
                            "
                        >
                            <IconShield size={9} strokeWidth={2.4} />
                            PRO CLOUD
                        </span>
                        <span className="text-[9px] font-medium text-slate-400">
                            v{version}
                        </span>
                    </div>
                </div>
            </div>

            {/* Indicadores de estado (sm+) ============================== */}
            <div className="hidden sm:flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto no-scrollbar">
                <StatusPill
                    icon={<IconWifi size={14} strokeWidth={2} />}
                    label="Online"
                    tone="ok"
                />
                <button
                    onClick={onShowQR}
                    title="QR para camareros"
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 py-1 rounded-full
                               bg-blue-50 text-blue-700 border border-blue-200/80
                               text-xs font-semibold whitespace-nowrap shrink-0
                               hover:bg-blue-100 active:scale-95 transition">
                    <IconQr size={12} strokeWidth={2.2} />
                    <span className="hidden md:inline">QR Camareros</span>
                </button>
                <StatusPill
                    icon={<IconShield size={14} strokeWidth={2} />}
                    label="VeriFactu"
                    tone="violet"
                    pulse
                />
                <StatusPill
                    icon={<IconUsb size={14} strokeWidth={2} />}
                    label={connection.printer ? "Impresora USB" : "Sin impresora"}
                    tone={connection.printer ? "ok" : "danger"}
                />
                <StatusPill
                    icon={<IconLock size={12} strokeWidth={2.2} />}
                    label="AES-256"
                    tone="muted"
                />
            </div>

            {/* Indicador compacto (<sm) sólo LAN/USB ==================== */}
            <div className="flex sm:hidden items-center gap-1.5 flex-1 min-w-0">
                <StatusPill
                    icon={<IconWifi size={12} strokeWidth={2.2} />}
                    label={connection.network ? "Online" : "Offline"}
                    tone={connection.network ? "ok" : "danger"}
                />
                <StatusPill
                    icon={<IconShield size={12} strokeWidth={2.2} />}
                    label="VF"
                    tone="violet"
                    pulse
                />
            </div>

            {/* Acciones rápidas ======================================== */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                <IconButton
                    onClick={onOpenMenuScanner}
                    title="Digitalizar carta con IA"
                    className="hidden sm:inline-flex"
                >
                    <IconPrint size={18} strokeWidth={1.8} />
                </IconButton>
                <IconButton
                    onClick={onOpenCustomerDisplay}
                    title="Pantalla cliente"
                    className="hidden sm:inline-flex"
                >
                    <IconStore size={18} strokeWidth={1.8} />
                </IconButton>
                <IconButton
                    title={`${pendingAlerts} alertas`}
                    badge={pendingAlerts > 0 ? pendingAlerts : undefined}
                    className="hidden sm:inline-flex"
                >
                    <IconBell size={18} strokeWidth={1.8} />
                </IconButton>
                <IconButton onClick={onOpenSettings} title="Ajustes">
                    <IconSettings size={18} strokeWidth={1.8} />
                </IconButton>
                {onLogout && (
                    <IconButton onClick={onLogout} title="Cerrar sesión">
                        <IconUser size={18} strokeWidth={1.8} />
                    </IconButton>
                )}
            </div>

            {/* Perfil del cajero (sm+) ================================== */}
            <div className="
                hidden sm:flex items-center gap-2.5
                pl-3 ml-1 border-l border-slate-200/80 h-10
                shrink-0
            ">
                <div className="text-right leading-tight max-w-[7rem]">
                    <div className="text-[13px] font-semibold text-slate-900 truncate">
                        {cashier.name}
                    </div>
                    <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                        {cashier.role}
                    </div>
                </div>
                <div
                    className="
                        w-9 h-9 rounded-full
                        bg-gradient-to-br from-slate-200 to-slate-300
                        flex items-center justify-center
                        text-slate-700
                        ring-2 ring-white shadow-sm
                    "
                >
                    <IconUser size={18} strokeWidth={1.8} />
                </div>
            </div>
        </header>
    );
}

// ---------------------------------------------------------------------
// Subcomponentes privados
// ---------------------------------------------------------------------

type Tone = "ok" | "violet" | "danger" | "muted" | "warning";

const toneStyles: Record<Tone, string> = {
    ok:      "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    violet:  "bg-violet-50 text-violet-700 border-violet-200/80",
    danger:  "bg-rose-50 text-rose-700 border-rose-200/80",
    warning: "bg-amber-50 text-amber-700 border-amber-200/80",
    muted:   "bg-slate-50 text-slate-500 border-slate-200/80",
};

function StatusPill({
    icon, label, tone = "muted", pulse = false,
}: { icon: React.ReactNode; label: string; tone?: Tone; pulse?: boolean }) {
    return (
        <div
            className={cn(
                "inline-flex items-center gap-1.5",
                "px-2.5 py-1 rounded-full",
                "text-xs font-semibold whitespace-nowrap shrink-0",
                "border",
                toneStyles[tone]
            )}
        >
            {pulse && (
                <span className="relative flex h-2 w-2">
                    <span className="
                        absolute inline-flex h-full w-full
                        rounded-full bg-violet-400 opacity-75
                        animate-ping
                    " />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-600" />
                </span>
            )}
            {icon}
            <span className="whitespace-nowrap">{label}</span>
        </div>
    );
}

function IconButton({
    children, onClick, title, badge, className,
}: {
    children: React.ReactNode;
    onClick?: () => void;
    title: string;
    badge?: number;
    className?: string;
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={cn(
                "relative w-9 h-9 rounded-xl",
                "flex items-center justify-center",
                "text-slate-600",
                "hover:bg-slate-100 hover:text-slate-900",
                "active:scale-95 active:bg-slate-200/70",
                "transition",
                className,
            )}
        >
            {children}
            {badge !== undefined && (
                <span
                    className="
                        absolute -top-0.5 -right-0.5
                        min-w-[16px] h-4 px-1
                        rounded-full
                        bg-rose-500 text-white
                        text-[9px] font-bold
                        flex items-center justify-center
                        ring-2 ring-white
                    "
                >
                    {badge}
                </span>
            )}
        </button>
    );
}
