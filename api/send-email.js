// =====================================================================
// MOZONA TPV — /api/send-email  (v1.9.69 - ULTRA-ROBUSTO)
// =====================================================================
// Vercel Serverless Function. CommonJS puro. Sin imports externos.
// Try-catch global en module.exports. NUNCA crashea.
//
// ENDPOINTS:
//   GET  /api/send-email?ping=1   → Liveness check (no requiere env vars)
//   GET  /api/send-email?diag=1  → Estado de env vars (no envía email)
//   POST /api/send-email         → Envía email via EmailJS
//
// ENV VARS (en Vercel Dashboard, SIN prefijo VITE_):
//   EMAILJS_SERVICE_ID   = service_xxx
//   EMAILJS_TEMPLATE_ID  = template_xxx
//   EMAILJS_PUBLIC_KEY   = xxx
//   EMAILJS_TO_EMAIL     = rofixinsta@gmail.com (opcional)
// =====================================================================

"use strict";

// ★ Log de carga (para verificar en logs de Vercel)
try {
    console.log("[api/send-email] v1.9.69 loading, runtime:", typeof process !== "undefined" ? process.version : "unknown");
} catch (e) {}

var MAX_HARD_TIMER_MS = 4000;
var EMAILJS_TIMEOUT_MS = 3000;
var TO_EMAIL_DEFAULT   = "rofixinsta@gmail.com";

var PLAN_LABELS = {
    basic:        "Plan Plus (B\u00e1sico) \u2014 30\u20ac/mes",
    professional: "Plan Pro (Profesional) \u2014 50\u20ac/mes",
    premium:      "Plan Premium \u2014 99\u20ac/mes",
    trial:        "Trial 7 d\u00edas",
};
var SOURCE_LABELS = {
    landing: "Landing Page", pricing: "P\u00e1gina de Planes",
    paywall: "Bloqueo de Trial", onboarding: "Onboarding inicial",
    settings: "Ajustes", floating: "Bot\u00f3n flotante",
};
var BUSINESS_LABELS = {
    restaurante: "Restaurante", bar: "Bar / Tapas",
    cafeteria: "Cafeter\u00eda", otro: "Otro",
};

function safeJson(res, status, body) {
    try {
        if (!res || res.headersSent || res.writableEnded) return false;
        if (typeof res.status !== "function") return false;
        if (typeof res.json !== "function") return false;
        res.status(status).json(body);
        return true;
    } catch (e) {
        try { console.error("[api/send-email] safeJson error:", e && e.message); } catch (_) {}
        return false;
    }
}

function setCors(res, origin) {
    try {
        if (!res || res.headersSent) return;
        if (typeof res.setHeader !== "function") return;
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
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Access-Control-Max-Age", "86400");
    } catch (e) {
        try { console.error("[api/send-email] setCors error:", e && e.message); } catch (_) {}
    }
}

function escapeHtml(s) {
    try {
        return String(s == null ? "" : s).replace(/[<>&"']/g, function (c) {
            return ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c] || c;
        });
    } catch (e) { return ""; }
}

function buildHtmlBody(d) {
    try {
        var now = new Date().toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
        var plan = PLAN_LABELS[d.selectedPlan] || d.selectedPlan || "\u2014";
        var source = SOURCE_LABELS[d.source] || d.source || "\u2014";
        var biz = BUSINESS_LABELS[d.businessType] || d.businessType || "\u2014";
        return '<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto">' +
            '<div style="background:linear-gradient(135deg,#2563eb,#7c3aed);padding:20px 24px;border-radius:12px 12px 0 0">' +
            '<h1 style="margin:0;color:#fff;font-size:20px">\ud83d\ude80 Nueva Solicitud de Contrataci\u00f3n</h1>' +
            '<p style="margin:6px 0 0 0;color:#dbeafe;font-size:13px">Prueba 7 d\u00edas \u00b7 ' + escapeHtml(d.restaurantName || "(sin nombre)") + '</p>' +
            '</div>' +
            '<div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">' +
            '<h2 style="margin:0 0 16px 0;font-size:16px;color:#0f172a">Datos del contrato</h2>' +
            '<table style="border-collapse:collapse;width:100%;font-size:13.5px">' +
            '<tr><td style="padding:8px 0;color:#64748b;width:170px">Nombre del Negocio / Local</td><td style="padding:8px 0;font-weight:600">' + escapeHtml(d.restaurantName || "\u2014") + '</td></tr>' +
            '<tr><td style="padding:8px 0;color:#64748b">Tipo de negocio</td><td style="padding:8px 0;font-weight:600">' + escapeHtml(biz) + '</td></tr>' +
            '<tr><td style="padding:8px 0;color:#64748b">Plan elegido</td><td style="padding:8px 0;font-weight:600">' + escapeHtml(plan) + '</td></tr>' +
            '<tr><td style="padding:8px 0;color:#64748b">Email facilitado por el cliente</td><td style="padding:8px 0;font-weight:600"><a href="mailto:' + escapeHtml(d.userEmail || "") + '" style="color:#2563eb">' + escapeHtml(d.userEmail || "\u2014") + '</a></td></tr>' +
            '<tr><td style="padding:8px 0;color:#64748b">Fecha y hora exacta de la solicitud</td><td style="padding:8px 0;font-weight:600">' + escapeHtml(now) + '</td></tr>' +
            '<tr><td style="padding:8px 0;color:#64748b">Trial hasta</td><td style="padding:8px 0;font-weight:600">' + escapeHtml(d.trialEndsAt ? new Date(d.trialEndsAt).toLocaleString("es-ES", { dateStyle: "long" }) : "\u2014") + '</td></tr>' +
            '<tr><td style="padding:8px 0;color:#64748b">Origen</td><td style="padding:8px 0;font-weight:600">' + escapeHtml(source) + '</td></tr>' +
            '<tr><td style="padding:8px 0;color:#64748b">Lead ID</td><td style="padding:8px 0;font-family:monospace;font-size:11px">' + escapeHtml(d.leadId || "\u2014") + '</td></tr>' +
            '</table>' +
            '<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">Solicitud capturada por Riyad, asistente IA de MOZONA TPV. Email interno \u00b7 Confidencial.</div>' +
            '</div></div>';
    } catch (e) { return ""; }
}

function buildTextBody(d) {
    try {
        var now = new Date().toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
        return [
            "\ud83d\ude80 Nueva Solicitud de Contrataci\u00f3n (Prueba 7 d\u00edas) - " + (d.restaurantName || "(sin nombre)"),
            "",
            "Nombre del Negocio / Local: " + (d.restaurantName || "\u2014"),
            "Tipo de negocio: " + (BUSINESS_LABELS[d.businessType] || d.businessType || "\u2014"),
            "Plan elegido: " + (PLAN_LABELS[d.selectedPlan] || d.selectedPlan || "\u2014"),
            "Email facilitado por el cliente: " + (d.userEmail || "\u2014"),
            "Fecha y hora exacta de la solicitud: " + now,
            "Trial hasta: " + (d.trialEndsAt || "\u2014"),
            "Origen: " + (SOURCE_LABELS[d.source] || d.source || "\u2014"),
            "Lead ID: " + (d.leadId || "\u2014"),
            "",
            "Solicitud capturada por Riyad, asistente IA de MOZONA TPV.",
        ].join("\n");
    } catch (e) { return ""; }
}

function buildSubject(d) {
    try {
        return "\ud83d\ude80 Nueva Solicitud de Contrataci\u00f3n (Prueba 7 d\u00edas) - " + (d.restaurantName || "(sin nombre)");
    } catch (e) { return "Nueva Solicitud de Contrataci\u00f3n"; }
}

function getEnvStatus() {
    try {
        var serviceId  = (process && process.env && process.env.EMAILJS_SERVICE_ID)  || "";
        var templateId = (process && process.env && process.env.EMAILJS_TEMPLATE_ID) || "";
        var publicKey  = (process && process.env && process.env.EMAILJS_PUBLIC_KEY)  || "";
        var toEmail    = (process && process.env && process.env.EMAILJS_TO_EMAIL)    || TO_EMAIL_DEFAULT;
        return {
            serviceId:  serviceId,
            templateId: templateId,
            publicKey:  publicKey,
            toEmail:    toEmail,
            ready:      !!(serviceId && templateId && publicKey),
        };
    } catch (e) {
        return { serviceId: "", templateId: "", publicKey: "", toEmail: TO_EMAIL_DEFAULT, ready: false };
    }
}

// ────────── HANDLER (CommonJS) ──────────
// ★ v1.9.69: Wrappeado en try-catch a nivel de módulo.
// Si el handler crashea por cualquier razón, devolvemos JSON controlado.

var handler = async function handler(req, res) {
    var startTime = Date.now();
    try {
        console.log("[api/send-email] hit, method:", req && req.method, "url:", req && req.url);

        // ★ Validación defensiva de req/res
        if (!req || !res) {
            try { console.error("[api/send-email] req/res undefined"); } catch (_) {}
            return;
        }

        var origin = "";
        try { origin = req.headers && req.headers.origin ? req.headers.origin : ""; } catch (_) {}
        if (!origin) {
            try { origin = req.headers && req.headers.referer ? String(req.headers.referer).replace(/\/$/, "") : ""; } catch (_) {}
        }
        setCors(res, origin);

        if (req.method === "OPTIONS") {
            try { res.status(200).end(); } catch (e) {}
            return;
        }

        // ★ Endpoint de liveness (?ping=1)
        if (req.url && req.url.indexOf("ping=1") !== -1) {
            return safeJson(res, 200, {
                ok: true,
                ping: true,
                runtime: (typeof process !== "undefined" && process.version) || "unknown",
                uptime: Date.now() - startTime,
            });
        }

        // ★ Endpoint de diagnóstico (?diag=1)
        if (req.url && req.url.indexOf("diag=1") !== -1) {
            var st = getEnvStatus();
            return safeJson(res, 200, {
                ok: true,
                diag: true,
                runtime: (typeof process !== "undefined" && process.version) || "unknown",
                env: {
                    EMAILJS_SERVICE_ID:  { set: !!st.serviceId,  length: st.serviceId.length,  preview: st.serviceId  ? st.serviceId.substring(0, 8)  + "..." : "(vac\u00edo)" },
                    EMAILJS_TEMPLATE_ID: { set: !!st.templateId, length: st.templateId.length, preview: st.templateId ? st.templateId.substring(0, 8) + "..." : "(vac\u00edo)" },
                    EMAILJS_PUBLIC_KEY:  { set: !!st.publicKey,  length: st.publicKey.length,  preview: st.publicKey  ? st.publicKey.substring(0, 8)  + "..." : "(vac\u00edo)" },
                    EMAILJS_TO_EMAIL:    { set: !!(process && process.env && process.env.EMAILJS_TO_EMAIL), value: st.toEmail },
                },
                status: st.ready ? "READY" : "MISSING_ENV_VARS",
                instructions: st.ready
                    ? "EmailJS configurado. Los emails se enviar\u00e1n correctamente."
                    : "Configura las env vars en Vercel Dashboard \u2192 Settings \u2192 Environment Variables. SIN prefijo VITE_.",
            });
        }

        if (req.method !== "POST") {
            return safeJson(res, 405, {
                ok: false,
                error: "Method not allowed. Use POST para enviar email, GET ?ping=1 para liveness, GET ?diag=1 para diagn\u00f3stico.",
            });
        }

        var timedOut = false;
        var hardTimer = setTimeout(function () {
            timedOut = true;
            if (safeJson(res, 504, {
                ok: false,
                error: "Server timeout: la funci\u00f3n tard\u00f3 m\u00e1s de 4 segundos",
                statusCode: 504,
            })) {
                try { console.error("[api/send-email] HARD TIMEOUT (>4s) - 504 forzado"); } catch (_) {}
            }
            try { if (!res.writableEnded) res.end(); } catch (e) {}
        }, MAX_HARD_TIMER_MS);

        try {
            if (timedOut) return;

            var st = getEnvStatus();
            var SERVICE_ID  = st.serviceId;
            var TEMPLATE_ID = st.templateId;
            var PUBLIC_KEY  = st.publicKey;
            var TO_EMAIL    = st.toEmail;

            if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
                try {
                    console.error("[api/send-email] EmailJS env vars missing on server",
                        "SERVICE_ID:", !!SERVICE_ID,
                        "TEMPLATE_ID:", !!TEMPLATE_ID,
                        "PUBLIC_KEY:", !!PUBLIC_KEY);
                } catch (_) {}
                return safeJson(res, 500, {
                    ok: false,
                    error: "Server misconfiguration: EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY no est\u00e1n configuradas en Vercel. Sin prefijo VITE_.",
                    missing: {
                        EMAILJS_SERVICE_ID:  !SERVICE_ID,
                        EMAILJS_TEMPLATE_ID: !TEMPLATE_ID,
                        EMAILJS_PUBLIC_KEY:  !PUBLIC_KEY,
                    },
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

            if (timedOut) return;

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
                try { if (controller) controller.abort(); } catch (e) {}
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
                    try { console.error("[api/send-email] Timeout (>3s) EmailJS"); } catch (_) {}
                    return safeJson(res, 504, {
                        ok: false,
                        error: "Timeout: EmailJS no respondi\u00f3 en 3 segundos",
                        statusCode: 504,
                    });
                }
                try { console.error("[api/send-email] Network error:", e); } catch (_) {}
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
                try { console.error("[api/send-email] EmailJS error:", emailjsResp.status, String(body).substring(0, 200)); } catch (_) {}
                return safeJson(res, emailjsResp.status, {
                    ok: false,
                    error: "EmailJS HTTP " + emailjsResp.status + ": " + String(body).substring(0, 300),
                    statusCode: emailjsResp.status,
                });
            }

            try { console.log("[api/send-email] Email sent OK to", TO_EMAIL, "for lead", data.leadId); } catch (_) {}
            return safeJson(res, 200, {
                ok: true,
                via: "vercel-proxy",
                to: TO_EMAIL,
                leadId: data.leadId,
            });
        } catch (e) {
            try { console.error("[api/send-email] INNER error:", e && e.message); } catch (_) {}
            if (!timedOut) {
                return safeJson(res, 500, {
                    ok: false,
                    error: "Server error: " + (e && e.message ? e.message : "Unknown"),
                });
            }
        } finally {
            try { clearTimeout(hardTimer); } catch (_) {}
        }
    } catch (e) {
        // ★★★ CATCH GLOBAL A NIVEL DE HANDLER ★★★
        try { console.error("[api/send-email] HANDLER CRASH:", e && e.message, e && e.stack); } catch (_) {}
        try {
            if (res && !res.headersSent && typeof res.status === "function") {
                res.status(500).json({
                    ok: false,
                    error: "HANDLER CRASH: " + (e && e.message ? e.message : "Unknown"),
                });
            }
        } catch (_) {}
    }
};

// ★ v1.9.69: wrappeamos module.exports en try-catch
// Por si algo se rompe durante la exportaci\u00f3n
try {
    module.exports = handler;
} catch (e) {
    try { console.error("[api/send-email] EXPORT error:", e && e.message); } catch (_) {}
    // Fallback: handler que solo devuelve error
    module.exports = async function fallback(req, res) {
        try {
            if (res && !res.headersSent && typeof res.status === "function") {
                res.status(500).json({ ok: false, error: "FALLBACK: " + (e && e.message ? e.message : "Unknown") });
            }
        } catch (_) {}
    };
}
