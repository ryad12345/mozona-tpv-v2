// =====================================================================
// MOZONA TPV — /api/notify-whatsapp (v1.9.77)
// =====================================================================
// Endpoint serverless que envía notificaciones a WhatsApp via Green API.
// Configurar en Vercel (sin prefijo VITE_):
//   GREEN_API_ID_INSTANCE = 1234567890
//   GREEN_API_TOKEN       = abc123...
//   GREEN_API_PHONE       = 34644165153 (opcional, default)
//
// SIEMPRE responde 200 JSON. NUNCA falla para no bloquear el registro.
// =====================================================================

module.exports = async (req, res) => {
    const startTime = Date.now();

    // ★★ CORS + JSON content-type SIEMPRE ★★
    try {
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
        res.setHeader("Content-Type", "application/json");
    } catch (e) { /* silent */ }

    if (req.method === "OPTIONS") {
        try { res.status(200).end(); } catch (_) {}
        return;
    }

    // ★★ Liveness check ★★
    if (req.method === "GET" && req.url && req.url.indexOf("ping=1") !== -1) {
        return safeJson(res, 200, {
            ok: true,
            ping: true,
            runtime: process.version,
            configured: !!(process.env.GREEN_API_ID_INSTANCE && process.env.GREEN_API_TOKEN),
        });
    }

    if (req.method !== "POST") {
        return safeJson(res, 405, { ok: false, error: "Method not allowed" });
    }

    // ★★ Parse body defensivo ★★
    let body = req.body;
    if (typeof body === "string") {
        try { body = JSON.parse(body); }
        catch (e) {
            return safeJson(res, 200, { ok: false, skipped: true, reason: "Invalid JSON body" });
        }
    }
    body = body || {};

    // ★★ Verificar env vars ★★
    const ID_INSTANCE = process.env.GREEN_API_ID_INSTANCE;
    const TOKEN       = process.env.GREEN_API_TOKEN;
    const PHONE       = (process.env.GREEN_API_PHONE || "34644165153").replace(/\D/g, "");

    if (!ID_INSTANCE || !TOKEN) {
        console.warn("[notify-whatsapp] env vars missing (skipped)");
        return safeJson(res, 200, {
            ok: false,
            skipped: true,
            reason: "GREEN_API_ID_INSTANCE o GREEN_API_TOKEN no configuradas en Vercel",
        });
    }

    // ★★ Construir mensaje ★★
    const message = buildMessage(body);
    if (!message) {
        return safeJson(res, 200, {
            ok: false,
            skipped: true,
            reason: "Payload no contiene datos suficientes para construir mensaje",
            received_keys: Object.keys(body),
        });
    }

    // ★★ Enviar a Green API con timeout robusto ★★
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);

        // ★ Formato correcto de Green API
        // https://api.green-api.com waId3{ID}/sendMessage/{TOKEN}
        const greenApiUrl = `https://api.green-api.com waId3${ID_INSTANCE}/sendMessage/${TOKEN}`.replace(" waId3", "/waI").replace("d3", "d");

        const r = await fetch(greenApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chatId: `${PHONE}@c.us`,
                message: message,
            }),
            signal: controller.signal,
        });
        clearTimeout(timer);

        const responseText = await r.text().catch(() => "");
        console.log("[notify-whatsapp] Green API response:", r.status, responseText.substring(0, 200));

        if (!r.ok) {
            // ★ NO bloqueamos: log + 200 con error
            console.warn("[notify-whatsapp] Green API HTTP error (no bloqueante):", r.status);
            return safeJson(res, 200, {
                ok: false,
                skipped: true,
                reason: "Green API HTTP " + r.status,
                green_response: responseText.substring(0, 200),
                to: PHONE,
                duration_ms: Date.now() - startTime,
            });
        }

        return safeJson(res, 200, {
            ok: true,
            via: "green-api",
            to: PHONE,
            duration_ms: Date.now() - startTime,
            green_response: responseText.substring(0, 200),
        });
    } catch (e) {
        // ★★ TIMEOUT / NETWORK / cualquier error
        //     NUNCA devolvemos 500. Log + 200.
        console.error("[notify-whatsapp] CRASH (no bloqueante):", e && e.message);
        return safeJson(res, 200, {
            ok: false,
            skipped: true,
            reason: "Error al enviar WhatsApp: " + (e && e.message ? e.message : "Unknown"),
            to: PHONE,
            duration_ms: Date.now() - startTime,
        });
    }
};

// =====================================================================
// Helpers
// =====================================================================

function safeJson(res, status, body) {
    try {
        if (!res || res.headersSent || res.writableEnded) return false;
        if (typeof res.status !== "function") return false;
        res.status(status).json(body);
        return true;
    } catch (e) {
        try { console.error("[notify-whatsapp] safeJson error:", e && e.message); } catch (_) {}
        return false;
    }
}

function buildMessage(body) {
    try {
        const name    = body.businessName || body.name || "Restaurante sin nombre";
        const email   = body.contactEmail || body.email || "no proporcionado";
        const plan    = body.planSelected || body.plan || "basic";
        const phone   = body.phone || "—";
        const address = body.address || "—";
        const tenantId = body.tenantId || "—";
        const now = new Date().toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });

        return [
            "🚀 *Nueva alta en MOZONA TPV*",
            "",
            `📋 *Restaurante:* ${name}`,
            `📧 *Email:* ${email}`,
            `💼 *Plan:* ${plan}`,
            `📞 *Teléfono:* ${phone}`,
            `📍 *Dirección:* ${address}`,
            `🆔 *Tenant ID:* ${tenantId}`,
            `⏰ *Fecha:* ${now}`,
            "",
            "El cliente está en la sala de espera (24h de cortesía).",
            "Revisa el panel para aprobar y activar 7 días de trial.",
        ].join("\n");
    } catch (e) {
        return null;
    }
}
