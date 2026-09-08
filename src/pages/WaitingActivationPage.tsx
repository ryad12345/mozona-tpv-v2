// =====================================================================
// MOZONA TPV — WaitingActivationPage (v1.9.75)
// =====================================================================
// Pantalla de espera profesional mientras el SuperAdmin valida el alta.
// Muestra tiempo restante de cortesia (24h) y canal de soporte.
// Polling cada 30s para detectar aprobacion automatica.
// =====================================================================

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { IconShield, IconLock, IconUser, IconCheck, IconArrowRight } from "../components/icons";

interface TenantStatus {
    status: "pending_activation" | "active_trial" | "active" | "expired" | "vip";
    grace_period_ends_at?: string;
    trial_ends_at?: string;
    business_name?: string;
    plan_selected?: string;
}

const SOPORTE_WHATSAPP = "34644165153";

function formatRemaining(ms: number): string {
    if (ms <= 0) return "00:00:00";
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function WaitingActivationPage() {
    const auth = useAuth();
    const navigate = useNavigate();
    const [status, setStatus] = useState<TenantStatus | null>(null);
    const [now, setNow] = useState(Date.now());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ★ Tick cada segundo para el contador
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    // ★ Polling del estado cada 30s
    const fetchStatus = useCallback(async () => {
        if (!auth.tenant?.id && !auth.user?.id) return;
        const tenantId = auth.tenant?.id;
        if (!tenantId) return;

        try {
            const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
            const supabaseKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
            if (!supabaseUrl || !supabaseKey) {
                setError("Supabase no configurado");
                setLoading(false);
                return;
            }
            const r = await fetch(
                `${supabaseUrl}/rest/v1/tenants?id=eq.${tenantId}&select=activation_status,grace_period_ends_at,trial_ends_at,business_name,plan_selected`,
                { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
            );
            if (!r.ok) {
                setError("Error al consultar estado");
                setLoading(false);
                return;
            }
            const arr = await r.json();
            if (arr && arr[0]) {
                const t = arr[0];
                const newStatus: TenantStatus = {
                    status: t.activation_status,
                    grace_period_ends_at: t.grace_period_ends_at,
                    trial_ends_at: t.trial_ends_at,
                    business_name: t.business_name,
                    plan_selected: t.plan_selected,
                };
                setStatus(newStatus);
                // ★ Si el SuperAdmin ya aprobó, redirigir al panel
                if (newStatus.status === "active_trial" || newStatus.status === "active" || newStatus.status === "vip") {
                    navigate("/app", { replace: true });
                }
            }
            setLoading(false);
        } catch (e) {
            setError(String(e));
            setLoading(false);
        }
    }, [auth.tenant?.id, auth.user?.id, navigate]);

    useEffect(() => {
        fetchStatus();
        const t = setInterval(fetchStatus, 30_000);
        // ★ Re-fetch al enfocar la pestaña
        const onFocus = () => fetchStatus();
        window.addEventListener("focus", onFocus);
        return () => {
            clearInterval(t);
            window.removeEventListener("focus", onFocus);
        };
    }, [fetchStatus]);

    // ★ Calcular tiempo restante
    const remainingMs = status?.grace_period_ends_at
        ? new Date(status.grace_period_ends_at).getTime() - now
        : 24 * 60 * 60 * 1000; // fallback 24h

    const whalink = `https://wa.me/${SOPORTE_WHATSAPP}?text=${encodeURIComponent(
        `Hola! Soy ${auth.user?.email ?? "cliente"}. Estoy en la sala de espera de MOZONA TPV. Mi restaurante: ${status?.business_name ?? "—"}`
    )}`;

    return (
        <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-blue-50 to-violet-50 flex items-center justify-center p-5">
            <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200/60 overflow-hidden">
                {/* Cabecera con animación */}
                <div className="relative h-44 bg-gradient-to-br from-blue-600 via-violet-600 to-blue-700 flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 opacity-20">
                        <div className="absolute top-4 left-4 w-2 h-2 rounded-full bg-white animate-ping" style={{ animationDelay: "0ms" }} />
                        <div className="absolute top-12 right-8 w-2 h-2 rounded-full bg-white animate-ping" style={{ animationDelay: "700ms" }} />
                        <div className="absolute bottom-8 left-12 w-2 h-2 rounded-full bg-white animate-ping" style={{ animationDelay: "1400ms" }} />
                    </div>
                    <div className="relative text-center text-white">
                        <div className="w-20 h-20 mx-auto rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-3 shadow-xl ring-1 ring-white/30">
                            <IconShield size={36} strokeWidth={2.2} className="animate-pulse" />
                        </div>
                        <h1 className="text-[20px] font-black tracking-tight">
                            Configurando tu espacio
                        </h1>
                        <p className="text-[12.5px] text-blue-100 mt-1">
                            Tu caja está casi lista
                        </p>
                    </div>
                </div>

                {/* Cuerpo */}
                <div className="p-6 sm:p-7 space-y-5">
                    {/* Estado actual */}
                    <div className="text-center">
                        <p className="text-[13px] text-slate-700 leading-relaxed">
                            {status?.business_name && (
                                <span className="font-bold text-slate-900">{status.business_name}</span>
                            )}{" "}
                            está siendo configurado por nuestro equipo.
                        </p>
                        <p className="text-[12.5px] text-slate-500 mt-1">
                            Tiempo estimado de activación: <span className="font-bold text-slate-700">menos de 24h</span>
                        </p>
                    </div>

                    {/* Contador en vivo */}
                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 shadow-lg">
                        <div className="flex items-center justify-center gap-2 text-blue-300 text-[11px] font-bold tracking-widest uppercase mb-2">
                            <IconLock size={14} strokeWidth={2.4} />
                            Cortesía activa
                        </div>
                        <div className="text-center font-mono text-[36px] sm:text-[42px] font-black text-white tabular-nums tracking-wider">
                            {formatRemaining(remainingMs)}
                        </div>
                        <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-1000"
                                style={{ width: `${Math.max(0, Math.min(100, (remainingMs / (24 * 60 * 60 * 1000)) * 100))}%` }}
                            />
                        </div>
                        <p className="text-center text-[10.5px] text-slate-400 mt-2">
                            {remainingMs > 0
                                ? "Tu espacio de cortesía está disponible 24h. Pasado este tiempo, requerirá aprobación."
                                : "Tu periodo de cortesía ha finalizado. Contacta con soporte."}
                        </p>
                    </div>

                    {/* Pasos del proceso */}
                    <div className="space-y-2.5">
                        <Step done label="Registro completado" />
                        <Step done label="24h de cortesía concedidas" />
                        <Step active label="Validación por el equipo" />
                        <Step label="Activación de 7 días de trial" />
                    </div>

                    {/* Botones de soporte */}
                    <div className="grid grid-cols-2 gap-2 pt-2">
                        <a
                            href={whalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[12.5px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition touch-manipulation shadow-md shadow-emerald-500/30"
                        >
                            💬 WhatsApp
                        </a>
                        <button
                            onClick={() => navigate("/auth")}
                            className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12.5px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition touch-manipulation"
                        >
                            🚪 Cerrar sesión
                        </button>
                    </div>

                    {/* Detalles técnicos (debug) */}
                    <details className="text-[10.5px] text-slate-500 border-t border-slate-200/60 pt-3">
                        <summary className="cursor-pointer font-semibold text-slate-600">
                            Detalles técnicos
                        </summary>
                        <div className="mt-2 space-y-1 font-mono">
                            <div>Tenant: {auth.tenant?.id ?? "—"}</div>
                            <div>User: {auth.user?.email ?? "—"}</div>
                            <div>Status: {status?.status ?? "loading…"}</div>
                            <div>Plan: {status?.plan_selected ?? "—"}</div>
                            {error && <div className="text-rose-600">Error: {error}</div>}
                        </div>
                    </details>
                </div>
            </div>
        </div>
    );
}

function Step({ done, active, label }: { done?: boolean; active?: boolean; label: string }) {
    return (
        <div className="flex items-center gap-3">
            <div
                className={
                    "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 " +
                    (done
                        ? "bg-emerald-500 text-white"
                        : active
                            ? "bg-blue-600 text-white ring-4 ring-blue-200 animate-pulse"
                            : "bg-slate-200 text-slate-500")
                }
            >
                {done ? "✓" : active ? "●" : "○"}
            </div>
            <span
                className={
                    "text-[12.5px] " +
                    (done
                        ? "text-slate-500 line-through"
                        : active
                            ? "text-slate-900 font-bold"
                            : "text-slate-500")
                }
            >
                {label}
            </span>
        </div>
    );
}

export default WaitingActivationPage;
