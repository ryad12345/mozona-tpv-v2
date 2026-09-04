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
//   onSuccess  — callback tras crear el lead (recibe leadId)
// =====================================================================

import { useEffect, useRef, useState } from "react";
import { saveLead, appendMessage, type ChatMessage, type PlanCode, type LeadStatus } from "../../lib/chatLeads";
import { IconCheck, IconShield } from "../icons";

interface Props {
    open: boolean;
    onClose: () => void;
    source: "paywall" | "landing" | "onboarding" | "pricing" | "settings";
    ctxEmail?: string;
    ctxName?:  string;
    onSuccess?: (leadId: string) => void;
}

const PHONE_E164 = "34644165153";
const WA_LINK   = `https://wa.me/${PHONE_E164}?text=${encodeURIComponent("Hola, vengo del asistente de MOZONA TPV y quiero activar mi plan.")}`;

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
        content: "¡Listo! Tu prueba de 7 días está activa. Te hemos enviado los detalles al email. ¿Quieres que un humano te contacte por WhatsApp para activar tu plan?",
        options: [
            { label: "📱  Sí, contactar por WhatsApp", value: "wa",   next: "__close__" },
            { label: "✓  No, gracias",                  value: "end",  next: "__close__" },
        ],
    },
};

const PLAN_LABEL: Record<PlanCode, string> = {
    basic:         "Básico (29€/mes)",
    professional:  "Profesional (59€/mes)",
    premium:        "Premium (99€/mes)",
    trial:         "Trial 7 días",
};

export function AIAssistantModal({
    open, onClose, source, ctxEmail, ctxName, onSuccess,
}: Props) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [currentStep, setCurrentStep] = useState<string>("welcome");
    const [businessType, setBusinessType] = useState<string>("");
    const [plan, setPlan] = useState<PlanCode | "">("");
    const [name, setName] = useState(ctxName ?? "");
    const [email, setEmail] = useState(ctxEmail ?? "");
    const [inputValue, setInputValue] = useState("");
    const [busy, setBusy] = useState(false);
    const [leadId, setLeadId] = useState<string | null>(null);
    const [savedOk, setSavedOk] = useState(false);
    const [backend, setBackend]   = useState<"firebase" | "supabase" | "none" | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Reset al abrir
    useEffect(() => {
        if (open) {
            setMessages([{ role: "assistant", content: STEPS.welcome.content, ts: Date.now() }]);
            setCurrentStep("welcome");
            setBusinessType("");
            setPlan("");
            setName(ctxName ?? "");
            setEmail(ctxEmail ?? "");
            setInputValue("");
            setLeadId(null);
            setSavedOk(false);
            setBackend(null);
        }
    }, [open, ctxName, ctxEmail]);

    // Auto-scroll al fondo
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages]);

    const pushAssistant = (content: string) => {
        setMessages(prev => [...prev, { role: "assistant", content, ts: Date.now() }]);
    };
    const pushUser = (content: string) => {
        setMessages(prev => [...prev, { role: "user", content, ts: Date.now() }]);
    };

    const goToStep = (stepId: string) => {
        const step = STEPS[stepId];
        if (!step) return;
        setCurrentStep(stepId);
        pushAssistant(step.content);
    };

    const handleOption = async (value: string, next: string) => {
        // Registrar la elección del usuario
        const step = STEPS[currentStep];
        if (!step) return;
        const opt = step.options?.find(o => o.value === value);
        if (opt) pushUser(opt.label);

        if (currentStep === "welcome") {
            setBusinessType(value);
        } else if (currentStep === "plan") {
            setPlan(value as PlanCode);
        } else if (currentStep === "confirm") {
            if (value === "fix-email") { goToStep("email"); return; }
            if (value === "fix-name")  { goToStep("name");  return; }
            if (value === "yes") {
                // Crear el lead en BD
                await persistLead("trial_activo");
                goToStep("done");
                return;
            }
        } else if (currentStep === "done") {
            if (value === "wa") {
                window.open(WA_LINK, "_blank", "noopener,noreferrer");
            }
            // Cerrar
            onClose();
            return;
        }
        goToStep(next);
    };

    const handleInput = async () => {
        const v = inputValue.trim();
        if (!v) return;
        pushUser(v);
        if (currentStep === "name") {
            setName(v);
            goToStep("email");
        } else if (currentStep === "email") {
            // Validar email básico
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
                pushAssistant("Ese email no parece válido. ¿Puedes repetirlo?");
                setInputValue("");
                return;
            }
            setEmail(v);
            goToStep("confirm");
        }
        setInputValue("");
    };

    const persistLead = async (status: LeadStatus) => {
        if (savedOk) return; // idempotente
        setBusy(true);
        const trialEndsAt = new Date(Date.now() + 7 * 86400000).toISOString();
        const history: ChatMessage[] = messages.slice(); // copia del estado actual
        const result = await saveLead({
            user_email:      email || undefined,
            restaurant_name: name || undefined,
            selected_plan:   (plan as PlanCode) || undefined,
            trial_ends_at:   trialEndsAt,
            status,
            chat_history:    history,
            source,
            metadata:        { business_type: businessType, source },
        });
        if (result.ok) {
            setLeadId(result.id ?? null);
            setBackend(result.backend);
            setSavedOk(true);
            onSuccess?.(result.id ?? "");
        } else {
            // ★ v1.9.37: mensaje específico para Firebase no configurado
            const isConfigErr = (result.error ?? "").toLowerCase().includes("firebase")
                || result.backend === "none";
            const msg = isConfigErr
                ? `⚠️ Firebase no está configurado todavía.\n\n` +
                  `El equipo de MOZONA TPV aún no ha activado el almacenamiento de leads.\n\n` +
                  `Mientras tanto, te ayudo por WhatsApp directo:`
                : `No pude guardar tus datos ahora mismo. ¿Me das unos segundos y vuelves a intentarlo?\n\n` +
                  `(${result.error ?? "Error desconocido"})`;
            pushAssistant(msg);
            // Si es error de config, mostrar CTA WhatsApp como acción
            if (isConfigErr) {
                pushAssistant("📱 Contacta con soporte para que activen tu prueba de 7 días.");
            }
        }
        setBusy(false);
    };

    if (!open) return null;

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
                {/* ★ v1.9.36: Cabecera con avatar Riyad + indicador online */}
                <div className="bg-gradient-to-br from-violet-600 to-violet-700
                                text-white px-5 py-4 flex items-center gap-3">
                    <div className="relative shrink-0">
                        <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur
                                        flex items-center justify-center
                                        ring-1 ring-white/30 shadow-lg">
                            <span className="text-[15px] font-black tracking-tight">R</span>
                        </div>
                        {/* Indicador "Online" verde */}
                        <span className="absolute -bottom-0.5 -right-0.5
                                         flex h-3.5 w-3.5">
                            <span className="absolute inline-flex h-full w-full
                                             rounded-full bg-emerald-400 opacity-60
                                             animate-ping" />
                            <span className="relative inline-flex h-3.5 w-3.5
                                             rounded-full bg-emerald-500
                                             border-2 border-violet-700" />
                        </span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-[14px] font-black tracking-tight">
                            Riyad <span className="font-medium opacity-80">| Asistente MOZONA TPV</span>
                        </h3>
                        <p className="text-[10.5px] text-violet-100 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                            Online · Configura tu prueba de 7 días
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
                            <button onClick={handleInput} disabled={busy || !inputValue.trim()}
                                    className="h-10 px-4 rounded-xl bg-blue-600 text-white
                                               text-[12.5px] font-bold active:scale-95 transition
                                               disabled:opacity-50">
                                →
                            </button>
                        </div>
                    ) : STEPS[currentStep]?.options ? (
                        <div className="grid grid-cols-1 gap-2">
                            {STEPS[currentStep].options!.map((opt, i) => (
                                <button key={i}
                                        onClick={() => handleOption(opt.value, opt.next)}
                                        disabled={busy && currentStep === "confirm"}
                                        className="w-full h-10 rounded-xl bg-slate-100 hover:bg-slate-200
                                                   text-[12.5px] font-bold text-slate-800
                                                   active:scale-95 transition disabled:opacity-50
                                                   text-left px-4 flex items-center gap-2">
                                    <span className="text-blue-600">→</span> {opt.label}
                                </button>
                            ))}
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
