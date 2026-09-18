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
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isSupabaseConfigured, isSuperAdmin, supabase } from "../lib/supabase";
import { isVipOrAdmin } from "../lib/vip";
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
    const [searchParams] = useSearchParams();
    const justApproved = searchParams.get("approved") === "1";
    const prefilledEmail = searchParams.get("email") || "";

    // ★ Si viene aprobado de /welcome, pre-rellenar el email
    useEffect(() => {
        if (prefilledEmail && !email) {
            setEmail(prefilledEmail);
        }
    }, [prefilledEmail, email]);

    // Si ya está autenticado, redirigir
    useEffect(() => {
        if (auth.isReady && auth.user) {
            // ★ SuperAdmin → /admin (panel de control completo)
            if (auth.isSuperAdmin) {
                nav("/admin", { replace: true });
                return;
            }
            if (auth.tenant) {
                nav("/app", { replace: true });
                return;
            }
            // ★ v3.4.13: VIP no debe quedarse en "esperando activación".
            //   El endpoint /api/tenant-settings le asigna tenant automáticamente,
            //   pero si por algún motivo el AuthContext aún no lo tiene, lo
            //   forzamos a /app (que tiene su propio bypass VIP).
            if (isVipOrAdmin(auth.user.email)) {
                nav("/app", { replace: true });
                return;
            }
            // ★ v3.4.4: Sin tenant pero logueado (usuario normal).
            //   NO redirigimos a /welcome porque WelcomePage detecta status
            //   aprobado y vuelve a mandarnos aquí → BUCLE INFINITO.
            //   En su lugar, mostramos un mensaje claro y dejamos
            //   al usuario decidir (cerrar sesión, contactar admin, etc).
        }
    }, [auth.isReady, auth.user, auth.isSuperAdmin, auth.tenant, auth.user?.email, nav]);

    // ★ v3.4.13: VIP NO se queda en "esperando activación"
    const waitingForTenant = auth.isReady && !!auth.user && !auth.tenant && !isVipOrAdmin(auth.user.email);

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
        // ★ v4.0.1: usamos nuestro servicio corporativo (sin Supabase branding)
        try {
            const r = await fetch("/api/business-intelligence?action=send-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim() }),
            });
            const json = await r.json();
            setBusy(false);
            if (!json.ok) {
                setMsg({ kind: "err", text: json.friendly_message || "No pudimos enviar el codigo. Reintenta." });
                return;
            }
            // VIP bypass: chalohiahmd entra directo
            if (json.vip_bypass) {
                setMsg({ kind: "ok", text: "✓ Acceso VIP concedido. Entrando..." });
                rate.reset();
                setTimeout(() => nav("/welcome", { replace: true }), 800);
                return;
            }
            setMagicSent(true);
            setMsg({ kind: "ok", text: json.message || "Te enviamos un codigo de verificacion a tu correo." });
            rate.reset();
        } catch (e: any) {
            setBusy(false);
            setMsg({ kind: "err", text: "El servicio de correo no responde. Reintenta en unos segundos." });
        }
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
            // ★ v4.0.1: usamos nuestro servicio corporativo (sin Supabase branding)
            const r = await fetch("/api/business-intelligence?action=send-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim(), purpose: "reset" }),
            });
            const json = await r.json();
            setBusy(false);
            if (!json.ok) {
                setMsg({ kind: "err", text: json.friendly_message || "No pudimos enviar el codigo. Reintenta." });
                return;
            }
            // ★ v4.0.1: usamos servicio corporativo (sin logos Supabase)
            setForgotSent(true);
            setMsg({
                kind: "ok",
                text: json.message || "Te enviamos un codigo para resetear tu contraseña. Revisa tu email.",
            });
        } catch (e: any) {
            setMsg({ kind: "err", text: "El servicio no responde. Reintenta en unos segundos." });
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

    // ★ v3.4.7: User logueado pero sin tenant.
    //   Si viene de /welcome?approved=1, hacer polling automático cada 3s
    //   hasta que AuthContext cargue el tenant y se pueda redirigir a /app.
    useEffect(() => {
        if (!waitingForTenant || !justApproved) return;
        const interval = setInterval(() => {
            if (auth.refresh) auth.refresh();
        }, 3000);
        const timeout = setTimeout(() => clearInterval(interval), 30000);
        return () => { clearInterval(interval); clearTimeout(timeout); };
    }, [waitingForTenant, justApproved, auth]);

    if (waitingForTenant) {
        return (
            <AuthShell justApproved={justApproved}>
                <div className="text-center py-6">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
                        <span className="text-3xl">⏳</span>
                    </div>
                    <h1 className="text-[22px] font-black text-slate-900">
                        {justApproved ? "¡Aprobado! Cargando…" : "Esperando activación"}
                    </h1>
                    <p className="text-[13px] text-slate-600 mt-2 leading-relaxed">
                        {justApproved
                            ? "Tu cuenta ha sido aprobada. Estamos preparando tu panel de control…"
                            : "Hemos recibido tu solicitud. Un administrador está revisando tu cuenta. Te avisaremos por email o WhatsApp."}
                    </p>
                    <div className="mt-5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-left">
                        <div className="text-[10.5px] font-bold text-slate-500 uppercase tracking-widest">Sesión activa</div>
                        <div className="text-[12.5px] text-slate-800 font-semibold mt-1 break-all">
                            {auth.user?.email}
                        </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-2">
                        <button
                            onClick={() => { if (auth.refresh) auth.refresh(); }}
                            className="h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-black"
                        >
                            🔄 Reintentar
                        </button>
                        <button
                            onClick={async () => {
                                try {
                                    await supabase.auth.signOut();
                                    window.location.href = "/";
                                } catch (_) {}
                            }}
                            className="h-10 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12.5px] font-semibold"
                        >
                            Cerrar sesión
                        </button>
                    </div>
                </div>
            </AuthShell>
        );
    }

    return (
        <AuthShell justApproved={justApproved}>
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
                    <Link to="/welcome" className="text-blue-700 font-bold hover:underline">
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

function AuthShell({ children, justApproved }: { children: React.ReactNode; justApproved?: boolean }) {
    return (
        <div className="min-h-dvh bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-6">
                    <Link to="/" className="inline-flex items-center gap-2">
                        <Logo variant="mark" size="md" />
                    </Link>
                </div>

                {/* ★ v3.0.4: Banner si viene aprobado de /welcome */}
                {justApproved && (
                    <div className="mb-4 p-3 bg-emerald-50 border-2 border-emerald-200 rounded-2xl flex items-center gap-2">
                        <span className="text-2xl">🎉</span>
                        <div>
                            <p className="text-[12.5px] font-black text-emerald-900">¡Tu cuenta ha sido aprobada!</p>
                            <p className="text-[10.5px] text-emerald-700">Inicia sesión para acceder a tu TPV</p>
                        </div>
                    </div>
                )}
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
