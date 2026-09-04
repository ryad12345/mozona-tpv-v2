// =====================================================================
// MOZONA TPV — /api/send-email
// =====================================================================
// Vercel Serverless Function que actúa como proxy privado a EmailJS.
//
//   Cliente (navegador) --POST /api/send-email--> Esta función
//   Esta función --POST api.emailjs.com--> EmailJS
//
// Las credenciales (EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID,
// EMAILJS_PUBLIC_KEY) se leen del SERVIDOR (Vercel env vars) y
// NUNCA se exponen al cliente. El cliente solo envía los datos
// del lead (nombre, email, etc.).
//
// Para configurar:
//   Vercel → Settings → Environment Variables:
//     EMAILJS_SERVICE_ID   = service_xxx
//     EMAILJS_TEMPLATE_ID  = template_xxx
//     EMAILJS_PUBLIC_KEY   = xxx (NO necesita prefijo VITE_)
//     EMAILJS_TO_EMAIL     = rofixinsta@gmail.com (opcional)
//
// v1.9.57
// =====================================================================

// CORS: solo permitir requests desde mozonatpv.site
const ALLOWED_ORIGINS = [
    "https://mozonatpv.site",
    "https://www.mozonatpv.site",
    "https://mozonatpv.vercel.app",
    "http://localhost:5173",  // dev
    "http://localhost:4173",  // preview
];

function setCors(res, origin) {
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
}

function escapeHtml(s) {
    return String(s ?? "").replace(/[<>&"']/g, c =>
        ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] ?? c)
    );
}

const PLAN_LABELS = {
    basic:        "Plan Plus (Básico) — 30€/mes",
    professional: "Plan Pro (Profesional) — 50€/mes",
    premium:      "Plan Premium — 99€/mes",
    trial:        "Trial 7 días",
};
const SOURCE_LABELS = {
    landing:    "Landing Page",
    pricing:    "Página de Planes",
    paywall:    "Bloqueo de Trial",
    onboarding: "Onboarding inicial",
    settings:   "Ajustes",
    floating:   "Botón flotante",
};
const BUSINESS_LABELS = {
    restaurante: "Restaurante",
    bar:         "Bar / Tapas",
    cafeteria:   "Cafetería",
    otro:        "Otro",
};

function buildHtmlBody(d) {
    const now = new Date().toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
    const plan   = PLAN_LABELS[d.selectedPlan ?? ""]   ?? d.selectedPlan   ?? "—";
    const source = SOURCE_LABELS[d.source ?? ""]         ?? d.source         ?? "—";
    const biz    = BUSINESS_LABELS[d.businessType ?? ""] ?? d.businessType   ?? "—";
    return `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto">
            <div style="background:linear-gradient(135deg,#2563eb 0%,#7c3aed 100%);padding:20px 24px;border-radius:12px 12px 0 0">
                <h1 style="margin:0;color:white;font-size:20px">🚀 Nueva Solicitud de Contratación</h1>
                <p style="margin:6px 0 0 0;color:#dbeafe;font-size:13px">Prueba 7 días · ${escapeHtml(d.restaurantName || "(sin nombre)")}</p>
            </div>
            <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
                <h2 style="margin:0 0 16px 0;font-size:16px;color:#0f172a">Datos del contrato</h2>
                <table style="border-collapse:collapse;width:100%;font-size:13.5px">
                    <tr><td style="padding:8px 0;color:#64748b;width:170px">Nombre del Negocio / Local</td><td style="padding:8px 0;font-weight:600">${escapeHtml(d.restaurantName || "—")}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Tipo de negocio</td><td style="padding:8px 0;font-weight:600">${escapeHtml(biz)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Plan elegido</td><td style="padding:8px 0;font-weight:600">${escapeHtml(plan)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Email facilitado por el cliente</td><td style="padding:8px 0;font-weight:600"><a href="mailto:${escapeHtml(d.userEmail || "")}" style="color:#2563eb">${escapeHtml(d.userEmail || "—")}</a></td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Fecha y hora exacta de la solicitud</td><td style="padding:8px 0;font-weight:600">${escapeHtml(now)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Trial hasta</td><td style="padding:8px 0;font-weight:600">${escapeHtml(d.trialEndsAt ? new Date(d.trialEndsAt).toLocaleString("es-ES", { dateStyle: "long" }) : "—")}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Origen</td><td style="padding:8px 0;font-weight:600">${escapeHtml(source)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b">Lead ID</td><td style="padding:8px 0;font-family:monospace;font-size:11px">${escapeHtml(d.leadId || "—")}</td></tr>
                </table>
                <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">
                    Solicitud capturada por Riyad, asistente IA de MOZONA TPV. Email interno · Confidencial.
                </div>
            </div>
        </div>
    `;
}

function buildTextBody(d) {
    const now = new Date().toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
    const plan   = PLAN_LABELS[d.selectedPlan ?? ""]   ?? d.selectedPlan   ?? "—";
    const source = SOURCE_LABELS[d.source ?? ""]         ?? d.source         ?? "—";
    const biz    = BUSINESS_LABELS[d.businessType ?? ""] ?? d.businessType   ?? "—";
    return [
        `🚀 Nueva Solicitud de Contratación (Prueba 7 días) - ${d.restaurantName || "(sin nombre)"}`,
        "",
        `Nombre del Negocio / Local: ${d.restaurantName || "—"}`,
        `Tipo de negocio: ${biz}`,
        `Plan elegido: ${plan}`,
        `Email facilitado por el cliente: ${d.userEmail || "—"}`,
        `Fecha y hora exacta de la solicitud: ${now}`,
        `Trial hasta: ${d.trialEndsAt || "—"}`,
        `Origen: ${source}`,
        `Lead ID: ${d.leadId || "—"}`,
        "",
        "Solicitud capturada por Riyad, asistente IA de MOZONA TPV. Email interno · Confidencial.",
    ].join("\n");
}

function buildSubject(d) {
    return `🚀 Nueva Solicitud de Contratación (Prueba 7 días) - ${d.restaurantName || "(sin nombre)"}`;
}

export default async function handler(req, res) {
    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, "") || "";
    setCors(res, origin);

    // Preflight CORS
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    // ★ Leer credenciales del SERVIDOR (sin prefijo VITE_)
    const SERVICE_ID  = process.env.EMAILJS_SERVICE_ID;
    const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
    const PUBLIC_KEY  = process.env.EMAILJS_PUBLIC_KEY;
    const TO_EMAIL    = process.env.EMAILJS_TO_EMAIL || "rofixinsta@gmail.com";

    if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
        console.error("[api/send-email] EmailJS env vars missing on server:", {
            hasService: !!SERVICE_ID,
            hasTemplate: !!TEMPLATE_ID,
            hasKey: !!PUBLIC_KEY,
        });
        return res.status(500).json({
            ok: false,
            error: "Server misconfiguration: EmailJS env vars not set. Configure EMAILJS_* in Vercel.",
        });
    }

    // Parsear body
    let data;
    try {
        data = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch (e) {
        return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }

    // Validar campos mínimos
    if (!data || (!data.userEmail && !data.leadId)) {
        return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    const subject = buildSubject(data);
    const html    = buildHtmlBody(data);
    const text    = buildTextBody(data);

    const templateParams = {
        to_email:      TO_EMAIL,
        to_name:       "Equipo MOZONA TPV",
        subject:       subject,
        message:       text,
        html_body:     html,
        restaurant:    data.restaurantName || "",
        plan:          data.selectedPlan   || "",
        client_email:  data.userEmail      || "",
        lead_id:       data.leadId         || "",
        business_type: data.businessType   || "",
        source:        data.source         || "",
        trial_until:   data.trialEndsAt    || "",
    };

    // Llamada a EmailJS REST API (desde el servidor)
    try {
        const emailjsResp = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                service_id:     SERVICE_ID,
                template_id:    TEMPLATE_ID,
                user_id:        PUBLIC_KEY,
                template_params: templateParams,
            }),
        });

        const body = await emailjsResp.text().catch(() => "");

        if (!emailjsResp.ok) {
            console.error("[api/send-email] EmailJS error:", emailjsResp.status, body);
            return res.status(emailjsResp.status).json({
                ok: false,
                error: `EmailJS HTTP ${emailjsResp.status}: ${body.slice(0, 300)}`,
                statusCode: emailjsResp.status,
            });
        }

        console.log("[api/send-email] Email sent OK to", TO_EMAIL, "for lead", data.leadId);
        return res.status(200).json({
            ok: true,
            via: "vercel-proxy",
            to: TO_EMAIL,
            leadId: data.leadId,
        });
    } catch (e) {
        console.error("[api/send-email] Network error:", e);
        return res.status(502).json({
            ok: false,
            error: `Network error: ${e?.message ?? "Unknown"}`,
        });
    }
}
