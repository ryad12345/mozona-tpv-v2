// =====================================================================
// MOZONA TPV — RegisterPage (/register)
// =====================================================================
// Sólo accesible tras pago verificado:
//   1. Lee ?session_id=cs_xxx de la URL (devuelta por Stripe Checkout).
//   2. Llama a la Edge Function `verify-checkout-session` para validar
//      que la sesión está `paid`.
//   3. Muestra formulario de creación de cuenta (email + password +
//      nombre del restaurante) SIN pedir tarjeta de nuevo.
//   4. Al hacer submit: signUp → crea tenant con plan "active" →
//      redirige a /setup/onboarding.
// =====================================================================

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import {
    verifyCheckoutSession,
    getCachedVerifiedSession,
    cacheVerifiedSession,
    clearCachedVerifiedSession,
    applyPaidSessionToTenant,
    type CheckoutSessionInfo,
} from "../lib/billing";
import { IconCheck, IconShield, IconArrowRight, IconLock } from "../components/icons";

type Phase = "verifying" | "ready" | "error" | "signing";

const PLAN_LABEL: Record<string, { name: string; price: string }> = {
    plus_30:    { name: "Plus", price: "30€/mes" },
    pro_50:     { name: "Pro",  price: "50€/mes" },
    lifetime_vip: { name: "Lifetime VIP", price: "Gratis" },
};

export function RegisterPage() {
    const auth = useAuth();
    const nav  = useNavigate();
    const [params] = useSearchParams();
    const sessionId = (params.get("session_id") ?? "").trim();

    const [phase,   setPhase]   = useState<Phase>("verifying");
    const [error,   setError]   = useState<string | null>(null);
    const [session, setSession] = useState<CheckoutSessionInfo | null>(null);

    const [restaurantName, setRestaurantName] = useState("");
    const [fullName,       setFullName]       = useState("");
    const [email,          setEmail]          = useState("");
    const [pwd,            setPwd]            = useState("");
    const [confirmPwd,     setConfirmPwd]     = useState("");
    const [showPwd,        setShowPwd]        = useState(false);
    const [accept,         setAccept]         = useState(false);
    const [submitting,     setSubmitting]     = useState(false);
    const [submitError,    setSubmitError]    = useState<string | null>(null);

    // ---------------------------------------------------------------
    // Verificar sesión de Stripe al montar
    // ---------------------------------------------------------------
    useEffect(() => {
        let cancelled = false;

        (async () => {
            // 1) Si no hay session_id, error
            if (!sessionId) {
                setPhase("error");
                setError("No se proporcionó ID de sesión.  Vuelve a la página de precios y completa el pago.");
                return;
            }
            // 2) Si ya está autenticado, salimos a /app
            if (auth.isReady && auth.user) {
                nav("/app", { replace: true });
                return;
            }
            // 3) ¿Hay caché válido?
            const cached = getCachedVerifiedSession();
            if (cached && cached.session_id === sessionId) {
                if (!cancelled) {
                    setSession(cached);
                    setEmail(cached.customer_email ?? "");
                    setPhase("ready");
                }
                return;
            }
            // 4) Verificar contra Edge Function
            const info = await verifyCheckoutSession(sessionId);
            if (cancelled) return;
            if (!info) {
                setPhase("error");
                setError(
                    "No se pudo verificar el pago.  " +
                    "Asegúrate de que la Edge Function `verify-checkout-session` está desplegada " +
                    "y de que la sesión de Stripe es válida y está pagada."
                );
                return;
            }
            cacheVerifiedSession(info);
            setSession(info);
            setEmail(info.customer_email ?? "");
            setPhase("ready");
        })();

        return () => { cancelled = true; };
    }, [sessionId, auth.isReady, auth.user, nav]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);

        if (!restaurantName.trim()) {
            setSubmitError("Introduce el nombre de tu restaurante");
            return;
        }
        if (!fullName.trim()) {
            setSubmitError("Introduce tu nombre");
            return;
        }
        if (!email.trim() || !email.includes("@")) {
            setSubmitError("Email no válido");
            return;
        }
        if (pwd.length < 6) {
            setSubmitError("La contraseña debe tener al menos 6 caracteres");
            return;
        }
        if (pwd !== confirmPwd) {
            setSubmitError("Las contraseñas no coinciden");
            return;
        }
        if (!accept) {
            setSubmitError("Debes aceptar los términos");
            return;
        }
        if (!session) {
            setSubmitError("Sesión de pago no verificada.  Vuelve a la página de precios.");
            return;
        }

        setSubmitting(true);

        // 1) Crear cuenta en Supabase Auth
        const { data, error: signUpErr } = await supabase.auth.signUp({
            email: email.trim().toLowerCase(),
            password: pwd,
            options: { data: { full_name: fullName.trim() } },
        });
        if (signUpErr || !data?.user) {
            setSubmitting(false);
            setSubmitError(signUpErr?.message ?? "No se pudo crear la cuenta");
            return;
        }

        // 2) Crear tenant con plan "active" vinculado a la sesión
        const tenant = await applyPaidSessionToTenant(
            data.user.id, session, restaurantName.trim(),
        );
        if (!tenant) {
            setSubmitting(false);
            setSubmitError("Cuenta creada pero no se pudo vincular el restaurante.  Contacta con soporte.");
            return;
        }

        // 3) Vincular el usuario como owner en tenant_users
        await supabase.from("tenant_users").upsert({
            tenant_id:   tenant.id,
            user_id:     data.user.id,
            email:       email.trim().toLowerCase(),
            role:        "owner",
            pin_code:    "1234",
        }, { onConflict: "tenant_id,user_id" });

        // 4) Limpiar caché y refrescar auth
        clearCachedVerifiedSession();
        setPhase("signing");
        // El signIn puede ser necesario si signUp no devolvió sesión
        if (!data.session) {
            const { error: signInErr } = await supabase.auth.signInWithPassword({
                email: email.trim().toLowerCase(), password: pwd,
            });
            if (signInErr) {
                setSubmitting(false);
                setSubmitError(
                    "Cuenta creada.  Confirma tu email antes de iniciar sesión.",
                );
                return;
            }
        }
        setSubmitting(false);
        nav("/setup/onboarding", { replace: true });
    };

    // ============================================================
    // RENDER
    // ============================================================
    if (phase === "verifying") {
        return (
            <CenteredCard>
                <Spinner />
                <h1 className="mt-4 text-[15px] font-bold text-slate-900">
                    Verificando tu pago…
                </h1>
                <p className="mt-1 text-[12.5px] text-slate-500">
                    Estamos confirmando la transacción con Stripe.
                </p>
            </CenteredCard>
        );
    }

    if (phase === "error" || !session) {
        return (
            <CenteredCard>
                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-rose-100 text-rose-600
                                flex items-center justify-center">
                    <IconShield size={26} strokeWidth={1.8} />
                </div>
                <h1 className="text-[18px] font-black text-slate-900">
                    Pago no verificado
                </h1>
                <p className="mt-2 text-[12.5px] text-slate-500 max-w-xs mx-auto">
                    {error}
                </p>
                <Link
                    to="/pricing"
                    className="mt-5 inline-flex items-center gap-2 h-11 px-5 rounded-xl
                               bg-blue-600 text-white text-[13px] font-bold
                               hover:bg-blue-700 active:scale-95 transition"
                >
                    Volver a Precios
                    <IconArrowRight size={14} strokeWidth={2.4} />
                </Link>
            </CenteredCard>
        );
    }

    const planInfo = PLAN_LABEL[session.plan] ?? { name: "Plan", price: "" };

    return (
        <div className="min-h-dvh bg-gradient-to-b from-slate-50 to-white flex items-start sm:items-center justify-center p-4 py-8">
            <div className="max-w-md w-full">
                {/* Logo */}
                <div className="text-center mb-6">
                    <Link to="/" className="inline-flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700
                                        text-white flex items-center justify-center font-black">
                            M
                        </div>
                        <span className="text-[15px] font-black tracking-tight">MOZONA TPV</span>
                    </Link>
                </div>

                {/* Card */}
                <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl p-7">
                    {/* Header de éxito */}
                    <div className="flex items-center gap-3 p-3.5 bg-emerald-50 border border-emerald-200/80 rounded-2xl mb-5">
                        <div className="w-9 h-9 shrink-0 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
                            <IconCheck size={18} strokeWidth={2.4} />
                        </div>
                        <div className="min-w-0">
                            <div className="text-[12.5px] font-bold text-emerald-900">
                                Pago confirmado · Plan {planInfo.name}
                            </div>
                            <div className="text-[11px] text-emerald-700">
                                {planInfo.price} · Sesión <span className="font-mono">{session.session_id.slice(-8)}</span>
                            </div>
                        </div>
                    </div>

                    <h1 className="text-[22px] font-black text-slate-900 leading-tight">
                        Crea tu cuenta
                    </h1>
                    <p className="mt-1 text-[12.5px] text-slate-500">
                        Último paso: define las credenciales de tu panel de gestión.
                    </p>

                    <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
                        <Field label="Nombre del restaurante" required>
                            <input
                                type="text"
                                value={restaurantName}
                                onChange={e => setRestaurantName(e.target.value)}
                                placeholder="Ej. Restaurante La Plaza"
                                className="input"
                                autoFocus
                            />
                        </Field>

                        <Field label="Tu nombre" required>
                            <input
                                type="text"
                                value={fullName}
                                onChange={e => setFullName(e.target.value)}
                                placeholder="Ej. María López"
                                className="input"
                            />
                        </Field>

                        <Field label="Email (usuario admin)" required>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="tu@email.com"
                                className="input"
                                autoComplete="email"
                            />
                        </Field>

                        <Field label="Contraseña" required>
                            <div className="relative">
                                <input
                                    type={showPwd ? "text" : "password"}
                                    value={pwd}
                                    onChange={e => setPwd(e.target.value)}
                                    placeholder="Mínimo 6 caracteres"
                                    className="input pr-20"
                                    autoComplete="new-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPwd(v => !v)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2
                                               text-[11px] font-bold text-blue-600
                                               hover:text-blue-700 px-2 py-1"
                                >
                                    {showPwd ? "Ocultar" : "Mostrar"}
                                </button>
                            </div>
                        </Field>

                        <Field label="Repite la contraseña" required>
                            <input
                                type={showPwd ? "text" : "password"}
                                value={confirmPwd}
                                onChange={e => setConfirmPwd(e.target.value)}
                                placeholder="Repite la contraseña"
                                className="input"
                                autoComplete="new-password"
                            />
                        </Field>

                        <label className="flex items-start gap-2 cursor-pointer pt-1">
                            <input
                                type="checkbox"
                                checked={accept}
                                onChange={e => setAccept(e.target.checked)}
                                className="mt-0.5 shrink-0"
                            />
                            <span className="text-[11.5px] text-slate-600 leading-snug">
                                Acepto los{" "}
                                <a href="#" className="text-blue-600 underline">términos</a>{" "}
                                y la{" "}
                                <a href="#" className="text-blue-600 underline">política de privacidad</a>.
                            </span>
                        </label>

                        {submitError && (
                            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200/80
                                            text-[12px] text-rose-700">
                                {submitError}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full h-12 rounded-2xl bg-blue-600 hover:bg-blue-700
                                       text-white text-[14px] font-black
                                       shadow-md shadow-blue-600/30 active:scale-95
                                       transition disabled:opacity-50
                                       flex items-center justify-center gap-2"
                        >
                            {submitting
                                ? "Creando cuenta…"
                                : <>Crear mi cuenta
                                    <IconArrowRight size={16} strokeWidth={2.4} />
                                  </>}
                        </button>
                    </form>

                    <div className="mt-4 flex items-center justify-center gap-1.5
                                    text-[10.5px] text-slate-400">
                        <IconLock size={11} strokeWidth={2.2} />
                        Conexión cifrada · Supabase Auth
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-4 text-center text-[10.5px] text-slate-400">
                    ¿Ya tienes cuenta?{" "}
                    <Link to="/auth" className="text-blue-600 font-bold">
                        Iniciar sesión
                    </Link>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function Spinner() {
    return (
        <div className="w-10 h-10 mx-auto border-[3px] border-slate-200 border-t-blue-600
                        rounded-full animate-spin" />
    );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-dvh w-full bg-gradient-to-b from-slate-50 to-white
                        flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200/80
                            shadow-xl p-7 text-center">
                {children}
            </div>
        </div>
    );
}

function Field({ label, required, children }: {
    label: string; required?: boolean; children: React.ReactNode;
}) {
    return (
        <label className="block">
            <span className="block text-[11.5px] font-bold text-slate-700 mb-1">
                {label} {required && <span className="text-rose-500">*</span>}
            </span>
            {children}
        </label>
    );
}
