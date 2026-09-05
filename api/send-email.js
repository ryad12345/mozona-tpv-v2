// =====================================================================
// MOZONA TPV — /api/send-email  (v1.9.62 - versión definitiva)
// =====================================================================
// Vercel Serverless Function. CommonJS puro. Sin imports.
//
// Variables de entorno REQUERIDAS en Vercel (sin prefijo VITE_):
//   EMAILJS_SERVICE_ID   = service_xxx
//   EMAILJS_TEMPLATE_ID  = template_xxx
//   EMAILJS_PUBLIC_KEY   = xxx
//   EMAILJS_TO_EMAIL     = rofixinsta@gmail.com (opcional)
//
// Garantías:
//   - Log inmediato al primer statement
//   - OPTIONS preflight responde sin lógica
//   - Hard timer 4s fuerza 504 si todo cuelga
//   - AbortController 3s para EmailJS
//   - try-catch en cada await
//   - safeJson evita double-respond
//   - Devuelve SIEMPRE una respuesta HTTP
// =====================================================================

"use strict";

console.log("[api/send-email] module loaded, runtime:", process.version);

var MAX_HARD_TIMER_MS = 4000;
var EMAILJS_TIMEOUT_MS = 3000;
var TO_EMAIL_DEFAULT   = "rofixinsta@gmail.com";

function safeJson(res, status, body) {
    try {
        if (res.headersSent || res.writableEnded) return false;
        res.status(status).json(body);
        return true;
    } catch (e) {
        return false;
    }
}

function setCors(res, origin) {
    try {
        if (res.headersSent) return;
        var allowed = [
            "https://mozonatpv.site",
            "https://www.mozonatpv.site",
            "https://mozonatpv.vercel.app",
            "http://localhost:5173",
            "http://localhost:4173",
        ];
        if (allowed.indexOf(origin) !== -1) {
            res.setHeader("Access-Control-Allow-Origin", origin);
        }
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Access-Control-Max-Age", "86400");
    } catch (e) {}
}

function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[<>&"']/g, function (c) {
        switch (c) {
            case "<": return "&lt;";
            case ">": return "&gt;";
            case "&": return "&amp;";
            case '"': return "&quot;";
            case "'": return "&#39;";
        }
        return c;
    });
}

var PLAN_LABELS = {
    basic:        "Plan Plus (Básico) — 30€/mes",
    professional: "Plan Pro (Profesional) — 50€/mes",
    premium:      "Plan Premium — 99€/mes",
    trial:        "Trial 7 días",
};
var SOURCE_LABELS = {
    landing: "Landing Page", pricing: "Página de Planes",
    paywall: "Bloqueo de Trial", onboarding: "Onboarding inicial",
    settings: "Ajustes", floating: "Botón flotante",
};
var BUSINESS_LABELS = {
    restaurante: "Restaurante", bar: "Bar / Tapas",
    cafeteria: "Cafetería", otro: "Otro",
};

function buildHtmlBody(d) {
    var now = new Date().toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
    var plan = PLAN_LABELS[d.selectedPlan] || d.selectedPlan || "—";
    var source = SOURCE_LABELS[d.source] || d.source || "—";
    var biz = BUSINESS_LABELS[d.businessType] || d.businessType || "—";
    return '<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto">' +
        '<div style="background:linear-gradient(135deg,#2563eb,#7c3aed);padding:20px 24px;border-radius:12px 12px 0 0">' +
        '<h1 style="margin:0;color:#fff;font-size:20px">🚀 Nueva Solicitud de Contratación</h1>' +
        '<p style="margin:6px 0 0 0;color:#dbeafe;font-size:13px">Prueba 7 días · ' + escapeHtml(d.restaurantName || "(sin nombre)") + '</p>' +
        '</div>' +
        '<div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">' +
        '<h2 style="margin:0 0 16px 0;font-size:16px;color:#0f172a">Datos del contrato</h2>' +
        '<table style="border-collapse:collapse;width:100%;font-size:13.5px">' +
        '<tr><td style="padding:8px 0;color:#64748b;width:170px">Nombre del Negocio / Local</td><td style="padding:8px 0;font-weight:600">' + escapeHtml(d.restaurantName || "—") + '</td></tr>' +
        '<tr><td style="padding:8px 0;color:#64748b">Tipo de negocio</td><td style="padding:8px 0;font-weight:600">' + escapeHtml(biz) + '</td></tr>' +
        '<tr><td style="padding:8px 0;color:#64748b">Plan elegido</td><td style="padding:8px 0;font-weight:600">' + escapeHtml(plan) + '</td></tr>' +
        '<tr><td style="padding:8px 0;color:#64748b">Email facilitado por el cliente</td><td style="padding:8px 0;font-weight:600"><a href="mailto:' + escapeHtml(d.userEmail || "") + '" style="color:#2563eb">' + escapeHtml(d.userEmail || "—") + '</a></td></tr>' +
        '<tr><td style="padding:8px 0;color:#64748b">Fecha y hora exacta de la solicitud</td><td style="padding:8px 0;font-weight:600">' + escapeHtml(now) + '</td></tr>' +
        '<tr><td style="padding:8px 0;color:#64748b">Trial hasta</td><td style="padding:8px 0;font-weight:600">' + escapeHtml(d.trialEndsAt ? new Date(d.trialEndsAt).toLocaleString("es-ES", { dateStyle: "long" }) : "—") + '</td></tr>' +
        '<tr><td style="padding:8px 0;color:#64748b">Origen</td><td style="padding:8px 0;font-weight:600">' + escapeHtml(source) + '</td></tr>' +
        '<tr><td style="padding:8px 0;color:#64748b">Lead ID</td><td style="padding:8px 0;font-family:monospace;font-size:11px">' + escapeHtml(d.leadId || "—") + '</td></tr>' +
        '</table>' +
        '<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">Solicitud capturada por Riyad, asistente IA de MOZONA TPV. Email interno · Confidencial.</div>' +
        '</div></div>';
}

function buildTextBody(d) {
    var now = new Date().toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
    return [
        "🚀 Nueva Solicitud de Contratación (Prueba 7 días) - " + (d.restaurantName || "(sin nombre)"),
        "",
        "Nombre del Negocio / Local: " + (d.restaurantName || "—"),
        "Tipo de negocio: " + (BUSINESS_LABELS[d.businessType] || d.businessType || "—"),
        "Plan elegido: " + (PLAN_LABELS[d.selectedPlan] || d.selectedPlan || "—"),
        "Email facilitado por el cliente: " + (d.userEmail || "—"),
        "Fecha y hora exacta de la solicitud: " + now,
        "Trial hasta: " + (d.trialEndsAt || "—"),
        "Origen: " + (SOURCE_LABELS[d.source] || d.source || "—"),
        "Lead ID: " + (d.leadId || "—"),
        "",
        "Solicitud capturada por Riyad, asistente IA de MOZONA TPV.",
    ].join("\n");
}

function buildSubject(d) {
    return "🚀 Nueva Solicitud de Contratación (Prueba 7 días) - " + (d.restaurantName || "(sin nombre)");
}

// ────────── HANDLER (CommonJS) ──────────

module.exports = async function handler(req, res) {
    console.log("[api/send-email] hit, method:", req.method, "url:", req.url);

    var origin = req.headers.origin || (req.headers.referer ? req.headers.referer.replace(/\/$/, "") : "") || "";
    setCors(res, origin);

    // Preflight CORS: responde inmediatamente
    if (req.method === "OPTIONS") {
        try { res.status(200).end(); } catch (e) {}
        return;
    }

    if (req.method !== "POST") {
        return safeJson(res, 405, { ok: false, error: "Method not allowed" });
    }

    // Hard timer 4s
    var timedOut = false;
    var hardTimer = setTimeout(function () {
        timedOut = true;
        if (safeJson(res, 504, {
            ok: false,
            error: "Server timeout: la función tardó más de 4 segundos",
            statusCode: 504,
        })) {
            console.error("[api/send-email] HARD TIMEOUT (>4s) - 504 forzado");
        }
        if (!res.writableEnded) {
            try { res.end(); } catch (e) {}
        }
    }, MAX_HARD_TIMER_MS);

    try {
        if (timedOut) return;
        var SERVICE_ID  = process.env.EMAILJS_SERVICE_ID;
        var TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
        var PUBLIC_KEY  = process.env.EMAILJS_PUBLIC_KEY;
        var TO_EMAIL    = process.env.EMAILJS_TO_EMAIL || TO_EMAIL_DEFAULT;

        if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
            console.error("[api/send-email] EmailJS env vars missing on server");
            return safeJson(res, 500, {
                ok: false,
                error: "Server misconfiguration: EMAILJS_SERVICE_ID/TEMPLATE_ID/PUBLIC_KEY no están configuradas en Vercel.",
            });
        }

        if (timedOut) return;
        var data = req.body;
        if (typeof data === "string") {
            try { data = JSON.parse(data); } catch (e) {
                return safeJson(res, 400, { ok: false, error: "Invalid JSON body" });
            }
        }
        if (!data || (!data.userEmail && !data.leadId)) {
            return safeJson(res, 400, { ok: false, error: "Missing required fields (userEmail or leadId)" });
        }

        var subject = buildSubject(data);
        var html    = buildHtmlBody(data);
        var text    = buildTextBody(data);
        var templateParams = {
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

        if (timedOut) return;
        var controller = (typeof AbortController === "function") ? new AbortController() : null;
        var emailTimer = setTimeout(function () {
            if (controller) { try { controller.abort(); } catch (e) {} }
        }, EMAILJS_TIMEOUT_MS);

        var fetchOpts = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                service_id:     SERVICE_ID,
                template_id:    TEMPLATE_ID,
                user_id:        PUBLIC_KEY,
                template_params: templateParams,
            }),
        };
        if (controller) fetchOpts.signal = controller.signal;

        var emailjsResp;
        try {
            emailjsResp = await fetch("https://api.emailjs.com/api/v1.0/email/send", fetchOpts);
        } catch (e) {
            clearTimeout(emailTimer);
            if (timedOut) return;
            if (e && e.name === "AbortError") {
                console.error("[api/send-email] Timeout (>3s) EmailJS");
                return safeJson(res, 504, {
                    ok: false,
                    error: "Timeout: EmailJS no respondió en 3 segundos",
                    statusCode: 504,
                });
            }
            console.error("[api/send-email] Network error:", e);
            return safeJson(res, 502, {
                ok: false,
                error: "Network error: " + (e && e.message ? e.message : "Unknown"),
            });
        }
        clearTimeout(emailTimer);

        if (timedOut) return;

        var body = "";
        try { body = await emailjsResp.text(); } catch (e) {}

        if (!emailjsResp.ok) {
            console.error("[api/send-email] EmailJS error:", emailjsResp.status, body.substring(0, 200));
            return safeJson(res, emailjsResp.status, {
                ok: false,
                error: "EmailJS HTTP " + emailjsResp.status + ": " + body.substring(0, 300),
                statusCode: emailjsResp.status,
            });
        }

        console.log("[api/send-email] Email sent OK to", TO_EMAIL, "for lead", data.leadId);
        return safeJson(res, 200, {
            ok: true,
            via: "vercel-proxy",
            to: TO_EMAIL,
            leadId: data.leadId,
        });
    } catch (e) {
        console.error("[api/send-email] UNCAUGHT error:", e);
        if (!timedOut) {
            return safeJson(res, 500, {
                ok: false,
                error: "Server error: " + (e && e.message ? e.message : "Unknown"),
            });
        }
    } finally {
        clearTimeout(hardTimer);
    }
};
