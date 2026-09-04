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

const EMAILJS_CONFIGURED: boolean = !!(
    import.meta.env.VITE_EMAILJS_SERVICE_ID
    && import.meta.env.VITE_EMAILJS_TEMPLATE_ID
    && import.meta.env.VITE_EMAILJS_PUBLIC_KEY
);

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
 *  Devuelve {ok, error?} pero NUNCA lanza excepción. */
export async function sendLeadEmail(data: LeadEmailData): Promise<{ ok: boolean; error?: string; via: string }> {
    const serviceId  = import.meta.env.VITE_EMAILJS_SERVICE_ID   as string | undefined;
    const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID  as string | undefined;
    const publicKey  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY   as string | undefined;

    if (!serviceId || !templateId || !publicKey) {
        // Sin env vars, no podemos enviar. No-op silencioso (no rompe la UI).
        console.warn("[notify] EmailJS no configurado. Define VITE_EMAILJS_* en Vercel.");
        return { ok: true, via: "noop" };
    }

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

    // ★ Camino 1: SDK EmailJS (mejor experiencia en navegadores modernos)
    if (EMAILJS_CONFIGURED) {
        try {
            // Carga dinámica: si EmailJS falla, el bundle principal sigue OK
            const emailjs = await import("@emailjs/browser");
            const resp = await emailjs.send(serviceId, templateId, templateParams, {
                publicKey: publicKey,
            });
            console.log("[notify] EmailJS OK:", resp?.status, resp?.text);
            return { ok: true, via: "emailjs-sdk" };
        } catch (e: any) {
            console.warn("[notify] EmailJS SDK falló, intento REST:", e?.message ?? e);
            // Continúa al fallback REST
        }
    }

    // ★ Camino 2: REST API directo
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
            console.warn("[notify] REST status", resp.status, body.slice(0, 200));
            return { ok: false, error: `HTTP ${resp.status}`, via: "emailjs-rest" };
        }
        console.log("[notify] EmailJS REST OK");
        return { ok: true, via: "emailjs-rest" };
    } catch (e: any) {
        console.warn("[notify] REST error:", e?.message ?? e);
        return { ok: false, error: e?.message ?? "Error", via: "emailjs-rest" };
    }
}

/** Helper: email del admin (privado, no se muestra en UI) */
export function getAdminEmail(): string {
    return (import.meta.env.VITE_NOTIFY_TO_EMAIL as string | undefined) || ADMIN_EMAIL_DEFAULT;
}

export { EMAILJS_CONFIGURED };
