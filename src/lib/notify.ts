// =====================================================================
// MOZONA TPV — notify.ts
// =====================================================================
// Servicio interno de envío de emails para notificaciones de leads.
//
// v1.9.47: Implementación con EmailJS (sin webhooks externos).
//
// EmailJS es un servicio que envía emails usando SMTP configurado
// en su panel (Gmail, Outlook, custom SMTP). El código cliente solo
// necesita 3 IDs:
//
//   VITE_EMAILJS_SERVICE_ID    (Service configurado en EmailJS)
//   VITE_EMAILJS_TEMPLATE_ID   (Template con variables {{to_name}}, etc.)
//   VITE_EMAILJS_PUBLIC_KEY    (Public Key del panel EmailJS)
//
// Si las env vars están definidas, el envío se hace vía EmailJS.
// Si NO están, se hace un POST directo al REST API de EmailJS usando
// los mismos parámetros. Si tampoco hay IDs, NO-OP silencioso.
//
// DOCUMENTACION:
//   https://www.emailjs.com/docs/rest-api/send/
//
// API REST:
//   POST https://api.emailjs.com/api/v1.0/email/send
//   Headers: { "Content-Type": "application/json" }
//   Body:
//     {
//       service_id:  "service_xxx",
//       template_id: "template_xxx",
//       user_id:     "public_key",
//       template_params: {
//         to_name:    "...",
//         to_email:   "...",
//         subject:    "...",
//         restaurant: "...",
//         plan:       "...",
//         ...
//       }
//     }
// =====================================================================

// Email del administrador (privado, no se muestra en UI)
const ADMIN_EMAIL_DEFAULT = "rofixinsta@gmail.com";

// ★ v1.9.56: FALLBACK HARDCODEADO de credenciales EmailJS
// Si las env vars VITE_EMAILJS_* no se inyectan en el bundle
// (problema conocido en algunos entornos de build), el código
// usa estas constantes como respaldo.
//
// INSTRUCCIONES PARA ACTIVAR:
//   1. Crea una cuenta en https://www.emailjs.com/ (gratis)
//   2. Email Services -> Add New Service (Gmail, Outlook, etc.)
//   3. Email Templates -> Create New Template
//      (usa {{to_email}}, {{subject}}, {{message}}, {{html_body}}, etc.)
//   4. Account -> Public Key
//   5. Rellena las 3 constantes de abajo con tus credenciales
//   6. Redeploy (o el cambio se aplica al siguiente build)
//
// ⚠️ SEGURIDAD:
//   - EmailJS Public Key está DISEÑADA para ser pública
//     (se usa en el cliente para autenticar el envío)
//   - Los Service ID y Template ID tampoco son secretos
//   - La seguridad real está en: el template EmailJS,
//     el SMTP configurado en el servicio, y las reglas
//     de dominio de EmailJS
const FALLBACK_EMAILJS_CONFIG = {
    serviceId:  "",  // ← pega aquí tu Service ID  (ej: "service_abc123")
    templateId: "",  // ← pega aquí tu Template ID (ej: "template_xyz789")
    publicKey:  "",  // ← pega aquí tu Public Key   (ej: "AbCdEfGhIjK...")
// ⚠️ NO COMMITEES CREDENCIALES REALES A REPOSITORIOS PÚBLICOS.
// Si tu repo es privado, puedes pegarlas. Si es público, usa Vercel env vars.
};

// ★ v1.9.55: helper para sanear valores de env vars
// Elimina espacios, saltos de línea, comillas accidentales
function cleanEnv(value: string | undefined | null): string {
    if (value == null) return "";
    return String(value).trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "");
}

/** ★ v1.9.55: helper para validar si una env var está REALMENTE configurada
 *  No acepta: undefined, "", "undefined", "null", solo espacios, etc. */
function isEnvSet(value: string | undefined | null): boolean {
    const v = cleanEnv(value);
    if (!v) return false;
    if (v === "undefined" || v === "null" || v === "false") return false;
    // EmailJS public keys suelen tener ~40 chars; service/template IDs también
    if (v.length < 8) return false;
    return true;
}

/** ★ v1.9.55: constantes evaluadas al cargar el módulo
 *  Usan isEnvSet() en lugar de simple truthy check */
const RAW_SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const RAW_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const RAW_PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

const SERVICE_ID  = cleanEnv(RAW_SERVICE_ID);
const TEMPLATE_ID = cleanEnv(RAW_TEMPLATE_ID);
const PUBLIC_KEY  = cleanEnv(RAW_PUBLIC_KEY);

/** ★ v1.9.56: fuente efectiva de credenciales
 *  Prioridad: env vars > fallback hardcodeado
 *  Retorna el primer valor que esté "set" (no vacío, válido) */
function getEffectiveConfig(): {
    serviceId:  string;
    templateId: string;
    publicKey:  string;
    source:     "env" | "fallback" | "none";
} {
    // 1) Intentar env vars
    if (isEnvSet(SERVICE_ID) && isEnvSet(TEMPLATE_ID) && isEnvSet(PUBLIC_KEY)) {
        return {
            serviceId:  SERVICE_ID,
            templateId: TEMPLATE_ID,
            publicKey:  PUBLIC_KEY,
            source:     "env",
        };
    }
    // 2) Fallback hardcodeado
    const fb = FALLBACK_EMAILJS_CONFIG;
    const fbService  = cleanEnv(fb.serviceId);
    const fbTemplate = cleanEnv(fb.templateId);
    const fbKey      = cleanEnv(fb.publicKey);
    if (isEnvSet(fbService) && isEnvSet(fbTemplate) && isEnvSet(fbKey)) {
        return {
            serviceId:  fbService,
            templateId: fbTemplate,
            publicKey:  fbKey,
            source:     "fallback",
        };
    }
    return { serviceId: "", templateId: "", publicKey: "", source: "none" };
}

const EFFECTIVE = getEffectiveConfig();
const EMAILJS_CONFIGURED: boolean = EFFECTIVE.source !== "none";

/** ★ v1.9.55: diagnóstico completo de la configuración de EmailJS */
export interface EmailJSConfigStatus {
    configured: boolean;
    missing:    string[];      // nombres de variables faltantes o inválidas
    invalid:    string[];      // vars con valor presente pero inválido
    values:     {
        serviceId:  string;
        templateId: string;
        publicKey:  string;
    };
    rawLengths: {
        serviceId:  number;
        templateId: number;
        publicKey:  number;
    };
    source:     "env" | "fallback" | "none";
}

export function checkEmailJSConfig(): EmailJSConfigStatus {
    const missing: string[] = [];
    const invalid: string[] = [];
    if (!RAW_SERVICE_ID)         missing.push("VITE_EMAILJS_SERVICE_ID");
    else if (!isEnvSet(SERVICE_ID))  invalid.push("VITE_EMAILJS_SERVICE_ID");
    if (!RAW_TEMPLATE_ID)        missing.push("VITE_EMAILJS_TEMPLATE_ID");
    else if (!isEnvSet(TEMPLATE_ID)) invalid.push("VITE_EMAILJS_TEMPLATE_ID");
    if (!RAW_PUBLIC_KEY)         missing.push("VITE_EMAILJS_PUBLIC_KEY");
    else if (!isEnvSet(PUBLIC_KEY))  invalid.push("VITE_EMAILJS_PUBLIC_KEY");
    return {
        configured: EFFECTIVE.source !== "none",
        missing,
        invalid,
        values: {
            serviceId:  EFFECTIVE.serviceId,
            templateId: EFFECTIVE.templateId,
            publicKey:  EFFECTIVE.publicKey,
        },
        rawLengths: {
            serviceId:  String(RAW_SERVICE_ID  ?? "").length,
            templateId: String(RAW_TEMPLATE_ID ?? "").length,
            publicKey:  String(RAW_PUBLIC_KEY  ?? "").length,
        },
        source: EFFECTIVE.source,
    };
}

/** ★ v1.9.55/56: Log diagnóstico al cargar el módulo
 *  Muestra fuente efectiva (env | fallback | none) */
if (typeof window !== "undefined") {
    const diag = checkEmailJSConfig();
    const mask = (s: string) => s.length > 0
        ? `${s.slice(0, 8)}...${s.slice(-4)} (${s.length} chars)`
        : "(empty)";

    if (!diag.configured) {
        console.warn(
            "%c[notify] EmailJS no configurado",
            "background:#fbbf24;color:#000;padding:2px 6px;border-radius:3px;font-weight:bold",
            "\nFaltan (undefined):", diag.missing.length ? diag.missing : "ninguna",
            "\nInvalidas (valor presente pero malformado):", diag.invalid.length ? diag.invalid : "ninguna",
            "\nValores actuales (en runtime):",
            "\n  VITE_EMAILJS_SERVICE_ID :", mask(diag.values.serviceId),   "(raw:", diag.rawLengths.serviceId,  "chars)",
            "\n  VITE_EMAILJS_TEMPLATE_ID:", mask(diag.values.templateId),  "(raw:", diag.rawLengths.templateId, "chars)",
            "\n  VITE_EMAILJS_PUBLIC_KEY :", mask(diag.values.publicKey),   "(raw:", diag.rawLengths.publicKey,  "chars)",
            "\nPara activar emails:",
            "\n  OPCION A: Vercel -> Settings -> Environment Variables + redeploy",
            "\n  OPCION B: Edita FALLBACK_EMAILJS_CONFIG en src/lib/notify.ts",
        );
    } else {
        console.log(
            "%c[notify] EmailJS OK",
            "background:#10b981;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold",
            "Fuente:", diag.source,
            "\n  Service: ",  mask(diag.values.serviceId),
            "\n  Template:",  mask(diag.values.templateId),
            "\n  PublicKey:", mask(diag.values.publicKey),
        );
    }
}

export interface LeadEmailData {
    leadId?:         string;
    restaurantName?: string;
    userEmail?:      string;
    selectedPlan?:   string;        // basic | professional | premium | trial
    businessType?:   string;
    source?:         string;
    trialEndsAt?:    string;        // ISO
    status?:         string;
}

const PLAN_LABELS: Record<string, string> = {
    basic:        "Plan Plus (Básico) — 30€/mes",
    professional: "Plan Pro (Profesional) — 50€/mes",
    premium:      "Plan Premium — 99€/mes",
    trial:        "Trial 7 días",
};

const SOURCE_LABELS: Record<string, string> = {
    landing:    "Landing Page",
    pricing:    "Página de Planes",
    paywall:    "Bloqueo de Trial",
    onboarding: "Onboarding inicial",
    settings:   "Ajustes",
    floating:   "Botón flotante",
};

const BUSINESS_LABELS: Record<string, string> = {
    restaurante: "Restaurante",
    bar:         "Bar / Tapas",
    cafeteria:   "Cafetería",
    otro:        "Otro",
};

function escapeHtml(s: string): string {
    return String(s).replace(/[<>&"']/g, c =>
        ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] ?? c)
    );
}

function formatDate(iso: string | undefined): string {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
    } catch {
        return iso;
    }
}

function buildSubject(data: LeadEmailData): string {
    return `🚀 Nueva Solicitud de Contratación (Prueba 7 días) - ${data.restaurantName || "(sin nombre)"}`;
}

function buildHtmlBody(data: LeadEmailData): string {
    const now = new Date().toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
    const plan   = PLAN_LABELS[data.selectedPlan ?? ""]    ?? "—";
    const source = SOURCE_LABELS[data.source ?? ""]         ?? data.source ?? "—";
    const biz    = BUSINESS_LABELS[data.businessType ?? ""] ?? data.businessType ?? "—";
    return `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto">
            <div style="background:linear-gradient(135deg,#2563eb 0%,#7c3aed 100%);padding:20px 24px;border-radius:12px 12px 0 0">
                <h1 style="margin:0;color:white;font-size:20px">🚀 Nueva Solicitud de Contratación</h1>
                <p style="margin:6px 0 0 0;color:#dbeafe;font-size:13px">Prueba 7 días · ${escapeHtml(data.restaurantName || "(sin nombre)")}</p>
            </div>
            <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
                <h2 style="margin:0 0 16px 0;font-size:16px;color:#0f172a">Datos del contrato</h2>
                <table style="border-collapse:collapse;width:100%;font-size:13.5px">
                    <tr><td style="padding:8px 0;color:#64748b;width:170px">Nombre del Negocio / Local</td><td style="padding:8px 0;font-weight:600">${escapeHtml(data.restaurantName || "—")}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Tipo de negocio</td><td style="padding:8px 0;font-weight:600">${escapeHtml(biz)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Plan elegido</td><td style="padding:8px 0;font-weight:600">${escapeHtml(plan)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Email facilitado por el cliente</td><td style="padding:8px 0;font-weight:600"><a href="mailto:${escapeHtml(data.userEmail || "")}" style="color:#2563eb">${escapeHtml(data.userEmail || "—")}</a></td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Fecha y hora exacta de la solicitud</td><td style="padding:8px 0;font-weight:600">${escapeHtml(now)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Trial hasta</td><td style="padding:8px 0;font-weight:600">${escapeHtml(formatDate(data.trialEndsAt))}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Origen</td><td style="padding:8px 0;font-weight:600">${escapeHtml(source)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Lead ID (Firestore)</td><td style="padding:8px 0;font-family:monospace;font-size:11px">${escapeHtml(data.leadId || "—")}</td></tr>
                </table>
                <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">
                    Solicitud capturada por Riyad, asistente IA de MOZONA TPV. Email interno · Confidencial.
                </div>
            </div>
        </div>
    `;
}

function buildTextBody(data: LeadEmailData): string {
    const now = new Date().toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
    const plan   = PLAN_LABELS[data.selectedPlan ?? ""]    ?? data.selectedPlan ?? "—";
    const source = SOURCE_LABELS[data.source ?? ""]         ?? data.source ?? "—";
    const biz    = BUSINESS_LABELS[data.businessType ?? ""] ?? data.businessType ?? "—";
    return [
        `🚀 Nueva Solicitud de Contratación (Prueba 7 días) - ${data.restaurantName || "(sin nombre)"}`,
        "",
        `Nombre del Negocio / Local: ${data.restaurantName || "—"}`,
        `Tipo de negocio: ${biz}`,
        `Plan elegido: ${plan}`,
        `Email facilitado por el cliente: ${data.userEmail || "—"}`,
        `Fecha y hora exacta de la solicitud: ${now}`,
        `Trial hasta: ${formatDate(data.trialEndsAt)}`,
        `Origen: ${source}`,
        `Lead ID (Firestore): ${data.leadId || "—"}`,
        "",
        "Solicitud capturada por Riyad, asistente IA de MOZONA TPV. Email interno · Confidencial.",
    ].join("\n");
}

/** ★★★ FUNCIÓN PRINCIPAL ★★★
 *  Envía un email con los datos del lead al admin.
 *  Intenta EmailJS SDK si está configurado; si no, REST directo.
 *
 *  Devuelve {ok, error?, via: 'emailjs-sdk'|'emailjs-rest'|'noop'}.
 *  via='noop' significa que NO se envio (env vars faltantes).
 *  via='emailjs-sdk' o 'emailjs-rest' significan que SI se intento.
 *  NUNCA lanza excepción. */
export async function sendLeadEmail(data: LeadEmailData): Promise<{ ok: boolean; error?: string; via: string; statusCode?: number }> {
    // ★ v1.9.55: usar las versiones saneadas (trim + no undefined literal)
    // Si están vacías o malformadas, noop explícito
    if (!EMAILJS_CONFIGURED) {
        const diag = checkEmailJSConfig();
        const reason = diag.missing.length
            ? `faltan: ${diag.missing.join(", ")}`
            : `inválidas: ${diag.invalid.join(", ")}`;
        console.warn(
            "[notify] EmailJS no configurado. NO se envío email.",
            `\nVariables ${reason}`,
            "\nService: ", diag.values.serviceId.length, "chars (raw:", diag.rawLengths.serviceId, ")",
            "\nTemplate:", diag.values.templateId.length, "chars (raw:", diag.rawLengths.templateId, ")",
            "\nPubKey:   ", diag.values.publicKey.length, "chars (raw:", diag.rawLengths.publicKey, ")",
        );
        return {
            ok: false,
            error: `EmailJS no configurado (${reason})`,
            via: "noop",
        };
    }

    const serviceId  = EFFECTIVE.serviceId;
    const templateId = EFFECTIVE.templateId;
    const publicKey  = EFFECTIVE.publicKey;
    console.log(`[notify] usando credenciales desde: ${EFFECTIVE.source}`);

    const subject = buildSubject(data);
    const html    = buildHtmlBody(data);
    const text    = buildTextBody(data);

    const templateParams = {
        // Variables que la template de EmailJS puede usar ({{...}})
        to_email:      ADMIN_EMAIL_DEFAULT,
        to_name:       "Equipo MOZONA TPV",
        subject:       subject,
        message:       text,
        html_body:     html,
        // Datos individuales (útiles si la template los referencia)
        restaurant:    data.restaurantName || "",
        plan:          data.selectedPlan   || "",
        client_email:  data.userEmail      || "",
        lead_id:       data.leadId         || "",
        business_type: data.businessType   || "",
        source:        data.source         || "",
        trial_until:   data.trialEndsAt    || "",
    };

    // ★ v1.9.55: Camino 1: SDK EmailJS con propagación de error real
    try {
        const emailjs = await import("@emailjs/browser");
        const resp = await emailjs.send(serviceId, templateId, templateParams, {
            publicKey: publicKey,
        });
        console.log("[notify] EmailJS SDK OK:", resp?.status, resp?.text);
        return { ok: true, via: "emailjs-sdk", statusCode: resp?.status ?? 200 };
    } catch (e: any) {
        const status = e?.status ?? e?.response?.status;
        const text   = e?.text ?? e?.response?.text ?? e?.message ?? "Error";
        console.warn(
            "[notify] EmailJS SDK error:",
            `\n  status: ${status ?? "?"}`,
            `\n  text:   ${text}`,
            "\nIntentando fallback REST...",
        );
        // ★ NO degradar a noop: continuar al fallback REST con el mismo config
    }

    // ★ v1.9.55: Camino 2: REST API directo
    // Si EmailJS falla, propagamos el status y body exactos al UI
    try {
        const resp = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                service_id:  serviceId,
                template_id: templateId,
                user_id:     publicKey,
                template_params: templateParams,
                // ★ v1.9.48: from actualizado al dominio oficial
                from: "MOZONA TPV <noreply@mozonatpv.site>",
            }),
        });
        if (!resp.ok) {
            const body = await resp.text().catch(() => "");
            console.warn(
                "[notify] REST status",
                resp.status,
                "\n  body:",
                body.slice(0, 500),
            );
            return {
                ok: false,
                error: `EmailJS HTTP ${resp.status}: ${body.slice(0, 200) || resp.statusText}`,
                via: "emailjs-rest",
                statusCode: resp.status,
            };
        }
        console.log("[notify] EmailJS REST OK");
        return { ok: true, via: "emailjs-rest", statusCode: resp.status };
    } catch (e: any) {
        console.warn("[notify] REST error:", e?.message ?? e);
        return {
            ok: false,
            error: `EmailJS red: ${e?.message ?? "Error"}`,
            via: "emailjs-rest",
        };
    }
}

/** Helper: email del admin (privado, no se muestra en UI) */
export function getAdminEmail(): string {
    return (import.meta.env.VITE_NOTIFY_TO_EMAIL as string | undefined) || ADMIN_EMAIL_DEFAULT;
}

export { EMAILJS_CONFIGURED };
