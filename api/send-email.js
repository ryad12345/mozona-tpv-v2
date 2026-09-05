// =====================================================================
// MOZONA TPV — /api/send-email  (v1.9.70 - EXPORT LIMPIO NATIVO)
// =====================================================================
// Vercel Serverless Function. CommonJS puro nativo.
// Exportaci\u00f3n: module.exports = async (req, res) => { ... }
// SIN variables intermedias, SIN try-catch en module.exports.
// =====================================================================

module.exports = async (req, res) => {
    try {
        console.log("[send-email] hit", req.method, req.url);

        // CORS
        const origin = (req.headers && req.headers.origin) || "";
        const allowed = [
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

        // OPTIONS
        if (req.method === "OPTIONS") {
            res.status(200).end();
            return;
        }

        // GET ?ping=1 - Liveness check (no requiere env vars)
        if (req.method === "GET" && req.url && req.url.indexOf("ping=1") !== -1) {
            res.status(200).json({
                ok: true,
                ping: true,
                runtime: process.version,
            });
            return;
        }

        // GET ?diag=1 - Estado de env vars
        if (req.method === "GET" && req.url && req.url.indexOf("diag=1") !== -1) {
            const serviceId = process.env.EMAILJS_SERVICE_ID || "";
            const templateId = process.env.EMAILJS_TEMPLATE_ID || "";
            const publicKey = process.env.EMAILJS_PUBLIC_KEY || "";
            const toEmail = process.env.EMAILJS_TO_EMAIL || "rofixinsta@gmail.com";
            const ready = !!(serviceId && templateId && publicKey);
            res.status(200).json({
                ok: true,
                diag: true,
                runtime: process.version,
                env: {
                    EMAILJS_SERVICE_ID: { set: !!serviceId, length: serviceId.length, preview: serviceId ? serviceId.substring(0, 8) + "..." : "(vacio)" },
                    EMAILJS_TEMPLATE_ID: { set: !!templateId, length: templateId.length, preview: templateId ? templateId.substring(0, 8) + "..." : "(vacio)" },
                    EMAILJS_PUBLIC_KEY: { set: !!publicKey, length: publicKey.length, preview: publicKey ? publicKey.substring(0, 8) + "..." : "(vacio)" },
                    EMAILJS_TO_EMAIL: { set: !!process.env.EMAILJS_TO_EMAIL, value: toEmail },
                },
                status: ready ? "READY" : "MISSING_ENV_VARS",
                instructions: ready
                    ? "EmailJS configurado. Los emails se enviaran correctamente."
                    : "Configura las env vars en Vercel Dashboard > Settings > Environment Variables. SIN prefijo VITE_.",
            });
            return;
        }

        // Solo POST
        if (req.method !== "POST") {
            res.status(405).json({ ok: false, error: "Method not allowed" });
            return;
        }

        // Env vars
        const SERVICE_ID = process.env.EMAILJS_SERVICE_ID || "";
        const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID || "";
        const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY || "";
        const TO_EMAIL = process.env.EMAILJS_TO_EMAIL || "rofixinsta@gmail.com";

        if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
            console.error("[send-email] EmailJS env vars missing on server",
                "SERVICE_ID:", !!SERVICE_ID,
                "TEMPLATE_ID:", !!TEMPLATE_ID,
                "PUBLIC_KEY:", !!PUBLIC_KEY);
            res.status(500).json({
                ok: false,
                error: "Server misconfiguration: EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY no estan configuradas en Vercel. Sin prefijo VITE_.",
                missing: {
                    EMAILJS_SERVICE_ID: !SERVICE_ID,
                    EMAILJS_TEMPLATE_ID: !TEMPLATE_ID,
                    EMAILJS_PUBLIC_KEY: !PUBLIC_KEY,
                },
            });
            return;
        }

        // Body
        let data = req.body;
        if (typeof data === "string") {
            try { data = JSON.parse(data); }
            catch (e) {
                res.status(400).json({ ok: false, error: "Invalid JSON body" });
                return;
            }
        }
        if (!data || (!data.userEmail && !data.leadId)) {
            res.status(400).json({ ok: false, error: "Missing required fields" });
            return;
        }

        const restaurant = data.restaurantName || "(sin nombre)";
        const plan = data.selectedPlan || "trial";
        const email = data.userEmail || "";

        // Send via EmailJS
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);

        const resp = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
                service_id: SERVICE_ID,
                template_id: TEMPLATE_ID,
                user_id: PUBLIC_KEY,
                template_params: {
                    to_email: TO_EMAIL,
                    to_name: "Equipo MOZONA TPV",
                    subject: "Nueva Solicitud - " + restaurant,
                    message: "Restaurante: " + restaurant + "\nEmail: " + email + "\nPlan: " + plan,
                    restaurant: restaurant,
                    plan: plan,
                    client_email: email,
                    lead_id: data.leadId || "",
                },
            }),
        });
        clearTimeout(timer);

        const body = await resp.text();

        if (!resp.ok) {
            console.error("[send-email] EmailJS error:", resp.status, body.substring(0, 200));
            res.status(resp.status).json({
                ok: false,
                error: "EmailJS HTTP " + resp.status + ": " + body.substring(0, 300),
            });
            return;
        }

        console.log("[send-email] OK to", TO_EMAIL, "for", data.leadId);
        res.status(200).json({
            ok: true,
            via: "vercel-proxy",
            to: TO_EMAIL,
            leadId: data.leadId,
        });
    } catch (err) {
        console.error("[send-email] CRASH:", err && err.message, err && err.stack);
        try {
            if (res && !res.headersSent) {
                res.status(500).json({
                    ok: false,
                    error: "HANDLER CRASH: " + (err && err.message ? err.message : "Unknown"),
                });
            }
        } catch (_) {}
    }
};
