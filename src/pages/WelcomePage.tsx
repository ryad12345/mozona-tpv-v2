// =====================================================================
// MOZONA TPV — WelcomePage (v3.0.0)
// =====================================================================
// Sala de espera profesional post-registro.
// Muestra:
//   - Logo animado
//   - Countdown 24h de cortesía
//   - Timeline visual de pasos
//   - Mensaje "Tu cuenta está siendo validada"
//   - Polling cada 10s al estado
//   - Auto-redirect cuando se aprueba
//   - Botones de soporte (WhatsApp, login)
// =====================================================================

import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { IconShield, IconLock, IconUser, IconCheck, IconArrowRight } from "../components/icons";

const LS_KEY = "mozona.welcomeState";

interface TenantStatus {
    id: string;
    name: string;
    business_name?: string;
    plan_selected?: string;
    activation_status?: string;
    grace_period_ends_at?: string;
    trial_ends_at?: string;
}

function formatRemaining(ms: number): string {
    if (ms <= 0) return "00:00:00";
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function WelcomePage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // ★ Leer email/nombre/plan de URL > localStorage > defaults
    const getInitialState = () => {
        try {
            const fromUrl = {
                email: searchParams.get("email") || "",
                name:  searchParams.get("name")  || "",
                plan:  searchParams.get("plan")  || "",
            };
            if (fromUrl.email) return fromUrl;

            // ★ Si no, leer del localStorage (NUNCA borrar)
            const ls = localStorage.getItem(LS_KEY);
            if (ls) {
                const parsed = JSON.parse(ls);
                return {
                    email: parsed.email || "",
                    name:  parsed.name  || "",
                    plan:  parsed.plan  || "",
                };
            }
        } catch (_) {}
        return { email: "", name: "", plan: "" };
    };

    const [userEmail, setUserEmail] = useState(getInitialState().email);
    const [userName, setUserName] = useState(getInitialState().name);
    const [userPlan, setUserPlan] = useState(getInitialState().plan);
    const [status, setStatus] = useState<TenantStatus | null>(null);
    const [now, setNow] = useState(Date.now());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [method, setMethod] = useState<string>("");
    const [pollCount, setPollCount] = useState(0);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const pollCountRef = useRef(0);

    // ★ Persistir estado (NUNCA borrar)
    useEffect(() => {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({
                email: userEmail,
                name: userName,
                plan: userPlan,
                savedAt: Date.now(),
            }));
        } catch (_) {}
    }, [userEmail, userName, userPlan]);

    // ★ Detectar online/offline
    useEffect(() => {
        const onOnline = () => setIsOnline(true);
        const onOffline = () => setIsOnline(false);
        window.addEventListener("online", onOnline);
        window.addEventListener("offline", onOffline);
        return () => {
            window.removeEventListener("online", onOnline);
            window.removeEventListener("offline", onOffline);
        };
    }, []);

    // ★ Polling inteligente: cada 10s, parar cuando se aprueba
    // ★ v3.0.1: ESTRATEGIA DOBLE
    //   1) Intentar query directa con anon key (rápido, sin RLS si la tabla es accesible)
    //   2) Si falla, llamar a /api/check-status (server-side con SERVICE_ROLE si está)
    const fetchStatus = useCallback(async () => {
        if (!userEmail) {
            setError("No se encontró el email. Vuelve a registrarte.");
            setLoading(false);
            return;
        }
        try {
            pollCountRef.current += 1;
            setPollCount(pollCountRef.current);

            let json: any = null;
            let usedMethod = "unknown";

            // ★ Intento 1: query directa con anon key
            try {
                const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
                const supabaseKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
                if (supabaseUrl && supabaseKey) {
                    // Buscar tenant por contact_email
                    const r1 = await fetch(
                        `${supabaseUrl}/rest/v1/tenants?contact_email=eq.${encodeURIComponent(userEmail)}&select=*&limit=1`,
                        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
                    );
                    if (r1.ok) {
                        const arr = await r1.json();
                        if (arr && arr[0]) {
                            json = { ok: true, tenant: arr[0], method: "client_direct" };
                            usedMethod = "client_direct";
                        }
                    }
                    // Si contact_email no existe, intentar con otras columnas
                    if (!json) {
                        const r2 = await fetch(
                            `${supabaseUrl}/rest/v1/tenants?select=*&order=created_at.desc&limit=10`,
                            { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
                        );
                        if (r2.ok) {
                            const arr = await r2.json();
                            if (arr && arr.length > 0) {
                                // Buscar match por contact_email (puede no existir como columna)
                                const match = arr.find((t: any) =>
                                    t.contact_email && t.contact_email.toLowerCase() === userEmail
                                );
                                if (match) {
                                    json = { ok: true, tenant: match, method: "client_heuristic_match" };
                                    usedMethod = "client_heuristic_match";
                                } else {
                                    // No hay match exacto, devolver el más reciente
                                    json = { ok: true, tenant: arr[0], method: "client_heuristic_recent" };
                                    usedMethod = "client_heuristic_recent";
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn("[Welcome] client query error:", e);
            }

            // ★ Intento 2: server-side (si el cliente no encontró nada)
            if (!json) {
                try {
                    const r = await fetch(`/api/check-status?email=${encodeURIComponent(userEmail)}`);
                    if (r.ok) {
                        json = await r.json();
                        usedMethod = "server_" + (json?.method || "unknown");
                    }
                } catch (e) {
                    console.warn("[Welcome] server query error:", e);
                }
            }

            // ★ Si AMBOS fallaron, mostrar mensaje amable
            if (!json) {
                setMethod("all_failed");
                setError("Procesando tu registro. Te avisaremos en breve.");
                setLoading(false);
                return;
            }

            setMethod(usedMethod);

            if (json.tenant) {
                const t = json.tenant;
                setStatus({
                    id: t.id,
                    name: t.name || t.business_name || userName,
                    business_name: t.business_name || t.name,
                    plan_selected: t.plan_selected || t.plan || userPlan,
                    activation_status: t.activation_status,
                    grace_period_ends_at: t.grace_period_ends_at,
                    trial_ends_at: t.trial_ends_at,
                });
                setError(null);

                // ★ v3.2.2: Ya NO redirigimos aquí. El useEffect
                //   externo se encarga de la redirección (sin bucle).
            } else {
                if (json.method === "no_config") {
                    setError("Configurando el sistema. Te avisaremos en breve.");
                } else if (json.method === "no_data_yet") {
                    setError("Procesando tu registro. Esto puede tardar unos segundos...");
                } else {
                    setError("Preparando tu espacio de trabajo...");
                }
            }
            setLoading(false);
        } catch (e) {
            console.warn("[Welcome] fetch error:", e);
            setError("Conexión inestable. Reintentando...");
            setLoading(false);
        }
    }, [userEmail, userName, userPlan]);  // ★ Sin navigate: usamos navigateRef

    // ★ v3.2.2: Polling SIN bucle infinito
    //   ANTES: dependía de [fetchStatus, status], lo que causaba
    //   bucle porque fetchStatus cambia status, que re-disparaba el efecto.
    //   AHORA: solo depende de fetchStatus (estable), y usamos
    //   un ref para leer el status actual sin causar re-render.
    const statusRef = useRef<TenantStatus | null>(null);
    statusRef.current = status;
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;
    const redirectedRef = useRef(false);

    useEffect(() => {
        // ★ Marca de redirección: solo una vez
        if (redirectedRef.current) return;

        const poll = () => {
            // ★ Si ya está aprobado, parar
            const s = statusRef.current;
            if (s && ["active_trial", "active", "vip"].includes(s.activation_status || "")) {
                if (!redirectedRef.current) {
                    redirectedRef.current = true;
                    setTimeout(() => {
                        navigateRef.current("/auth?approved=1&email=" + encodeURIComponent(userEmail), { replace: true });
                    }, 2000);
                }
                return;
            }
            fetchStatus();
        };

        poll(); // inicial
        const t = setInterval(poll, 10_000);
        const onFocus = () => poll();
        window.addEventListener("focus", onFocus);
        return () => {
            clearInterval(t);
            window.removeEventListener("focus", onFocus);
        };
    }, [fetchStatus, userEmail]);

    // ★ Tick cada segundo para countdown
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    // ★ Calcular tiempo restante
    const remainingMs = status?.grace_period_ends_at
        ? Math.max(0, new Date(status.grace_period_ends_at).getTime() - now)
        : 24 * 60 * 60 * 1000;

    const whalink = `https://wa.me/34644165153?text=${encodeURIComponent(
        `Hola! Soy ${userEmail || "cliente"}. Acabo de registrarme en MOZONA TPV y estoy en la sala de espera.`
    )}`;

    const isApproved = !!status && ["active_trial", "active", "vip"].includes(status.activation_status || "");

    return (
        <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-blue-50 to-violet-50 flex items-center justify-center p-4 sm:p-5">
            <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200/60 overflow-hidden">
                {/* Cabecera con animación */}
                <div className="relative h-48 bg-gradient-to-br from-blue-600 via-violet-600 to-blue-700 flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 opacity-20">
                        <div className="absolute top-4 left-4 w-2 h-2 rounded-full bg-white animate-ping" style={{ animationDelay: "0ms" }} />
                        <div className="absolute top-12 right-8 w-2 h-2 rounded-full bg-white animate-ping" style={{ animationDelay: "700ms" }} />
                        <div className="absolute bottom-8 left-12 w-2 h-2 rounded-full bg-white animate-ping" style={{ animationDelay: "1400ms" }} />
                    </div>
                    <div className="relative text-center text-white">
                        <div className="w-20 h-20 mx-auto rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-3 shadow-xl ring-1 ring-white/30">
                            {isApproved ? (
                                <IconCheck size={40} strokeWidth={2.5} className="text-emerald-300" />
                            ) : (
                                <IconShield size={36} strokeWidth={2.2} className="animate-pulse" />
                            )}
                        </div>
                        <h1 className="text-[20px] font-black tracking-tight">
                            {isApproved ? "¡Listo para empezar!" : "Configurando tu espacio"}
                        </h1>
                        <p className="text-[12.5px] text-blue-100 mt-1">
                            {isApproved
                                ? "Tu cuenta está activa. Te llevamos al panel..."
                                : "Tu caja está casi lista"}
                        </p>
                    </div>
                </div>

                {/* Cuerpo */}
                <div className="p-6 sm:p-7 space-y-5">
                    {/* Email del usuario (visible para que sepa que es su sesión) */}
                    {userEmail && (
                        <div className="text-center">
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/60">
                                <IconUser size={12} className="text-blue-600" />
                                <span className="text-[11px] font-bold text-blue-900">{userEmail}</span>
                            </div>
                        </div>
                    )}

                    {/* Estado actual */}
                    <div className="text-center">
                        {isApproved ? (
                            <p className="text-[13px] text-emerald-700 leading-relaxed font-semibold">
                                🎉 ¡Tu cuenta ha sido aprobada! Te llevamos al panel de acceso.
                            </p>
                        ) : (
                            <>
                                <p className="text-[13px] text-slate-700 leading-relaxed">
                                    {/* ★ v3.2.1: Validar que el tenant pertenece al email actual.
                                          Si el email del tenant no coincide, mostrar userName */}
                                    {(() => {
                                        const tenantEmail = (status as any)?.contact_email || (status as any)?.contactEmail;
                                        const tenantMatches = !tenantEmail || tenantEmail === userEmail;
                                        const displayName = tenantMatches
                                            ? (status?.business_name || userName)
                                            : userName;
                                        return displayName ? (
                                            <span className="font-bold text-slate-900">
                                                {displayName}
                                            </span>
                                        ) : null;
                                    })()}
                                    {" "}está siendo validado por nuestro equipo.
                                </p>
                                <p className="text-[12px] text-slate-500 mt-1.5">
                                    {error || "Te avisaremos cuando esté activo. Esto suele tardar menos de 24h."}
                                </p>
                            </>
                        )}
                    </div>

                    {/* Contador 24h */}
                    {!isApproved && (
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
                                    ? "Tu espacio de cortesía está disponible 24h desde tu registro."
                                    : "Tu periodo de cortesía ha finalizado."}
                            </p>
                        </div>
                    )}

                    {/* Pasos del proceso */}
                    <div className="space-y-2.5">
                        <Step done label="Registro completado" />
                        <Step done label="24h de cortesía concedidas" />
                        <Step
                            done={!!isApproved}
                            active={!isApproved && !status}
                            label="Validación por el equipo"
                        />
                        <Step
                            done={!!isApproved}
                            active={!isApproved && !!status}
                            label="Activación de 7 días de trial"
                        />
                    </div>

                    {/* Botones de acción */}
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
                            onClick={() => navigate("/auth?email=" + encodeURIComponent(userEmail || ""))}
                            className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition touch-manipulation shadow-md shadow-blue-500/30"
                        >
                            <IconArrowRight size={14} strokeWidth={2.5} />
                            Ir al login
                        </button>
                    </div>

                    {/* Indicador de estado (online/poll) */}
                    <div className="flex items-center justify-center gap-3 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-500" : "bg-rose-500"} animate-pulse`} />
                            {isOnline ? "En línea" : "Sin conexión"}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                            ⏱
                            {pollCount} {pollCount === 1 ? "consulta" : "consultas"}
                        </span>
                        {method && (
                            <>
                                <span>•</span>
                                <span className="font-mono">{method}</span>
                            </>
                        )}
                    </div>

                    {/* Detalles técnicos */}
                    <details className="text-[10.5px] text-slate-500 border-t border-slate-200/60 pt-3">
                        <summary className="cursor-pointer font-semibold text-slate-600">
                            Detalles técnicos
                        </summary>
                        <div className="mt-2 space-y-1 font-mono">
                            <div>Email: {userEmail || "—"}</div>
                            <div>Negocio: {(() => {
                                const tenantEmail = (status as any)?.contact_email || (status as any)?.contactEmail;
                                const tenantMatches = !tenantEmail || tenantEmail === userEmail;
                                return userName || (tenantMatches ? status?.business_name : null) || "—";
                            })()}</div>
                            <div>Plan: {userPlan || status?.plan_selected || "—"}</div>
                            <div>Status: {status?.activation_status ?? (loading ? "cargando..." : "sin tenant todavía")}</div>
                            {status?.grace_period_ends_at && (
                                <div>Cortesía: {new Date(status.grace_period_ends_at).toLocaleString("es-ES")}</div>
                            )}
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

export default WelcomePage;
