// =====================================================================
// MOZONA TPV — AuthPage (v4.0.3) — Dark Luxe Definitivo
// =====================================================================
// Estilo idéntico al panel de configuraciones.
// - Inputs limpios, fluidos, con focus ring elegante
// - Toggle password con icono ojo (mostrar/ocultar)
// - Validación antifraude de email (regex + dominios sospechosos)
// - Modo: login + registro + recuperación de contraseña
// - VIP bypass automático para chalohiahmd / rofixinsta
// - Zero-Tech UI: CERO rastro de Postgrest/Supabase/Vercel
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
    if (pwd.length < 8) return { ok: false, reason: "corta", friendly: "La contrasena debe tener al menos 8 caracteres." };
    if (!/[A-Za-z]/.test(pwd) || !/[0-9]/.test(pwd)) return { ok: false, reason: "debil", friendly: "La contrasena debe tener letras y numeros." };
    return { ok: true };
}

export function AuthPage() {
    const auth = useAuth();
    const nav = useNavigate();

    const [searchParams] = useSearchParams();
    const justApproved = searchParams.get("approved") === "1";
    const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [pwd, setPwd] = useState("");
    const [pwd2, setPwd2] = useState("");
    const [showPwd, setShowPwd] = useState(false);
    const [showPwd2, setShowPwd2] = useState(false);
    const [businessName, setBusinessName] = useState("");

    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
    const [needsOtp, setNeedsOtp] = useState(false);
    const [otpCode, setOtpCode] = useState("");
    const [otpSentInfo, setOtpSentInfo] = useState<{ to: string; masked: string } | null>(null);
    const otpInputRef = useRef<HTMLInputElement | null>(null);

    // ★ VIP bypass automático
    const isVipEmail = useMemo(() => isVipOrAdmin(email), [email]);
    const isVipLogin = useMemo(() => isVipOrAdmin(email), [email]);

    const rate = useRateLimit({ key: "auth_login", maxAttempts: 5, windowMs: 60_000 });

    // ★ Si ya está autenticado, redirigir (zero tech)
    useEffect(() => {
        if (auth.isReady && auth.user) {
            if (auth.isSuperAdmin) { nav("/admin", { replace: true }); return; }
            if (auth.tenant) { nav("/app", { replace: true }); return; }
            // Para no-VIPs sin tenant: mostrar UI de espera
        }
    }, [auth.isReady, auth.user, auth.isSuperAdmin, auth.tenant, nav]);

    useEffect(() => {
        if (mode === "signup" && needsOtp) {
            setTimeout(() => otpInputRef.current?.focus(), 80);
        }
    }, [mode, needsOtp]);

    // ★ Validación email en tiempo real
    const emailCheck = useMemo(() => validateEmail(email), [email]);
    const pwdCheck = useMemo(() => (pwd ? validatePassword(pwd) : null), [pwd]);

    // ══════════════════════════════════════
    // ★ Enviar OTP (Corporativo, Zero-Tech)
    // ══════════════════════════════════════
    const handleSendOtp = async () => {
        setMsg(null);

        const ev = validateEmail(email);
        if (!ev.ok) {
            setMsg({ kind: "err", text: ev.friendly || "Correo no valido" });
            return;
        }

        if (mode === "signup") {
            if (!name.trim()) { setMsg({ kind: "err", text: "Dinos el nombre de tu negocio para empezar." }); return; }
            if (pwd !== pwd2) { setMsg({ kind: "err", text: "Las contrasenas no coinciden." }); return; }
            const pv = validatePassword(pwd);
            if (!pv.ok) {
                setMsg({ kind: "err", text: pv.friendly || "Contrasena no valida" });
                return;
            }
        }

        if (rate.isBlocked) {
            setMsg({ kind: "err", text: "Has hecho demasiados intentos. Espera un minuto." });
            return;
        }
        rate.reset();

        setBusy(true);
        try {
            const r = await fetch("/api/business-intelligence?action=send-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim(), purpose: mode }),
            });
            const json = await r.json();
            setBusy(false);

            if (!json.ok) {
                setMsg({ kind: "err", text: json.friendly_message || "No pudimos enviar el codigo. Reintenta." });
                return;
            }

            if (json.vip_bypass) {
                // ★ VIP: saltar OTP y continuar flujo
                setMsg({ kind: "ok", text: "✓ Acceso VIP concedido. Continuando..." });
                setTimeout(() => proceedAfterOtp(json), 600);
                return;
            }

            const masked = email.replace(/(.{2}).*(@.*)/, "$1•••$2");
            setOtpSentInfo({ to: email.trim(), masked });
            setNeedsOtp(true);
            setOtpCode("");
            setMsg({ kind: "ok", text: json.message || `Te enviamos un codigo de 6 digitos a ${masked}.` });
        } catch (e: any) {
            setBusy(false);
            setMsg({ kind: "err", text: "El servicio no responde. Reintenta en unos segundos." });
        }
    };

    // ★ Verificar OTP
    const handleVerifyOtp = async () => {
        if (!otpCode || otpCode.length !== 6) {
            setMsg({ kind: "err", text: "Introduce los 6 digitos del codigo." });
            return;
        }
        setBusy(true);
        setMsg(null);
        try {
            const r = await fetch("/api/business-intelligence?action=verify-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim(), code: otpCode, purpose: mode }),
            });
            const json = await r.json();
            setBusy(false);
            if (!json.ok) {
                setMsg({ kind: "err", text: json.friendly_message || "El codigo no es correcto." });
                return;
            }
            proceedAfterOtp(json);
        } catch (e: any) {
            setBusy(false);
            setMsg({ kind: "err", text: "El servicio no responde. Reintenta." });
        }
    };

    // ★ Post-OTP: login o signup
    const proceedAfterOtp = async (_verifyResult: any) => {
        setBusy(true);
        try {
            if (mode === "signup") {
                // Llama al endpoint register-tenant
                const r = await fetch("/api/register-tenant", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email: email.trim(),
                        password: pwd,
                        name: name.trim(),
                        businessName: businessName.trim() || name.trim(),
                    }),
                });
                const json = await r.json();
                if (!json.ok) {
                    setBusy(false);
                    setMsg({ kind: "err", text: json.friendly_message || json.message || "No pudimos crear tu cuenta. Reintenta." });
                    return;
                }
                // Inicia sesion
                const { error: e1 } = await supabase.auth.signInWithPassword({
                    email: email.trim(),
                    password: pwd,
                });
                if (e1) {
                    setBusy(false);
                    setMsg({ kind: "err", text: "Cuenta creada. Inicia sesion con tu correo y contrasena." });
                    setMode("login");
                    return;
                }
                setMsg({ kind: "ok", text: "Cuenta creada. Entrando..." });
                setTimeout(() => nav("/welcome", { replace: true }), 600);
                return;
            }

            if (mode === "forgot" || mode === "login") {
                // ★ Login normal con password
                const { error } = await supabase.auth.signInWithPassword({
                    email: email.trim(),
                    password: pwd,
                });
                if (error) {
                    setBusy(false);
                    setMsg({ kind: "err", text: "El correo o la contrasena no coinciden." });
                    return;
                }
                setMsg({ kind: "ok", text: "Entrando..." });
                setTimeout(() => nav("/welcome", { replace: true }), 400);
                return;
            }
        } catch (e: any) {
            setBusy(false);
            setMsg({ kind: "err", text: "Algo se ha desconfigurado. Reintenta." });
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

    // ★ VIP sin tenant: mostrar UI de espera (no redirigir a /welcome para evitar bucles)
    if (waitingForTenant) {
        return <WaitingForTenantView auth={auth} />;
    }

    // ★ Pantalla de verificacion OTP
    if (needsOtp) {
        return (
            <AuthShell justApproved={justApproved}>
                <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-3xl shadow-lg">
                        🔐
                    </div>
                    <h1 className="text-[24px] font-black text-slate-900 mb-2">
                        Verifica tu correo
                    </h1>
                    <p className="text-[13.5px] text-slate-600 mb-6">
                        Te hemos enviado un codigo de 6 digitos a<br/>
                        <span className="font-bold text-slate-800">{otpSentInfo?.masked}</span>
                    </p>
                    <div className="flex justify-center gap-2 mb-4">
                        {[0, 1, 2, 3, 4, 5].map(i => (
                            <input
                                key={i}
                                ref={i === 0 ? otpInputRef : undefined}
                                type="text"
                                maxLength={1}
                                value={otpCode[i] || ""}
                                onChange={(e) => {
                                    const newCode = otpCode.split("");
                                    newCode[i] = e.target.value.replace(/\D/g, "").slice(-1);
                                    setOtpCode(newCode.join(""));
                                    if (e.target.value && i < 5) {
                                        const inputs = document.querySelectorAll(".otp-cell");
                                        (inputs[i + 1] as HTMLInputElement)?.focus();
                                    }
                                }}
                                className="otp-cell w-11 h-14 text-center text-[22px] font-black rounded-xl border-2 border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none transition"
                                inputMode="numeric"
                                pattern="[0-9]*"
                            />
                        ))}
                    </div>
                    <button
                        onClick={handleVerifyOtp}
                        disabled={busy || otpCode.length !== 6}
                        className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-[14px] shadow-lg transition"
                    >
                        {busy ? "Verificando..." : "Confirmar codigo"}
                    </button>
                    <button
                        onClick={() => { setNeedsOtp(false); setOtpCode(""); setMsg(null); }}
                        className="mt-3 text-[12.5px] text-slate-500 hover:text-violet-600 underline transition"
                    >
                        ← Cambiar de correo
                    </button>
                    {msg && <Banner msg={msg} />}
                    <p className="text-[11.5px] text-slate-400 mt-5">
                        El codigo caduca en 10 minutos
                    </p>
                </div>
            </AuthShell>
        );
    }

    // ★ Pantalla principal: Login / Signup / Forgot
    return (
        <AuthShell justApproved={justApproved}>
            <h1 className="text-[26px] font-black text-center mb-2 text-slate-900">
                {mode === "login" ? "Bienvenido de vuelta" : mode === "signup" ? "Empieza gratis" : "Recuperar acceso"}
            </h1>
            <p className="text-center text-[13px] text-slate-500 mb-6">
                {mode === "login" && "Accede a tu panel de gestion"}
                {mode === "signup" && "Crea tu cuenta y probalo 14 dias sin compromiso"}
                {mode === "forgot" && "Te enviamos un codigo para que recuperes el acceso"}
            </p>

            {/* ★ Banner de aprobado (desde /welcome) */}
            {justApproved && (
                <div className="mb-5 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center text-lg flex-shrink-0">
                        <IconCheck size={18} strokeWidth={3} />
                    </div>
                    <div className="text-[12.5px]">
                        <div className="font-black text-emerald-900">¡Cuenta aprobada!</div>
                        <div className="text-emerald-700">Inicia sesion para empezar a usar el sistema.</div>
                    </div>
                </div>
            )}

            <div className="space-y-3.5">
                {/* ★ Nombre del negocio (solo signup) */}
                {mode === "signup" && (
                    <Field label="Como se llama tu negocio">
                        <input
                            type="text"
                            value={businessName}
                            onChange={(e) => setBusinessName(e.target.value)}
                            placeholder="Ej: El Rincon de Casablanca"
                            autoComplete="organization"
                            className="auth-input"
                        />
                    </Field>
                )}

                {mode === "signup" && (
                    <Field label="Tu nombre">
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ej: Riyad"
                            autoComplete="name"
                            className="auth-input"
                        />
                    </Field>
                )}

                {/* ★ Email */}
                <Field label="Correo electronico" hint={emailCheck.ok || !email ? null : emailCheck.friendly} hintColor="rose">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="tu@correo.com"
                        autoComplete="email"
                        className={`auth-input ${email && !emailCheck.ok ? "auth-input--error" : ""} ${emailCheck.ok ? "auth-input--ok" : ""}`}
                    />
                </Field>

                {/* ★ Password con toggle ojo */}
                {mode !== "forgot" && (
                    <Field
                        label={mode === "signup" ? "Crea una contrasena" : "Tu contrasena"}
                        hint={
                            mode === "signup" && pwdCheck && !pwdCheck.ok
                                ? pwdCheck.friendly
                                : mode === "signup" && pwdCheck?.ok
                                    ? "Contrasena segura"
                                    : null
                        }
                        hintColor={mode === "signup" && pwdCheck && !pwdCheck.ok ? "rose" : mode === "signup" && pwdCheck?.ok ? "emerald" : null}
                    >
                        <div className="relative">
                            <input
                                type={showPwd ? "text" : "password"}
                                value={pwd}
                                onChange={(e) => setPwd(e.target.value)}
                                placeholder={mode === "signup" ? "Minimo 8 caracteres, letras y numeros" : "Tu contrasena"}
                                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                                className="auth-input pr-12"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPwd(s => !s)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition p-1"
                                aria-label={showPwd ? "Ocultar contrasena" : "Mostrar contrasena"}
                            >
                                {showPwd ? <IconEyeOff size={20} /> : <IconEye size={20} />}
                            </button>
                        </div>
                    </Field>
                )}

                {/* ★ Confirmar password (solo signup) */}
                {mode === "signup" && (
                    <Field
                        label="Repite la contrasena"
                        hint={pwd2 && pwd === pwd2 ? "Coinciden" : pwd2 && pwd !== pwd2 ? "No coinciden" : null}
                        hintColor={pwd2 && pwd === pwd2 ? "emerald" : pwd2 && pwd !== pwd2 ? "rose" : null}
                    >
                        <div className="relative">
                            <input
                                type={showPwd2 ? "text" : "password"}
                                value={pwd2}
                                onChange={(e) => setPwd2(e.target.value)}
                                placeholder="Repite la contrasena"
                                autoComplete="new-password"
                                className="auth-input pr-12"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPwd2(s => !s)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition p-1"
                                aria-label={showPwd2 ? "Ocultar" : "Mostrar"}
                            >
                                {showPwd2 ? <IconEyeOff size={20} /> : <IconEye size={20} />}
                            </button>
                        </div>
                    </Field>
                )}

                {msg && <Banner msg={msg} />}

                {/* ★ Botón principal */}
                <button
                    onClick={handleSendOtp}
                    disabled={busy}
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 disabled:opacity-50 text-white font-black text-[14px] shadow-lg transition flex items-center justify-center gap-2"
                >
                    {busy && (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    {mode === "login" && (busy ? "Verificando..." : "Entrar")}
                    {mode === "signup" && (busy ? "Creando cuenta..." : "Crear cuenta gratis")}
                    {mode === "forgot" && (busy ? "Enviando..." : "Enviar codigo")}
                    {!busy && <IconArrowRight size={16} strokeWidth={2.5} />}
                </button>

                {/* ★ VIP notice */}
                {isVipEmail && (mode === "login" || mode === "signup") && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[11.5px] text-amber-800">
                        <span>⭐</span>
                        <span className="font-bold">Acceso VIP detectado.</span>
                        <span className="opacity-80">Entraras sin pasos extra.</span>
                    </div>
                )}

                {/* ★ Links */}
                <div className="flex justify-between text-[12.5px] pt-2">
                    {mode === "login" && (
                        <>
                            <button onClick={() => { setMode("signup"); setMsg(null); }} className="text-violet-600 font-bold hover:underline">
                                Crear cuenta
                            </button>
                            <button onClick={() => { setMode("forgot"); setMsg(null); }} className="text-slate-500 hover:text-violet-600 font-medium">
                                Olvide mi contrasena
                            </button>
                        </>
                    )}
                    {mode === "signup" && (
                        <>
                            <span className="text-[11.5px] text-slate-500">14 dias gratis · Sin tarjeta</span>
                            <button onClick={() => { setMode("login"); setMsg(null); }} className="text-violet-600 font-bold hover:underline">
                                Ya tengo cuenta
                            </button>
                        </>
                    )}
                    {mode === "forgot" && (
                        <button onClick={() => { setMode("login"); setMsg(null); }} className="text-violet-600 font-bold hover:underline">
                            ← Volver al inicio
                        </button>
                    )}
                </div>

                {isSuperAdmin(email) && (
                    <div className="mt-4 pt-4 border-t border-slate-200/60 text-center text-[10.5px] text-slate-500">
                        Acceso administrador
                    </div>
                )}
            </div>
        </AuthShell>
    );
}

// =====================================================================
// ★ AuthShell: contenedor dark luxe
// =====================================================================
function AuthShell({ children, justApproved }: { children: React.ReactNode; justApproved?: boolean }) {
    return (
        <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-slate-50 via-violet-50/30 to-blue-50/30 p-4">
            {/* ★ Decoraciones de fondo */}
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-violet-300/30 blur-3xl" />
            <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-blue-300/30 blur-3xl" />

            <div className="relative w-full max-w-md">
                {/* ★ Logo */}
                <div className="flex justify-center mb-6">
                    <Link to="/" className="inline-flex items-center gap-2.5 group">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg group-hover:scale-105 transition">
                            <Logo size="md" />
                        </div>
                        <span className="text-[20px] font-black tracking-tight text-slate-900">
                            Mozona TPV
                        </span>
                    </Link>
                </div>

                {/* ★ Card */}
                <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/60 p-7 sm:p-8">
                    {children}
                </div>

                {/* ★ Footer */}
                <p className="text-center text-[11px] text-slate-500 mt-6">
                    Al continuar, aceptas nuestros terminos y politica de privacidad
                </p>
            </div>
        </div>
    );
}

// =====================================================================
// ★ Field: campo con etiqueta + input + hint
// =====================================================================
function Field({ label, hint, hintColor, children }: { label: string; hint?: string | null; hintColor?: "rose" | "emerald" | null; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-[12.5px] font-bold text-slate-700 mb-1.5">
                {label}
            </label>
            {children}
            {hint && (
                <p className={`mt-1 text-[11.5px] flex items-center gap-1 ${hintColor === "emerald" ? "text-emerald-600" : "text-rose-600"}`}>
                    {hintColor === "emerald" && "✓ "}
                    {hint}
                </p>
            )}
        </div>
    );
}

// =====================================================================
// ★ Banner: mensaje de error/exito
// =====================================================================
function Banner({ msg }: { msg: { kind: "ok" | "err"; text: string } }) {
    return (
        <div
            className={`p-3 rounded-xl text-[12.5px] flex items-start gap-2 ${
                msg.kind === "ok"
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                    : "bg-rose-50 border border-rose-200 text-rose-800"
            }`}
        >
            <span className="text-base leading-none mt-0.5">{msg.kind === "ok" ? "✓" : "✕"}</span>
            <span className="flex-1">{msg.text}</span>
        </div>
    );
}

// =====================================================================
// ★ VIP sin tenant: UI de espera humana
// =====================================================================
function WaitingForTenantView({ auth }: { auth: any }) {
    const nav = useNavigate();
    return (
        <AuthShell>
            <div className="text-center py-3">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center text-3xl">
                    ⏳
                </div>
                <h1 className="text-[22px] font-black text-slate-900 mb-2">
                    Esperando activacion
                </h1>
                <p className="text-[13px] text-slate-600 leading-relaxed mb-5">
                    Hemos recibido tu solicitud. Un administrador la esta revisando.
                    Te avisaremos por correo electronico o WhatsApp.
                </p>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 mb-4 text-left">
                    <div className="text-[10.5px] font-bold text-slate-500 uppercase tracking-widest">Sesion activa</div>
                    <div className="text-[12.5px] text-slate-800 font-semibold mt-1 break-all">
                        {auth.user?.email}
                    </div>
                </div>
                <button
                    onClick={() => window.location.reload()}
                    className="w-full h-11 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white font-black text-[13px] shadow-lg"
                >
                    🔄 Reintentar
                </button>
                <button
                    onClick={async () => {
                        try { await supabase.auth.signOut(); window.location.href = "/"; } catch (_) {}
                    }}
                    className="mt-2 w-full h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12.5px] font-bold transition"
                >
                    Cerrar sesion
                </button>
            </div>
        </AuthShell>
    );
}

// Helper exportado (uso interno)
function isSuperAdmin(email: string): boolean {
    return email.toLowerCase().trim() === "rofixinsta@gmail.com";
}

// ★ CSS embebido via style tag (sin archivo CSS adicional)
const STYLES = `
.auth-input {
    width: 100%;
    height: 46px;
    padding: 0 16px;
    background: #f8fafc;
    border: 1.5px solid #e2e8f0;
    border-radius: 12px;
    color: #0f172a;
    font-size: 14px;
    font-weight: 500;
    transition: all .15s ease-out;
    outline: none;
}
.auth-input::placeholder { color: #94a3b8; font-weight: 400; }
.auth-input:focus {
    background: white;
    border-color: #7c3aed;
    box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.12);
}
.auth-input--error {
    border-color: #f87171 !important;
    background: #fef2f2;
}
.auth-input--ok {
    border-color: #4ade80 !important;
}
.otp-cell {
    color: #0f172a;
    background: #f8fafc;
}
.otp-cell:focus {
    background: white;
    border-color: #7c3aed !important;
}
`;

// ★ Inyectar estilos al cargar
if (typeof document !== "undefined") {
    const id = "authpage-styles";
    if (!document.getElementById(id)) {
        const style = document.createElement("style");
        style.id = id;
        style.textContent = STYLES;
        document.head.appendChild(style);
    }
}

export default AuthPage;
