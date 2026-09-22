// =====================================================================
// MOZONA TPV — AuthPage (v4.0.7-password-native)
// =====================================================================
// Autenticación NATIVA de Supabase con email + contraseña.
// Sin código OTP intermedio. Sin dependencia de SMTP.
//
// FLUJOS:
//   - signup: introduce email + password + nombre del local → signUp →
//     login automático → onboarding (/welcome)
//   - login:  introduce email + password → signInWithPassword → /welcome
//   - forgot: introduce email → mensaje informativo (sin SMTP, no envia email)
//
// VIP BYPASS:
//   - chalohiahmd1980@gmail.com y rofixinsta@gmail.com: acceso directo
//     sin necesidad de cuenta previa.
//
// MIGRACIÓN:
//   - Eliminada pantalla OTP completa
//   - Eliminada dependencia de email_verification_codes
//   - Eliminadas RPCs rpc_generate_email_code / rpc_verify_email_code
// =====================================================================

import { useEffect, useState, useMemo, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { isVipOrAdmin } from "../lib/vip";
import { Logo } from "../components/Logo";
import {
    IconEye,
    IconEyeOff,
    IconShield,
    IconLock,
    IconArrowRight,
    IconSparkles,
    IconCheck,
} from "../components/icons";
import { useRateLimit } from "../hooks/useRateLimit";

// ★ Email regex estricto (formato + dominios sospechosos)
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/;
const DISPOSABLE_DOMAINS = [
    "mailinator.com", "tempmail.com", "10minutemail.com",
    "guerrillamail.com", "throwaway.email", "yopmail.com",
    "trashmail.com", "fakeinbox.com", "maildrop.cc",
    "tempmail.org", "sharklasers.com", "guerrillamailblock.com",
];
const BANNED_CHARS = /[\\<>{}|]/;

function validateEmail(email: string): { ok: boolean; reason?: string; friendly?: string } {
    const v = email.trim().toLowerCase();
    if (!v) return { ok: false, reason: "vacio", friendly: "Introduce tu correo electronico" };
    if (!EMAIL_REGEX.test(v)) return { ok: false, reason: "formato", friendly: "El formato del correo no es correcto. Revisa la @ y el punto." };
    if (BANNED_CHARS.test(v)) return { ok: false, reason: "caracteres_invalidos", friendly: "El correo contiene caracteres no permitidos." };
    const dom = v.split("@")[1] || "";
    if (DISPOSABLE_DOMAINS.includes(dom)) return { ok: false, reason: "email_temporal", friendly: "Por favor, usa un correo electronico real. No aceptamos correos temporales." };
    return { ok: true };
}

function validatePassword(pwd: string): { ok: boolean; reason?: string; friendly?: string } {
    if (!pwd) return { ok: false, reason: "vacio", friendly: "Introduce una contrasena" };
    if (pwd.length < 6) return { ok: false, reason: "longitud", friendly: "La contrasena debe tener al menos 6 caracteres." };
    return { ok: true };
}

// ★ Banner reutilizable
function Banner({ msg }: { msg: { kind: "ok" | "err"; text: string } }) {
    return (
        <div
            role={msg.kind === "err" ? "alert" : "status"}
            className={`mt-3 p-3 rounded-xl text-[12.5px] font-semibold ${
                msg.kind === "ok"
                    ? "bg-emerald-50 border border-emerald-200/70 text-emerald-800"
                    : "bg-rose-50 border border-rose-200/70 text-rose-800"
            }`}
        >
            {msg.text}
        </div>
    );
}

// ★ Shell visual reutilizable
function AuthShell({ children, justApproved }: { children: React.ReactNode; justApproved?: boolean }) {
    return (
        <div className="min-h-dvh w-full bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
            {justApproved && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-emerald-500 text-white text-[13px] font-bold shadow-xl z-50">
                    Tu cuenta ha sido aprobada. Bienvenido.
                </div>
            )}
            <div className="w-full max-w-md">
                <div className="text-center mb-6">
                    <Link to="/" className="inline-block">
                        <Logo variant="full" size="md" />
                    </Link>
                </div>
                <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
                    {children}
                </div>
            </div>
        </div>
    );
}

// ★ Componente principal
export function AuthPage() {
    const auth = useAuth();
    const nav = useNavigate();

    const [searchParams] = useSearchParams();
    const justApproved = searchParams.get("approved") === "1";
    const initialMode = (() => {
        const m = searchParams.get("mode");
        if (m === "signup" || m === "forgot" || m === "login") return m;
        return "login";
    })();
    const [mode, setMode] = useState<"login" | "signup" | "forgot">(initialMode);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [pwd, setPwd] = useState("");
    const [pwd2, setPwd2] = useState("");
    const [showPwd, setShowPwd] = useState(false);
    const [showPwd2, setShowPwd2] = useState(false);
    const [businessName, setBusinessName] = useState("");

    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

    // ★ VIP bypass automático
    const isVipEmail = useMemo(() => isVipOrAdmin(email), [email]);

    const rate = useRateLimit({ key: "auth_login", maxAttempts: 5, windowMs: 60_000 });

    // ★ Si ya está autenticado, redirigir
    useEffect(() => {
        if (auth.isReady && auth.user) {
            if (auth.isSuperAdmin) { nav("/admin", { replace: true }); return; }
            if (isVipOrAdmin(auth.user.email)) { nav("/app", { replace: true }); return; }
            if (auth.tenant) { nav("/app", { replace: true }); return; }
        }
    }, [auth.isReady, auth.user, auth.isSuperAdmin, auth.tenant, nav, isVipEmail]);

    const emailCheck = useMemo(() => validateEmail(email), [email]);
    const pwdCheck = useMemo(() => (pwd ? validatePassword(pwd) : null), [pwd]);

    // ══════════════════════════════════════
    // ★ Submit principal (login | signup | forgot)
    // ══════════════════════════════════════
    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setMsg(null);

        const ev = validateEmail(email);
        if (!ev.ok) {
            setMsg({ kind: "err", text: ev.friendly || "Correo no valido" });
            return;
        }

        if (rate.isBlocked) {
            setMsg({ kind: "err", text: "Has hecho demasiados intentos. Espera un minuto." });
            return;
        }

        // Validaciones segun modo
        if (mode === "signup") {
            if (!name.trim()) {
                setMsg({ kind: "err", text: "Dinos el nombre de tu negocio para empezar." });
                return;
            }
            if (!pwd) {
                setMsg({ kind: "err", text: "Introduce una contrasena." });
                return;
            }
            if (pwd !== pwd2) {
                setMsg({ kind: "err", text: "Las contrasenas no coinciden." });
                return;
            }
            const pv = validatePassword(pwd);
            if (!pv.ok) {
                setMsg({ kind: "err", text: pv.friendly || "Contrasena no valida" });
                return;
            }
        } else if (mode === "login" || mode === "forgot") {
            if (!pwd && mode === "login") {
                setMsg({ kind: "err", text: "Introduce tu contrasena." });
                return;
            }
        }

        setBusy(true);

        try {
            if (mode === "forgot") {
                // ★ Sin SMTP configurado: mostramos mensaje informativo
                //    sin intentar enviar email.
                setMsg({
                    kind: "ok",
                    text: "Si tu cuenta existe, te enviamos instrucciones para restablecer la contrasena. Si no las recibes, contacta con soporte.",
                });
                setBusy(false);
                return;
            }

            if (mode === "signup") {
                await handleSignup();
            } else if (mode === "login") {
                await handleLogin();
            }
        } catch (e: any) {
            setBusy(false);
            console.warn("[AuthPage] submit error:", e?.message || e);
            setMsg({
                kind: "err",
                text: "Algo se ha desconfigurado. Reintenta. Si el problema continúa, revisa la consola del navegador.",
            });
        }
    };

    // ★ v4.0.7-password-native: SIGNUP con signUp + signInWithPassword
    const handleSignup = async () => {
        if (!supabase) {
            setMsg({ kind: "err", text: "Servicio no disponible. Reintenta en unos segundos." });
            setBusy(false);
            return;
        }

        // 1) Crear user en Supabase Auth
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
            email: email.trim(),
            password: pwd,
            options: {
                data: {
                    name: name.trim(),
                    business_name: businessName.trim() || name.trim(),
                },
            },
        });

        if (signUpErr) {
            // Si el usuario ya existe, intentamos login directo
            const isAlreadyExists =
                signUpErr.message?.toLowerCase().includes("already") ||
                signUpErr.status === 422 ||
                signUpErr.status === 400;

            if (isAlreadyExists) {
                await handleLogin();
                return;
            }

            setBusy(false);
            setMsg({
                kind: "err",
                text: `No pudimos crear tu cuenta: ${signUpErr.message || "intenta con otra contrasena"}.`,
            });
            return;
        }

        const userId = signUpData?.user?.id;
        if (!userId) {
            // Supabase puede requerir confirmacion email si esta activado
            // ★ VIP bypass: si es VIP y no hay userId, continuar
            if (isVipOrAdmin(email)) {
                setMsg({ kind: "ok", text: "Cuenta VIP creada. Entrando..." });
                setTimeout(() => nav("/welcome", { replace: true }), 400);
                return;
            }
            setBusy(false);
            setMsg({
                kind: "err",
                text: "Supabase no devolvio un ID de usuario. Es posible que la confirmacion por email este activada. Contacta con soporte.",
            });
            return;
        }

        // 2) Login automatico (sin necesidad de email de confirmacion)
        //    Si Supabase requiere confirmacion, el signIn puede fallar.
        //    En ese caso, pedimos al usuario que vaya a login.
        const { error: signInErr } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: pwd,
        });

        if (signInErr) {
            setBusy(false);
            // Si requiere confirmacion email, mensaje claro
            if (
                signInErr.message?.toLowerCase().includes("confirm") ||
                signInErr.message?.toLowerCase().includes("not confirmed") ||
                signInErr.message?.toLowerCase().includes("verify")
            ) {
                setMsg({
                    kind: "err",
                    text: "Supabase requiere confirmacion de email. En el panel de Supabase (Authentication → Providers → Email), desactiva 'Confirm email' para que los usuarios entren sin verificacion.",
                });
                return;
            }
            setMsg({
                kind: "err",
                text: "Cuenta creada. Inicia sesion con tu correo y contrasena.",
            });
            setMode("login");
            setPwd("");
            setPwd2("");
            return;
        }

        // 3) Login exitoso: notificar Telegram y navegar
        setMsg({ kind: "ok", text: "Cuenta creada. Entrando..." });
        await notifySignupTelegram(name.trim(), email.trim(), userId);
        rate.reset();
        setTimeout(() => nav("/welcome", { replace: true }), 400);
    };

    // ★ v4.0.7-password-native: LOGIN con signInWithPassword
    const handleLogin = async () => {
        if (!supabase) {
            setMsg({ kind: "err", text: "Servicio no disponible. Reintenta en unos segundos." });
            setBusy(false);
            return;
        }

        const { error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: pwd,
        });

        if (error) {
            // ★ v4.0.7: BYPASS VIP TOTAL
            if (isVipOrAdmin(email)) {
                const mockUser = {
                    id: "vip-" + btoa(email).slice(0, 20),
                    email: email.trim(),
                    user_metadata: { name: "VIP Access", vip: true },
                    app_metadata: { provider: "vip-bypass" },
                    aud: "authenticated",
                    created_at: new Date().toISOString(),
                };
                if (auth.setMockSession) {
                    auth.setMockSession(mockUser as any);
                }
                setMsg({ kind: "ok", text: "Acceso VIP concedido. Entrando..." });
                rate.reset();
                setTimeout(() => nav("/app", { replace: true }), 300);
                return;
            }

            rate.recordFailure();
            setBusy(false);
            setMsg({
                kind: "err",
                text: error.message?.toLowerCase().includes("invalid")
                    ? "El correo o la contrasena no coinciden."
                    : error.message || "No pudimos iniciar sesion. Reintenta.",
            });
            return;
        }

        // Login exitoso
        setMsg({ kind: "ok", text: "Sesion iniciada. Entrando..." });
        rate.reset();
        setTimeout(() => nav("/welcome", { replace: true }), 400);
    };

    // ★ Telegram notification (best-effort, no bloquea)
    const notifySignupTelegram = async (userName: string, userEmail: string, userId: string) => {
        try {
            const { sendTelegramMessage } = await import("../lib/telegramAuto");
            const md = [
                "🆕 *Nueva solicitud de alta*",
                `👤 Nombre: ${userName}`,
                `📧 Email: \`${userEmail}\``,
                `🆔 User ID: \`${userId}\``,
                "",
                "👇 Pulsa para aprobar o rechazar:",
            ].join("\n");
            const inlineKeyboard = {
                inline_keyboard: [
                    [
                        {
                            text: "✅ APROBAR (1 CLICK)",
                            url: `https://mozonatpv.site/admin/approve?token=mozona-approve-2025&email=${encodeURIComponent(userEmail)}`,
                        },
                    ],
                    [
                        {
                            text: "❌ Rechazar",
                            url: `https://mozonatpv.site/admin/approve?token=mozona-approve-2025&email=reject-${encodeURIComponent(userEmail)}`,
                        },
                    ],
                ],
            };
            await sendTelegramMessage(md, inlineKeyboard);
        } catch (e) {
            console.warn("[signup] telegram notify error:", e);
        }
    };

    const waitingForTenant = auth.isReady && !!auth.user && !auth.tenant && !isVipOrAdmin(auth.user?.email);

    if (!isSupabaseConfigured) {
        return (
            <AuthShell justApproved={justApproved}>
                <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200/80 text-[12.5px] text-amber-800">
                    <strong>Modo demo.</strong> El servicio de autenticacion no esta configurado. Rellena <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en .env.
                </div>
            </AuthShell>
        );
    }

    // ★ VIP sin tenant: mostrar UI de espera
    if (waitingForTenant) {
        return <WaitingForTenantView auth={auth} />;
    }

    // ★ Pantalla principal: Login / Signup / Forgot
    return (
        <AuthShell justApproved={justApproved}>
            {/* Cabecera */}
            <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-black tracking-wider mb-3">
                    <IconSparkles size={11} strokeWidth={2.4} />
                    {mode === "signup" ? "EMPIEZA GRATIS" : mode === "forgot" ? "RECUPERAR ACCESO" : "BIENVENIDO DE VUELTA"}
                </div>
                <h1 className="text-[24px] font-black text-slate-900 tracking-tight">
                    {mode === "login" ? "Accede a tu panel" : mode === "signup" ? "Crea tu cuenta" : "Recuperar acceso"}
                </h1>
                <p className="text-[12.5px] text-slate-500 mt-1.5">
                    {mode === "signup"
                        ? "7 dias con todo incluido. Sin permanencia."
                        : mode === "forgot"
                        ? "Te ayudamos a recuperar tu cuenta."
                        : "Entra a tu panel de gestion."}
                </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3" autoComplete="on">
                {/* Nombre del negocio (solo signup) */}
                {mode === "signup" && (
                    <>
                        <div>
                            <label className="text-[12px] font-bold text-slate-700 ml-1">Nombre del local</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Restaurante La Esquina"
                                autoComplete="organization"
                                className="mt-1 w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-[14px] outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition"
                                required
                            />
                        </div>
                        <div>
                            <label className="text-[12px] font-bold text-slate-700 ml-1">Nombre comercial (opcional)</label>
                            <input
                                type="text"
                                value={businessName}
                                onChange={(e) => setBusinessName(e.target.value)}
                                placeholder="La Esquina S.L."
                                autoComplete="organization-title"
                                className="mt-1 w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-[14px] outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition"
                            />
                        </div>
                    </>
                )}

                {/* Email */}
                <div>
                    <label className="text-[12px] font-bold text-slate-700 ml-1">Correo electronico</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="tu@correo.com"
                        autoComplete="email"
                        className={`mt-1 w-full h-11 px-3 rounded-xl border bg-white text-[14px] outline-none focus:ring-2 transition ${
                            email && !emailCheck.ok
                                ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/20"
                                : "border-slate-300 focus:border-violet-500 focus:ring-violet-500/20"
                        }`}
                        required
                    />
                    {email && !emailCheck.ok && emailCheck.friendly && (
                        <p className="text-[11.5px] text-rose-600 mt-1 ml-1">{emailCheck.friendly}</p>
                    )}
                </div>

                {/* Password (login/signup, no forgot) */}
                {mode !== "forgot" && (
                    <div>
                        <label className="text-[12px] font-bold text-slate-700 ml-1">Contrasena</label>
                        <div className="relative mt-1">
                            <input
                                type={showPwd ? "text" : "password"}
                                value={pwd}
                                onChange={(e) => setPwd(e.target.value)}
                                placeholder="********"
                                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                                className="w-full h-11 px-3 pr-10 rounded-xl border border-slate-300 bg-white text-[14px] outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition"
                                required
                                minLength={6}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPwd((s) => !s)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 transition"
                                aria-label={showPwd ? "Ocultar contrasena" : "Mostrar contrasena"}
                            >
                                {showPwd ? <IconEyeOff size={16} strokeWidth={1.8} /> : <IconEye size={16} strokeWidth={1.8} />}
                            </button>
                        </div>
                        {mode === "signup" && pwdCheck && !pwdCheck.ok && pwdCheck.friendly && (
                            <p className="text-[11.5px] text-rose-600 mt-1 ml-1">{pwdCheck.friendly}</p>
                        )}
                    </div>
                )}

                {/* Password 2 (solo signup) */}
                {mode === "signup" && (
                    <div>
                        <label className="text-[12px] font-bold text-slate-700 ml-1">Repite la contrasena</label>
                        <div className="relative mt-1">
                            <input
                                type={showPwd2 ? "text" : "password"}
                                value={pwd2}
                                onChange={(e) => setPwd2(e.target.value)}
                                placeholder="********"
                                autoComplete="new-password"
                                className={`w-full h-11 px-3 pr-10 rounded-xl border bg-white text-[14px] outline-none focus:ring-2 transition ${
                                    pwd2 && pwd !== pwd2
                                        ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/20"
                                        : "border-slate-300 focus:border-violet-500 focus:ring-violet-500/20"
                                }`}
                                required
                                minLength={6}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPwd2((s) => !s)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 transition"
                                aria-label={showPwd2 ? "Ocultar contrasena" : "Mostrar contrasena"}
                            >
                                {showPwd2 ? <IconEyeOff size={16} strokeWidth={1.8} /> : <IconEye size={16} strokeWidth={1.8} />}
                            </button>
                        </div>
                        {pwd2 && pwd !== pwd2 && (
                            <p className="text-[11.5px] text-rose-600 mt-1 ml-1">Las contrasenas no coinciden.</p>
                        )}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={busy}
                    className="mt-3 h-12 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 disabled:opacity-50 text-white font-black text-[14px] shadow-lg active:scale-95 transition flex items-center justify-center gap-2"
                >
                    {busy ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            {mode === "signup" ? "Creando cuenta..." : mode === "forgot" ? "Enviando..." : "Entrando..."}
                        </>
                    ) : (
                        <>
                            {mode === "signup" ? "Crear cuenta" : mode === "forgot" ? "Recuperar" : "Entrar"}
                            <IconArrowRight size={14} strokeWidth={2.4} />
                        </>
                    )}
                </button>

                {msg && <Banner msg={msg} />}
            </form>

            {/* Switch entre login / signup / forgot */}
            <div className="mt-5 pt-5 border-t border-slate-200 text-center text-[12.5px] text-slate-600">
                {mode === "login" && (
                    <>
                        <p>
                            ¿No tienes cuenta?{" "}
                            <button
                                type="button"
                                onClick={() => { setMode("signup"); setMsg(null); setPwd(""); setPwd2(""); }}
                                className="text-violet-600 font-bold hover:underline"
                            >
                                Empieza gratis
                            </button>
                        </p>
                        <button
                            type="button"
                            onClick={() => { setMode("forgot"); setMsg(null); }}
                            className="mt-2 text-[11.5px] text-slate-400 hover:text-slate-700"
                        >
                            ¿Olvidaste la contrasena?
                        </button>
                    </>
                )}
                {(mode === "signup" || mode === "forgot") && (
                    <button
                        type="button"
                        onClick={() => { setMode("login"); setMsg(null); setPwd(""); setPwd2(""); }}
                        className="text-violet-600 font-bold hover:underline"
                    >
                        ¿Ya tienes cuenta? Inicia sesion
                    </button>
                )}
            </div>

            {/* Trust footer */}
            <div className="mt-5 pt-4 border-t border-slate-100 text-center">
                <p className="text-[10.5px] text-slate-400 inline-flex items-center gap-1 justify-center">
                    <IconLock size={10} strokeWidth={2} /> Tus datos viajan cifrados de extremo a extremo
                </p>
            </div>
        </AuthShell>
    );
}

// ★ UI de espera para usuarios autenticados sin tenant (no-VIPs)
function WaitingForTenantView({ auth }: { auth: any }) {
    return (
        <div className="min-h-dvh w-full bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 sm:p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-3xl shadow-lg">
                    ⏳
                </div>
                <h1 className="text-[22px] font-black text-slate-900 mb-2">
                    Estamos preparando tu cuenta
                </h1>
                <p className="text-[13px] text-slate-600 mb-4">
                    Hola, <strong>{auth.user?.email}</strong>. Tu solicitud esta siendo revisada.
                    Te avisaremos por email cuando este activa (maximo 24h).
                </p>
                <p className="text-[12px] text-slate-500 mb-6">
                    Si tienes urgencia, contacta con soporte.
                </p>
                <button
                    onClick={() => auth.signOut?.()}
                    className="text-[12.5px] text-violet-600 font-bold hover:underline"
                >
                    Cerrar sesion
                </button>
            </div>
        </div>
    );
}
