// =====================================================================
// MOZONA TPV — /api/send-email  (v1.9.60)
// =====================================================================
// Serverless Function con TIMEOUT ESTRICTO garantizado.
//
// v1.9.60: setTimeout externo que FUERZA respuesta 504 a los 4s
// sin importar qué pase dentro del handler. Es la única forma
// de garantizar que la función NUNCA se queda colgada.
//
//   - El handler intenta hacer su trabajo normal
//   - Un setTimeout independiente corre en paralelo
//   - Si el handler termina primero: cancela el timer
//   - Si el timer termina primero: escribe respuesta 504
//
// Esto elimina el bug donde la función quedaba sin responder
// HTTP (ni 200, ni 500) dejando al cliente con spinner infinito.
// =====================================================================

const MAX_EXECUTION_MS = 4000; // 4 segundos duro

// ──────────────────── HELPERS (idempotentes) ────────────────────

function safeJson(res, status, body) {
    if (res.headersSent || res.writableEnded) return false;
    try {
        res.status(status).json(body);
        return true;
    } catch (e) {
        return false;
    }
}

function setCors(res, origin) {
    if (res.headersSent) return;
    const allowed = [
        "https://mozonatpv.site",
        "https://www.mozonatpv.site",
        "https://mozonatpv.vercel.app",
        "http://localhost:5173",
        "http://localhost:4173",
    ];
    try {
        if (allowed.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Access-Control-Max-Age", "86400");
    } catch (_) {}
}

function escapeHtml(s) {
    return String(s ?? "").replace(/[<>&"']/g, c =>
        ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] ?? c)
    );
}

const PLAN_LABELS = {
    basic: "Plan Plus (Básico) — 30€/mes",
    professional: "Plan Pro (Profesional) — 50€/mes",
    premium: "Plan Premium — 99€/mes",
    trial: "Trial 7 días",
};
const SOURCE_LABELS = {
    landing: "Landing Page", pricing: "Página de Planes", paywall: "Bloqueo de Trial",
    onboarding: "Onboarding inicial", settings: "Ajustes", floating: "Botón flotante",
};
const BUSINESS_LABELS = {
    restaurante: "Restaurante", bar: "Bar / Tapas", cafeteria: "Cafetería", otro: "Otro",
};

function buildHtmlBody(d) {
    const now = new Date().toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
    const plan = PLAN_LABELS[d.selectedPlan ?? ""] ?? d.selectedPlan ?? "—";
    const source = SOURCE_LABELS[d.source ?? ""] ?? d.source ?? "—";
    const biz = BUSINESS_LABELS[d.businessType ?? ""] ?? d.businessType ?? "—";
    return `<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto">
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
    </div>`;
}

function buildTextBody(d) {
    const now = new Date().toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
    return [
        `🚀 Nueva Solicitud de Contratación (Prueba 7 días) - ${d.restaurantName || "(sin nombre)"}`,
        "",
        `Nombre del Negocio / Local: ${d.restaurantName || "—"}`,
        `Tipo de negocio: ${BUSINESS_LABELS[d.businessType ?? ""] ?? d.businessType ?? "—"}`,
        `Plan elegido: ${PLAN_LABELS[d.selectedPlan ?? ""] ?? d.selectedPlan ?? "—"}`,
        `Email facilitado por el cliente: ${d.userEmail || "—"}`,
        `Fecha y hora exacta de la solicitud: ${now}`,
        `Trial hasta: ${d.trialEndsAt || "—"}`,
        `Origen: ${SOURCE_LABELS[d.source ?? ""] ?? d.source ?? "—"}`,
        `Lead ID: ${d.leadId || "—"}`,
        "",
        "Solicitud capturada por Riyad, asistente IA de MOZONA TPV.",
    ].join("\n");
}

function buildSubject(d) {
    return `🚀 Nueva Solicitud de Contratación (Prueba 7 días) - ${d.restaurantName || "(sin nombre)"}`;
}

// ──────────────────── HANDLER ────────────────────

export default async function handler(req, res) {
    // ★ v1.9.60: setTimeout ESTRICTO que FUERZA respuesta 504
    // Corre en paralelo. Si el handler no termina en 4s, este
    // timer escribe la respuesta y marca 'timedOut = true' para
    // que el handler sepa que su respuesta ya no es necesaria.
    let timedOut = false;
    const hardTimer = setTimeout(() => {
        timedOut = true;
        if (safeJson(res, 504, {
            ok: false,
            error: "Server timeout: la función tardó más de 4 segundos",
            statusCode: 504,
        })) {
            console.error("[api/send-email] HARD TIMEOUT (>4s) - respuesta forzada");
        }
        // Si headers ya enviados, intentar end() como último recurso
        if (!res.writableEnded) {
            try { res.end(); } catch (_) {}
        }
    }, MAX_EXECUTION_MS);

    try {
        await processRequest(req, res, () => timedOut);
    } catch (e) {
        console.error("[api/send-email] UNCAUGHT error:", e);
        if (!timedOut) {
            safeJson(res, 500, {
                ok: false,
                error: `Server error: ${e?.message ?? "Unknown"}`,
            });
        }
    } finally {
        // Cancelar el timer si el handler terminó a tiempo
        clearTimeout(hardTimer);
    }
}

async function processRequest(req, res, isTimedOut) {
    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, "") || "";
    setCors(res, origin);

    if (req.method === "OPTIONS") {
        safeJson(res, 200, { ok: true });
        return;
    }

    if (isTimedOut()) return;
    if (req.method !== "POST") {
        safeJson(res, 405, { ok: false, error: "Method not allowed" });
        return;
    }

    // Leer env vars del SERVIDOR
    const SERVICE_ID  = process.env.EMAILJS_SERVICE_ID;
    const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
    const PUBLIC_KEY  = process.env.EMAILJS_PUBLIC_KEY;
    const TO_EMAIL    = process.env.EMAILJS_TO_EMAIL || "rofixinsta@gmail.com";

    if (isTimedOut()) return;
    if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
        console.error("[api/send-email] EmailJS env vars missing on server");
        safeJson(res, 500, {
            ok: false,
            error: "Server misconfiguration: EmailJS env vars not set. Configure EMAILJS_* in Vercel.",
        });
        return;
    }

    // Parsear body
    let data;
    try {
        data = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch (e) {
        if (isTimedOut()) return;
        safeJson(res, 400, { ok: false, error: "Invalid JSON body" });
        return;
    }

    if (isTimedOut()) return;
    if (!data || (!data.userEmail && !data.leadId)) {
        safeJson(res, 400, { ok: false, error: "Missing required fields" });
        return;
    }

    const subject = buildSubject(data);
    const html    = buildHtmlBody(data);
    const text    = buildTextBody(data);

    const templateParams = {
        to_email:      TO_EMAIL,
        to_name:       "Equipo MOZONA TPV",
        subject, message: text, html_body: html,
        restaurant:    data.restaurantName || "",
        plan:          data.selectedPlan   || "",
        client_email:  data.userEmail      || "",
        lead_id:       data.leadId         || "",
        business_type: data.businessType   || "",
        source:        data.source         || "",
        trial_until:   data.trialEndsAt    || "",
    };

    // ★ v1.9.60: AbortController con timeout 3s para EmailJS
    // (maximo 3s para que quede margen antes del hard timer de 4s)
    const EMAILJS_TIMEOUT_MS = 3000;
    const controller = new AbortController();
    const emailTimer = setTimeout(() => controller.abort(), EMAILJS_TIMEOUT_MS);

    try {
        if (isTimedOut()) {
            clearTimeout(emailTimer);
            return;
        }

        const emailjsResp = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                service_id: SERVICE_ID,
                template_id: TEMPLATE_ID,
                user_id: PUBLIC_KEY,
                template_params: templateParams,
            }),
            signal: controller.signal,
        });
        clearTimeout(emailTimer);

        if (isTimedOut()) return;

        const body = await emailjsResp.text().catch(() => "");

        if (!emailjsResp.ok) {
            console.error("[api/send-email] EmailJS error:", emailjsResp.status, body);
            safeJson(res, emailjsResp.status, {
                ok: false,
                error: `EmailJS HTTP ${emailjsResp.status}: ${body.slice(0, 300)}`,
                statusCode: emailjsResp.status,
            });
            return;
        }

        console.log("[api/send-email] Email sent OK to", TO_EMAIL, "for lead", data.leadId);
        safeJson(res, 200, {
            ok: true,
            via: "vercel-proxy",
            to: TO_EMAIL,
            leadId: data.leadId,
        });
    } catch (e) {
        clearTimeout(emailTimer);
        if (isTimedOut()) return;

        if (e?.name === "AbortError") {
            console.error("[api/send-email] Timeout (>3s) al llamar a EmailJS");
            safeJson(res, 504, {
                ok: false,
                error: "Timeout: EmailJS no respondió en 3 segundos",
                statusCode: 504,
            });
            return;
        }
        console.error("[api/send-email] Network error:", e);
        safeJson(res, 502, {
            ok: false,
            error: `Network error: ${e?.message ?? "Unknown"}`,
        });
    }
}
