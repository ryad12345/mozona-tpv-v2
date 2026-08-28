// =====================================================================
// MOZONA TPV — AuthPage (/auth)
// =====================================================================
// Login / Signup multi-tenant con:
//   • Email + password
//   • Google OAuth
//   • Magic link (signInWithOtp)
//
// Al registrarse, si es un nuevo usuario, se crea un tenant demo y
// se le asigna rol owner.  Si el email es SuperAdmin, se le marca
// automáticamente como superadmin con plan lifetime_vip.
// =====================================================================

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isSupabaseConfigured, isSuperAdmin } from "../lib/supabase";
import { IconShield } from "../components/icons";

type Mode = "signin" | "signup";

export function AuthPage() {
    const auth = useAuth();
    const nav  = useNavigate();
    const [params] = useSearchParams();
    const initialMode: Mode = params.get("signup") === "1" ? "signup" : "signin";

    const [mode,   setMode]   = useState<Mode>(initialMode);
    const [email,  setEmail]  = useState("");
    const [pwd,    setPwd]    = useState("");
    const [name,   setName]   = useState("");
    const [busy,   setBusy]   = useState(false);
    const [msg,    setMsg]    = useState<{ kind: "ok" | "err"; text: string } | null>(null);
    const [magicSent, setMagicSent] = useState(false);

    // Si ya está autenticado, redirigir
    useEffect(() => {
        if (auth.isReady && auth.user) {
            const dest = auth.isSuperAdmin ? "/admin/invites" :
                         auth.tenant ? "/app" : "/pricing";
            nav(dest, { replace: true });
        }
    }, [auth.isReady, auth.user, auth.isSuperAdmin, auth.tenant, nav]);

    const handleEmail = async () => {
        setMsg(null);
        if (!email || !pwd) {
            setMsg({ kind: "err", text: "Email y contraseña son obligatorios" });
            return;
        }
        setBusy(true);
        const fn = mode === "signin" ? auth.signIn : auth.signUp;
        const { error } = await fn(email, pwd, name || undefined);
        setBusy(false);
        if (error) setMsg({ kind: "err", text: error });
        else if (mode === "signup") {
            setMsg({ kind: "ok", text: "Cuenta creada.  Revisa tu email para confirmar." });
        }
    };

    const handleMagic = async () => {
        setMsg(null);
        if (!email) {
            setMsg({ kind: "err", text: "Introduce tu email" });
            return;
        }
        setBusy(true);
        const { error } = await (await import("../lib/supabase")).supabase.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        setBusy(false);
        if (error) setMsg({ kind: "err", text: error.message });
        else { setMagicSent(true); setMsg({ kind: "ok", text: "Te hemos enviado un enlace mágico." }); }
    };

    const handleGoogle = async () => {
        setMsg(null);
        setBusy(true);
        const { error } = await auth.signInWithGoogle();
        setBusy(false);
        if (error) setMsg({ kind: "err", text: error });
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
                {mode === "signin" ? "Inicia sesión" : "Crea tu cuenta"}
            </h1>
            <p className="text-center text-[13px] text-slate-500 mt-1">
                {mode === "signin"
                    ? "Accede a tu panel de MOZONA TPV"
                    : "Empieza tu prueba gratuita de 14 días"}
            </p>

            {/* Google OAuth */}
            <button onClick={handleGoogle} disabled={busy}
                    className="mt-6 w-full h-11 rounded-xl
                               border border-slate-200 hover:border-slate-300 hover:bg-slate-50
                               text-[13.5px] font-semibold text-slate-700
                               flex items-center justify-center gap-2.5
                               active:scale-95 transition
                               disabled:opacity-50">
                <GoogleIcon />
                Continuar con Google
            </button>

            <div className="my-5 flex items-center gap-3 text-[10.5px] uppercase font-bold tracking-wider text-slate-400">
                <div className="flex-1 h-px bg-slate-200" />
                o con email
                <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* Email + password */}
            <div className="space-y-3">
                {mode === "signup" && (
                    <Field label="Nombre del restaurante" hint="(opcional)">
                        <input type="text" value={name} onChange={e => setName(e.target.value)}
                               placeholder="Casa Manolo" autoComplete="name"
                               className="input" />
                    </Field>
                )}
                <Field label="Email">
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                           placeholder="tu@email.com" autoComplete="email"
                           className="input" />
                </Field>
                <Field label="Contraseña" hint={mode === "signup" ? "Mínimo 6 caracteres" : ""}>
                    <input type="password" value={pwd} onChange={e => setPwd(e.target.value)}
                           placeholder="••••••••" autoComplete={mode === "signup" ? "new-password" : "current-password"}
                           className="input" />
                </Field>
            </div>

            <button onClick={handleEmail} disabled={busy}
                    className="mt-5 w-full h-12 rounded-xl
                               bg-slate-900 text-white text-[14px] font-black
                               shadow-lg shadow-slate-900/20
                               active:scale-95 transition
                               disabled:opacity-50">
                {busy ? "Procesando…" : mode === "signin" ? "Entrar" : "Crear cuenta"}
            </button>

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
            <button onClick={handleMagic} disabled={busy || !email || magicSent}
                    className="mt-3 w-full h-9 text-[12px] text-slate-500 hover:text-slate-700
                               disabled:opacity-40">
                {magicSent ? "✓ Enlace enviado" : "Enviarme un enlace mágico"}
            </button>

            <div className="mt-6 text-center text-[12.5px] text-slate-500">
                {mode === "signin" ? (
                    <>¿No tienes cuenta? <button onClick={() => setMode("signup")}
                                                 className="text-blue-600 font-semibold hover:underline">
                        Crear una
                    </button></>
                ) : (
                    <>¿Ya tienes cuenta? <button onClick={() => setMode("signin")}
                                                  className="text-blue-600 font-semibold hover:underline">
                        Iniciar sesión
                    </button></>
                )}
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
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700
                                        text-white flex items-center justify-center font-black
                                        shadow-sm shadow-blue-600/30">
                            M
                        </div>
                        <span className="text-[18px] font-black tracking-tight">MOZONA TPV</span>
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
// Field (privado)
// ---------------------------------------------------------------------

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <div className="text-[11px] font-bold text-slate-600 tracking-wider uppercase mb-1">
                {label}
            </div>
            {children}
            {hint && <div className="text-[10.5px] text-slate-400 mt-1">{hint}</div>}
        </label>
    );
}

// ---------------------------------------------------------------------
// GoogleIcon (placeholder simple)
// ---------------------------------------------------------------------

function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23Z" fill="#34A853" />
            <path d="M5.84 14.09A6.6 6.6 0 0 1 5.48 12c0-.73.13-1.44.36-2.09V7.07H2.18A10.99 10.99 0 0 0 1 12c0 1.77.42 3.44 1.18 4.93l3.66-2.84Z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" fill="#EA4335" />
        </svg>
    );
}
