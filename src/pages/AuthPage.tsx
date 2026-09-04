// =====================================================================
// MOZONA TPV — AuthPage (/auth) — SOLO LOGIN ADMIN
// =====================================================================
// El registro de nuevos clientes está BLOQUEADO en esta pantalla.
// Para crear cuenta nueva es obligatorio:
//   1) Pagar plan en /pricing
//   2) Verificar sesión de Stripe en /register
// Esta página sólo permite:
//   • Iniciar sesión con email + contraseña
//   • Magic link (recuperación)
// =====================================================================

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isSupabaseConfigured, isSuperAdmin, supabase } from "../lib/supabase";
import { IconShield, IconLock, IconArrowRight, IconSparkles } from "../components/icons";
import { Logo } from "../components/Logo";
import { useRateLimit } from "../hooks/useRateLimit";

export function AuthPage() {
    const auth = useAuth();
    const nav  = useNavigate();

    const [email,    setEmail]    = useState("");
    const [pwd,      setPwd]      = useState("");
    const [busy,     setBusy]     = useState(false);
    const [msg,      setMsg]      = useState<{ kind: "ok" | "err"; text: string } | null>(null);
    const [magicSent, setMagicSent] = useState(false);

    const rate = useRateLimit({ key: "auth_login", maxAttempts: 5, windowMs: 60_000 });

    // Si ya está autenticado, redirigir
    useEffect(() => {
        if (auth.isReady && auth.user) {
            // ★ VIP / SuperAdmin → /app directo, NUNCA a /pricing
            if (auth.isSuperAdmin) {
                nav("/admin/invites", { replace: true });
                return;
            }
            if (auth.tenant) {
                nav("/app", { replace: true });
                return;
            }
            // Sin tenant pero logueado: si es VIP, ir a /app
            // (AuthContext ya le inyecta un tenant sintético, pero por
            //  si acaso lo cubrimos aquí también)
            nav("/app", { replace: true });
        }
    }, [auth.isReady, auth.user, auth.isSuperAdmin, auth.tenant, nav]);

    const handleLogin = async () => {
        setMsg(null);
        if (rate.isBlocked) {
            setMsg({ kind: "err",
                text: `Demasiados intentos. Espera ${rate.remainingSeconds}s para volver a intentar.` });
            return;
        }
        if (!email || !pwd) {
            setMsg({ kind: "err", text: "Email y contraseña son obligatorios" });
            return;
        }
        setBusy(true);
        const { error } = await auth.signIn(email, pwd);
        setBusy(false);
        if (error) {
            const next = rate.recordFailure();
            setMsg({
                kind: "err",
                text: next.blocked
                    ? `Demasiados intentos. Espera ${rate.remainingSeconds}s.`
                    : (error || "Credenciales incorrectas"),
            });
            return;
        }
        rate.reset();
    };

    const handleMagic = async () => {
        setMsg(null);
        if (rate.isBlocked) {
            setMsg({ kind: "err",
                text: `Demasiados intentos. Espera ${rate.remainingSeconds}s.` });
            return;
        }
        if (!email) {
            setMsg({ kind: "err", text: "Introduce tu email" });
            return;
        }
        setBusy(true);
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        setBusy(false);
        if (error) {
            setMsg({ kind: "err", text: error.message });
            return;
        }
        setMagicSent(true);
        setMsg({ kind: "ok", text: "Te hemos enviado un enlace mágico a tu email." });
        rate.reset();
    };

    const [forgotSent, setForgotSent] = useState(false);
    const handleForgot = async () => {
        setMsg(null);
        if (!email) {
            setMsg({ kind: "err", text: "Introduce tu email para enviarte el enlace de reseteo" });
            return;
        }
        setBusy(true);
        try {
            // ★ v1.9.31/32: resetPasswordForEmail
            //   redirectTo apunta a /reset-password (ruta dedicada en App.tsx)
            //   para que Supabase inyecte el access_token y updateUser funcione
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}/reset-password`,
            });
            if (error) {
                setMsg({ kind: "err", text: error.message });
            } else {
                setForgotSent(true);
                setMsg({
                    kind: "ok",
                    text: "Te hemos enviado un enlace para resetear tu contraseña. Revisa tu email.",
                });
            }
        } catch (e: any) {
            setMsg({ kind: "err", text: e?.message ?? "Error inesperado" });
        }
        setBusy(false);
    };

    if (!isSupabaseConfigured) {
        return (
            <AuthShell>
                <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200/80 text-[12.5px] text-amber-800">
                    <strong>Modo demo.</strong>  Supabase no está configurado en este
                    build.  Para usar autenticación real, rellena{" "}
                    <code className="px-1 bg-white rounded">VITE_SUPABASE_URL</code> y{" "}
                    <code className="px-1 bg-white rounded">VITE_SUPABASE_ANON_KEY</code> en tu
                    <code className="px-1 bg-white rounded"> .env</code>.
                </div>
            </AuthShell>
        );
    }

    return (
        <AuthShell>
            <h1 className="text-[26px] font-black tracking-tight text-center">
                Inicia sesión
            </h1>
            <p className="text-center text-[13px] text-slate-500 mt-1">
                Accede a tu panel de MOZONA TPV
            </p>

            {/* Bloque de aviso: registro cerrado */}
            <div className="mt-5 p-3.5 rounded-2xl bg-blue-50 border border-blue-200/80
                            flex items-start gap-2.5">
                <div className="w-8 h-8 shrink-0 rounded-xl bg-blue-600 text-white
                                flex items-center justify-center">
                    <IconSparkles size={16} strokeWidth={1.8} />
                </div>
                <div className="min-w-0 text-[12px] text-slate-700 leading-snug">
                    <strong className="text-slate-900">¿Aún no eres cliente?</strong>{" "}
                    El registro se realiza tras contratar un plan.{" "}
                    <Link to="/pricing" className="text-blue-700 font-bold hover:underline">
                        Ver planes
                    </Link>
                    .
                </div>
            </div>

            {/* Email + password */}
            <div className="mt-5 space-y-3">
                <Field label="Email">
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                           placeholder="tu@email.com" autoComplete="email"
                           className="input" />
                </Field>
                <Field label="Contraseña">
                    <input type="password" value={pwd} onChange={e => setPwd(e.target.value)}
                           placeholder="••••••••" autoComplete="current-password"
                           className="input"
                           onKeyDown={e => e.key === "Enter" && handleLogin()} />
                </Field>
            </div>

            <button onClick={handleLogin} disabled={busy || rate.isBlocked}
                    className="mt-5 w-full h-12 rounded-xl
                               bg-slate-900 text-white text-[14px] font-black
                               shadow-lg shadow-slate-900/20
                               active:scale-95 transition
                               disabled:opacity-50">
                {busy ? "Entrando…" : "Entrar al panel"}
            </button>

            {/* ★ v1.9.31: enlace "¿Olvidaste tu contraseña?" */}
            <div className="mt-3 text-center">
                <button type="button"
                        onClick={handleForgot}
                        disabled={busy || !email || forgotSent || rate.isBlocked}
                        className="text-[12.5px] font-bold text-blue-600 hover:text-blue-800
                                   hover:underline disabled:opacity-50 disabled:no-underline
                                   transition">
                    {forgotSent
                        ? "✓ Enlace de reseteo enviado — revisa tu email"
                        : "¿Olvidaste tu contraseña?"}
                </button>
            </div>

            {msg && (
                <div className={
                    "mt-4 p-3 rounded-xl text-[12.5px] " +
                    (msg.kind === "ok"
                        ? "bg-emerald-50 border border-emerald-200/80 text-emerald-800"
                        : "bg-rose-50 border border-rose-200/80 text-rose-700")
                }>
                    {msg.text}
                </div>
            )}

            {/* Magic link */}
            <button onClick={handleMagic} disabled={busy || !email || magicSent || rate.isBlocked}
                    className="mt-3 w-full h-9 text-[12px] text-slate-500 hover:text-slate-700
                               disabled:opacity-40">
                {magicSent ? "✓ Enlace enviado a tu email" : "Enviarme un enlace mágico"}
            </button>

            <div className="mt-5 pt-5 border-t border-slate-100 text-center text-[12px] text-slate-500">
                ¿Eres camarero?{" "}
                <Link to="/waiter/login" className="text-blue-600 font-semibold hover:underline
                                                    inline-flex items-center gap-1">
                    Acceso aquí
                    <IconArrowRight size={11} strokeWidth={2.4} />
                </Link>
            </div>

            {/* Hint SuperAdmin */}
            {isSuperAdmin(email) && (
                <div className="mt-4 p-3 rounded-xl bg-violet-50 border border-violet-200/80 text-[11.5px] text-violet-800
                                flex items-start gap-2">
                    <IconShield size={14} strokeWidth={2.2} className="mt-0.5 shrink-0" />
                    <span>
                        <strong>Modo SuperAdmin detectado.</strong>  Acceso directo al panel
                        de invitaciones.
                    </span>
                </div>
            )}

            {/* Rate limit indicator */}
            {rate.attempts > 0 && (
                <div className="mt-4 text-center text-[10.5px] text-slate-400 flex items-center justify-center gap-1">
                    <IconLock size={10} strokeWidth={2.2} />
                    Intentos: {rate.attempts}/{rate.maxAttempts}
                </div>
            )}
        </AuthShell>
    );
}

// ---------------------------------------------------------------------
// AuthShell — layout
// ---------------------------------------------------------------------

function AuthShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-dvh bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-6">
                    <Link to="/" className="inline-flex items-center gap-2">
                        <Logo variant="mark" size="md" />
                    </Link>
                </div>
                <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl
                                p-6 sm:p-8">
                    {children}
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <div className="text-[11px] font-bold text-slate-600 tracking-wider uppercase mb-1">
                {label}
            </div>
            {children}
        </label>
    );
}
