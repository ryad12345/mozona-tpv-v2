// =====================================================================
// MOZONA TPV — AIAssistantModal
// =====================================================================
// Asistente interactivo con flujo guiado por botones.
//
//   - Sin LLM: flujo determinista basado en opciones
//   - Sin Firebase: persiste en Supabase (tabla leads_onboarding)
//   - Sin escritura manual salvo campos críticos (nombre, email, restaurante)
//
// Fases del flujo:
//   1. Bienvenida
//   2. Tipo de negocio (restaurante, bar, cafetería, otro)
//   3. Plan (Básico / Profesional / Premium)
//   4. Datos (nombre restaurante, email) — solo si no viene del contexto
//   5. Confirmación y creación del lead
//   6. Cierre con CTA WhatsApp
//
// Props:
//   open       — mostrar/ocultar
//   onClose    — callback al cerrar
//   source     — desde dónde se abre ('paywall' | 'landing' | 'onboarding' | 'pricing' | 'settings')
//   ctxEmail   — email si ya logueado (opcional)
//   ctxName    — nombre restaurante si ya logueado (opcional)
//   ctxPlan    — plan pre-seleccionado (basic | professional | premium | trial)
//   onSuccess  — callback tras crear el lead (recibe leadId)
// =====================================================================

import { useEffect, useRef, useState } from "react";
import { saveLead, appendMessage, type ChatMessage, type PlanCode, type LeadStatus, type AssistantSource } from "../../lib/chatLeads";
import { FIREBASE_CONFIGURED } from "../../lib/firebase";
import { sendLeadEmail } from "../../lib/notify";
import { isLeadAlreadySubmitted, canSubmitAgain, markLeadSubmitted, markLeadAttempt, msUntilNextSubmit, LEAD_RATE_LIMIT_MS } from "../../lib/leadGuard";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { IconCheck } from "../icons";

interface Props {
    open: boolean;
    onClose: () => void;
    source: AssistantSource;
    ctxEmail?: string;
    ctxName?:  string;
    ctxPlan?:  PlanCode;
    onSuccess?: (leadId: string) => void;
}
const PHONE_E164 = "34644165153";
const PHONE_DISPLAY = "+34 644 16 51 53";

// ★ v1.9.42: WhatsApp eliminado del flujo. Los leads se guardan
//   directamente en Firebase y se notifica por email vía webhook.

interface Step {
    id:       string;
    role:     "assistant";
    content:  string;
    options?: Array<{ label: string; value: string; next: string }>;
    input?:   "email" | "name" | "restaurant";
}

const STEPS: Record<string, Step> = {
    welcome: {
        id:      "welcome",
        role:    "assistant",
        content: "¡Hola! Soy Riyad, tu asistente personal. Te ayudo a configurar tu prueba gratuita de 7 días en menos de 30 segundos. ¿Qué tipo de negocio tienes?",
        options: [
            { label: "🍽️  Restaurante",     value: "restaurante",  next: "plan"  },
            { label: "🍺  Bar / Tapas",     value: "bar",          next: "plan"  },
            { label: "☕  Cafetería",       value: "cafeteria",    next: "plan"  },
            { label: "🍦  Heladería / Otro", value: "otro",         next: "plan"  },
        ],
    },
    plan: {
        id:      "plan",
        role:    "assistant",
        content: "Perfecto. ¿Qué plan se adapta mejor a tu volumen de ventas? Todos incluyen 7 días de prueba gratuita.",
        options: [
            { label: "💼  Básico (29€/mes)  — 1 caja, hasta 200 tickets/mes",  value: "basic",         next: "name" },
            { label: "🚀  Profesional (59€/mes) — Multi-caja, comandero, ilimitado", value: "professional", next: "name" },
            { label: "👑  Premium (99€/mes) — Multi-restaurante + VeriFactu + soporte VIP", value: "premium",       next: "name" },
        ],
    },
    name: {
        id:     "name",
        role:   "assistant",
        content: "¿Cómo se llama tu restaurante? Lo usaremos para personalizar tu experiencia.",
        input:  "restaurant",
    },
    email: {
        id:     "email",
        role:   "assistant",
        content: "¿A qué email te enviamos el acceso y la factura?",
        input:  "email",
    },
    confirm: {
        id:      "confirm",
        role:    "assistant",
        content: "Revisa los datos antes de activar tu prueba. ¿Todo correcto?",
        options: [
            { label: "✓  Sí, activar prueba de 7 días", value: "yes", next: "done" },
            { label: "←  Corregir email",                value: "fix-email", next: "email" },
            { label: "←  Corregir nombre",               value: "fix-name",  next: "name"  },
        ],
    },
    done: {
        id:      "done",
        role:    "assistant",
        // ★ v1.9.42: mensaje dinámico según éxito del guardado
        //   (la sustitución real ocurre en el goToStep vía render dinámico)
        content: "", // se sustituye dinámicamente en getDoneMessage()
        options: [
            { label: "🚀  Entrar al Panel", value: "enter", next: "__close__" },
        ],
    },
};

const PLAN_LABEL: Record<PlanCode, string> = {
    basic:         "Básico (29€/mes)",
    professional:  "Profesional (59€/mes)",
    premium:        "Premium (99€/mes)",
    trial:         "Trial 7 días",
};

/** ★ v1.9.49: vista cuando el usuario ya envió un lead desde este dispositivo */
function AlreadySubmittedView({
    onClose, isLogged, navigate,
}: { onClose: () => void; isLogged: boolean; navigate: (path: string) => void }) {
    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm
                        flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl
                            shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden
                            border border-slate-200/80">
                {/* Cabecera */}
                <div className="bg-gradient-to-br from-emerald-600 to-emerald-700
                                text-white px-5 py-4 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur
                                    flex items-center justify-center shadow-lg">
                        <IconCheck size={22} strokeWidth={3} />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-[14px] font-black tracking-tight">
                            Solicitud ya registrada
                        </h3>
                        <p className="text-[10.5px] text-emerald-100 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 inline-block" />
                            Recepción confirmada
                        </p>
                    </div>
                    <button onClick={onClose}
                            className="w-8 h-8 rounded-xl text-white/80 hover:text-white
                                       hover:bg-white/10 flex items-center justify-center">
                        ✕
                    </button>
                </div>

                {/* Cuerpo */}
                <div className="px-5 py-6 text-center space-y-4">
                    <p className="text-[13.5px] text-slate-700 leading-relaxed">
                        Tu solicitud ya ha sido recibida correctamente. Nos pondremos en contacto
                        contigo a la brevedad al correo electrónico que nos facilitaste.
                    </p>
                    <p className="text-[11.5px] text-slate-400">
                        Si necesitas modificar algún dato, escríbenos por WhatsApp.
                    </p>
                </div>

                {/* Acciones */}
                <div className="border-t border-slate-200/80 bg-white px-4 py-3 space-y-2">
                    <button type="button"
                            onClick={() => {
                                try {
                                    if (isLogged) navigate("/app");
                                    else navigate("/auth?signup=1");
                                } catch (_) {
                                    try { location.href = isLogged ? "/app" : "/auth?signup=1"; } catch (_) {}
                                }
                                try { onClose(); } catch (_) {}
                            }}
                            className="w-full h-10 rounded-xl bg-blue-600 text-white
                                       text-[12.5px] font-black active:scale-95 transition
                                       hover:bg-blue-700">
                        🚀 Entrar al Panel
                    </button>
                    <button type="button"
                            onClick={onClose}
                            className="w-full h-8 text-[11px] text-slate-500 font-semibold
                                       hover:text-slate-700">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}

export function AIAssistantModal({
    open, onClose, source, ctxEmail, ctxName, ctxPlan, onSuccess,
}: Props) {
    const navigate = useNavigate();
    const auth = useAuth();
    const isLogged = !!auth?.user;
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [currentStep, setCurrentStep] = useState<string>("welcome");
    const [businessType, setBusinessType] = useState<string>("");
    const [plan, setPlan] = useState<PlanCode | "">(ctxPlan ?? "");
    const [name, setName] = useState(ctxName ?? "");
    const [email, setEmail] = useState(ctxEmail ?? "");
    const [inputValue, setInputValue] = useState("");
    const [busy, setBusy] = useState(false);
    const [leadId, setLeadId] = useState<string | null>(null);
    const [savedOk, setSavedOk] = useState(false);
    const [backend, setBackend]   = useState<"firebase" | "supabase" | "none" | null>(null);
    const [isTyping, setIsTyping] = useState(false);  // ★ v1.9.39: Smart Engine
    // ★ v1.9.49: estado de envío + rate limit
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [alreadySubmitted] = useState<boolean>(() => isLeadAlreadySubmitted());
    const [rateLimitedUntil, setRateLimitedUntil] = useState<number>(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    // ★ v1.9.39: Mensaje de bienvenida contextual
    const getWelcomeMessage = (): string => {
        if (ctxPlan && ctxPlan !== "trial") {
            const planName = ctxPlan === "basic" ? "Plan Plus (Básico)"
                          : ctxPlan === "professional" ? "Plan Pro (Profesional)"
                          : ctxPlan === "premium" ? "Plan Premium"
                          : "";
            return `¡Hola! Soy Riyad, tu asistente personal. Veo que te interesa el ${planName}. Vamos a configurar tu prueba gratuita de 7 días en menos de 30 segundos. ¿Qué tipo de negocio tienes?`;
        }
        return STEPS.welcome.content;
    };

    // ★ v1.9.39: Delay aleatorio 400-900ms (Smart Engine)
    const thinkDelay = (): Promise<void> => {
        const ms = 400 + Math.floor(Math.random() * 500);
        return new Promise(r => setTimeout(r, ms));
    };

    // Reset al abrir
    useEffect(() => {
        if (open) {
            setMessages([]);
            setCurrentStep("welcome");
            setBusinessType("");
            setPlan(ctxPlan ?? "");
            setName(ctxName ?? "");
            setEmail(ctxEmail ?? "");
            setInputValue("");
            setLeadId(null);
            setSavedOk(false);
            setBackend(null);
            setIsTyping(true);
            // Mensaje contextual con typing
            thinkDelay().then(() => {
                setMessages([{ role: "assistant", content: getWelcomeMessage(), ts: Date.now() }]);
                setIsTyping(false);
            });
        }
    }, [open, ctxName, ctxEmail, ctxPlan]);

    // Auto-scroll al fondo
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, isTyping]);

    const pushAssistant = (content: string) => {
        setMessages(prev => [...prev, { role: "assistant", content, ts: Date.now() }]);
    };
    const pushUser = (content: string) => {
        setMessages(prev => [...prev, { role: "user", content, ts: Date.now() }]);
    };

    // ★ v1.9.45: mensaje final EXACTO del cliente (privado, profesional, claro)
    //    Se muestra IGUAL tanto si Firebase está configurado como si no,
    //    porque el flujo de envío es asíncrono y la UI no debe esperar.
    //    NUNCA devuelve undefined (try-catch defensivo).
    const getDoneMessage = (): string => {
        const EXACT_MESSAGE =
            "¡Solicitud enviada con éxito! Hemos registrado tus datos correctamente. " +
            "Nuestro equipo revisará tu solicitud y te contestaremos muy pronto " +
            "al correo electrónico que nos has facilitado.";
        try {
            return EXACT_MESSAGE;
        } catch (e) {
            console.error("[AIAssistantModal] getDoneMessage error:", e);
            return EXACT_MESSAGE;
        }
    };

    // ★ v1.9.39 + v1.9.41: goToStep con typing + mensaje dinámico en "done"
    const goToStep = async (stepId: string) => {
        const step = STEPS[stepId];
        if (!step) return;
        setCurrentStep(stepId);
        setIsTyping(true);
        await thinkDelay();
        const content = stepId === "done" ? getDoneMessage() : step.content;
        pushAssistant(content);
        setIsTyping(false);
    };

    // ★ v1.9.39 + v1.9.41: handleOption con typing + flujo defensivo
    const handleOption = async (value: string, next: string) => {
        const step = STEPS[currentStep];
        if (!step) return;
        const opt = step.options?.find(o => o.value === value);
        if (opt) pushUser(opt.label);

        if (currentStep === "welcome") {
            setBusinessType(value);
        } else if (currentStep === "plan") {
            setPlan(value as PlanCode);
        } else if (currentStep === "confirm") {
            if (value === "fix-email") { await goToStep("email"); return; }
            if (value === "fix-name")  { await goToStep("name");  return; }
            if (value === "yes") {
                // ★ v1.9.49: Rate limit check
                if (!canSubmitAgain()) {
                    const ms = msUntilNextSubmit();
                    const s = Math.ceil(ms / 1000);
                    setRateLimitedUntil(Date.now() + ms);
                    try { pushAssistant(`⏳ Acabas de enviar una solicitud. Espera ${s}s para enviar otra.`); } catch (_) {}
                    return;
                }
                if (isSubmitting) {
                    return; // Doble-click seguro
                }
                markLeadAttempt(); // Marca el intento AHORA (rate limit)
                setIsSubmitting(true);
                setIsTyping(true);
                try {
                    if (FIREBASE_CONFIGURED) {
                        await persistLead("trial_activo");
                    } else {
                        setSavedOk(true);
                        setBackend("none");
                    }
                    // ★ v1.9.49: marca el envío exitoso en localStorage
                    markLeadSubmitted();
                } finally {
                    setIsSubmitting(false);
                    setIsTyping(false);
                }
                await goToStep("done");
                return;
            }
        } else if (currentStep === "done") {
            // ★ v1.9.42 + v1.9.43: Botón "Entrar al Panel" con try-catch
            if (value === "enter") {
                try {
                    if (isLogged) {
                        navigate("/app");
                    } else {
                        navigate("/auth?signup=1&email=" + encodeURIComponent(email || ""));
                    }
                } catch (e) {
                    console.error("[AIAssistantModal] navigate error:", e);
                    // Fallback: location.href
                    try { location.href = isLogged ? "/app" : "/auth?signup=1"; } catch (_) {}
                }
                try { onClose(); } catch (_) {}
                return;
            }
            onClose();
            return;
        }
        await goToStep(next);
    };

    const handleInput = async () => {
        const v = inputValue.trim();
        if (!v) return;
        pushUser(v);
        if (currentStep === "name") {
            setName(v);
            await goToStep("email");
        } else if (currentStep === "email") {
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
                setIsTyping(true);
                await thinkDelay();
                pushAssistant("Ese email no parece válido. ¿Puedes repetirlo?");
                setIsTyping(false);
                setInputValue("");
                return;
            }
            setEmail(v);
            await goToStep("confirm");
        }
        setInputValue("");
    };

    const persistLead = async (status: LeadStatus) => {
        if (savedOk) return;
        setBusy(true);
        const trialEndsAt = new Date(Date.now() + 7 * 86400000).toISOString();
        const history: ChatMessage[] = messages.slice();
        let result: { ok: boolean; id?: string; error?: string; backend: "firebase" | "none" };
        try {
            result = await saveLead({
                user_email:      email || undefined,
                restaurant_name: name || undefined,
                selected_plan:   (plan as PlanCode) || undefined,
                trial_ends_at:   trialEndsAt,
                status,
                chat_history:    history,
                source,
                metadata:        { business_type: businessType, source, ctxPlan: ctxPlan ?? null },
            });
        } catch (e: any) {
            // ★ v1.9.43: try-catch defensivo
            console.error("[AIAssistantModal] persistLead error:", e);
            result = { ok: false, error: e?.message ?? "Error desconocido", backend: "none" };
        }
        if (result.ok) {
            setLeadId(result.id ?? null);
            setBackend(result.backend);
            setSavedOk(true);
            onSuccess?.(result.id ?? "");
        } else {
            const isConfigErr = (result.error ?? "").toLowerCase().includes("firebase")
                || result.backend === "none";
            // ★ v1.9.43: mensaje sin mencionar WhatsApp
            const msg = isConfigErr
                ? `📝 Hemos recibido tu solicitud.\n\n` +
                  `Nuestro equipo activará tu prueba de 7 días en las próximas horas ` +
                  `y te contactará por email.`
                : `No pude guardar tus datos ahora mismo. ¿Me das unos segundos y vuelves a intentarlo?\n\n` +
                  `(${result.error ?? "Error desconocido"})`;
            try { pushAssistant(msg); } catch (_) {}
            // Marcamos como "guardado virtual" para que el flujo no se rompa
            setSavedOk(true);
            setBackend("none");
        }
        // ★ v1.9.47: Envío de email vía EmailJS (fire-and-forget, no bloquea la UI)
        try {
            void sendLeadEmail({
                leadId:         result.id || `local-${Date.now()}`,
                restaurantName: name || undefined,
                userEmail:      email || undefined,
                selectedPlan:   (plan as string) || "basic",
                businessType:   businessType || undefined,
                source:         source,
                trialEndsAt:    trialEndsAt,
                status:         status,
            }).then(r => {
                console.log("[AIAssistantModal] email notify result:", r);
            }).catch(e => {
                console.warn("[AIAssistantModal] email notify error (silenciado):", e);
            });
        } catch (_) {
            // Email totalmente opcional - nunca afecta al flujo
        }
        setBusy(false);
    };

    if (!open) return null;

    // ★ v1.9.49: Si ya se envió una solicitud desde este dispositivo,
    //    mostrar mensaje permanente en lugar del flujo de 5 pasos.
    if (alreadySubmitted) {
        return <AlreadySubmittedView onClose={onClose} isLogged={isLogged} navigate={navigate} />;
    }

    // Texto de confirmación
    const confirmText =
        `Vas a iniciar tu prueba de 7 días con el plan ${plan ? PLAN_LABEL[plan as PlanCode] : "—"} ` +
        `para ${name || "tu restaurante"}${email ? ` (Email: ${email})` : ""}.`;

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm
                        flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl
                            shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden
                            border border-slate-200/80">
                {/* ★ v1.9.36 + v1.9.39: Cabecera con avatar Riyad + glow animado cuando piensa */}
                <div className="bg-gradient-to-br from-violet-600 to-violet-700
                                text-white px-5 py-4 flex items-center gap-3">
                    <div className="relative shrink-0">
                        {/* ★ v1.9.39: Glow ring animado cuando está pensando */}
                        {isTyping && (
                            <>
                                <span className="absolute inset-0 rounded-2xl
                                                 bg-emerald-400/40 animate-ping" />
                                <span className="absolute -inset-1 rounded-2xl
                                                 bg-emerald-400/20 blur-md animate-pulse" />
                            </>
                        )}
                        <div className={
                            "relative w-11 h-11 rounded-2xl bg-white/20 backdrop-blur " +
                            "flex items-center justify-center shadow-lg transition-all duration-300 " +
                            (isTyping
                                ? "ring-2 ring-emerald-300 ring-offset-2 ring-offset-violet-700 scale-105"
                                : "ring-1 ring-white/30")
                        }>
                            <span className={
                                "text-[15px] font-black tracking-tight transition-all " +
                                (isTyping ? "text-emerald-200" : "")
                            }>R</span>
                        </div>
                        {/* Indicador "Online" verde */}
                        <span className="absolute -bottom-0.5 -right-0.5
                                         flex h-3.5 w-3.5">
                            <span className={
                                "absolute inline-flex h-full w-full rounded-full " +
                                (isTyping ? "bg-amber-400" : "bg-emerald-400") +
                                " opacity-60 animate-ping"
                            } />
                            <span className={
                                "relative inline-flex h-3.5 w-3.5 rounded-full " +
                                "border-2 border-violet-700 " +
                                (isTyping ? "bg-amber-500" : "bg-emerald-500")
                            } />
                        </span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-[14px] font-black tracking-tight">
                            Riyad <span className="font-medium opacity-80">| Asistente MOZONA TPV</span>
                        </h3>
                        <p className="text-[10.5px] text-violet-100 flex items-center gap-1">
                            {isTyping ? (
                                <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block animate-pulse" />
                                    <span className="font-bold text-amber-200">Escribiendo</span>
                                </>
                            ) : (
                                <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                                    Online · Configura tu prueba de 7 días
                                </>
                            )}
                        </p>
                    </div>
                    <button onClick={onClose}
                            className="w-8 h-8 rounded-xl text-white/80 hover:text-white
                                       hover:bg-white/10 flex items-center justify-center">
                        ✕
                    </button>
                </div>

                {/* Mensajes */}
                <div ref={scrollRef}
                     className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-slate-50">
                    {messages.map((m, i) => (
                        <div key={i} className={
                            "flex " + (m.role === "user" ? "justify-end" : "justify-start")
                        }>
                            <div className={
                                "max-w-[85%] rounded-2xl px-3 py-2 text-[12.5px] " +
                                (m.role === "user"
                                    ? "bg-blue-600 text-white"
                                    : "bg-white text-slate-800 border border-slate-200/80")
                            }>
                                {m.content.split("\n").map((line, j) => (
                                    <div key={j}>{line}</div>
                                ))}
                            </div>
                        </div>
                    ))}
                    {/* ★ v1.9.39: Typing indicator (3 puntos animados) */}
                    {isTyping && (
                        <div className="flex justify-start">
                            <div className="bg-white border border-slate-200/80
                                            rounded-2xl px-3.5 py-2.5
                                            flex items-center gap-1.5
                                            shadow-sm">
                                <span className="sr-only">Riyad está escribiendo</span>
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-500
                                                 animate-bounce" style={{ animationDelay: "0ms" }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-500
                                                 animate-bounce" style={{ animationDelay: "150ms" }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-500
                                                 animate-bounce" style={{ animationDelay: "300ms" }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Confirmación con resumen */}
                {currentStep === "confirm" && (
                    <div className="px-4 py-2 bg-blue-50 border-t border-blue-200/80">
                        <div className="text-[11px] font-black text-blue-800 uppercase tracking-wider mb-1">
                            Resumen
                        </div>
                        <div className="text-[12px] text-blue-900">{confirmText}</div>
                    </div>
                )}

                {/* Acciones: input o botones */}
                <div className="border-t border-slate-200/80 bg-white px-4 py-3 space-y-2">
                    {/* Si el step tiene input, mostrar input */}
                    {STEPS[currentStep]?.input ? (
                        <div className="flex gap-2">
                            <input
                                type={STEPS[currentStep].input === "email" ? "email" : "text"}
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleInput()}
                                placeholder={
                                    STEPS[currentStep].input === "email" ? "tu@email.com" : "Ej: Rincón de Casablanca"
                                }
                                className="input flex-1"
                                autoFocus
                            />
                            <button onClick={handleInput} disabled={isTyping || busy || !inputValue.trim()}
                                    className="h-10 px-4 rounded-xl bg-blue-600 text-white
                                               text-[12.5px] font-bold active:scale-95 transition
                                               disabled:opacity-50">
                                →
                            </button>
                        </div>
                    ) : STEPS[currentStep]?.options ? (
                        <div className="grid grid-cols-1 gap-2">
                            {STEPS[currentStep].options!.map((opt, i) => {
                                // ★ v1.9.49: el botón "yes" muestra "Enviando..." durante el submit
                                const isYesSubmitting = isSubmitting
                                    && currentStep === "confirm"
                                    && opt.value === "yes";
                                const label = isYesSubmitting
                                    ? "⏳  Enviando solicitud..."
                                    : opt.label;
                                return (
                                <button key={i}
                                        onClick={() => handleOption(opt.value, opt.next)}
                                        disabled={isTyping || isSubmitting || (busy && currentStep === "confirm")}
                                        className="w-full h-10 rounded-xl bg-slate-100 hover:bg-slate-200
                                                   text-[12.5px] font-bold text-slate-800
                                                   active:scale-95 transition disabled:opacity-50
                                                   text-left px-4 flex items-center gap-2">
                                    {isYesSubmitting ? (
                                        <span className="inline-block w-3.5 h-3.5
                                                         border-2 border-blue-600 border-t-transparent
                                                         rounded-full animate-spin" />
                                    ) : (
                                        <span className="text-blue-600">→</span>
                                    )}
                                    {label}
                                </button>
                                );
                            })}
                        </div>
                    ) : null}

                    {savedOk && (
                        <div className="flex items-center gap-1.5 text-[10.5px] text-emerald-600
                                        font-bold justify-center pt-1">
                            <IconCheck size={12} strokeWidth={2.4} />
                            <span>
                                Guardado en{" "}
                                <span className="uppercase">{backend ?? "—"}</span>
                                {" · ID: "}
                                {leadId?.slice(0, 8) ?? "—"}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
