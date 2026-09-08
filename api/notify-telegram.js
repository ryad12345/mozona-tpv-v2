// =====================================================================
// MOZONA TPV — /api/notify-telegram (v1.9.78)
// =====================================================================
// Endpoint serverless que envía notificaciones a Telegram via API oficial.
// API: https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage
//
// Configurar en Vercel (sin prefijo VITE_):
//   TELEGRAM_BOT_TOKEN = 1234567890:ABCdef... (BotFather)
//   TELEGRAM_CHAT_ID   = -1001234567890       (grupo o canal)
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
            configured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
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
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
        console.warn("[notify-telegram] env vars missing (skipped)");
        return safeJson(res, 200, {
            ok: false,
            skipped: true,
            reason: "TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no configuradas en Vercel",
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

    // ★★ Enviar a Telegram con timeout robusto ★★
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);

        const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

        const r = await fetch(telegramUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id:    CHAT_ID,
                text:       message,
                parse_mode: "Markdown",
                disable_web_page_preview: true,
            }),
            signal: controller.signal,
        });
        clearTimeout(timer);

        const responseText = await r.text().catch(() => "");
        let responseJson = null;
        try { responseJson = JSON.parse(responseText); } catch (_) { /* ignore */ }

        console.log("[notify-telegram] Telegram response:", r.status, responseText.substring(0, 200));

        if (!r.ok) {
            // ★ NO bloqueamos: log + 200 con error
            console.warn("[notify-telegram] Telegram HTTP error (no bloqueante):", r.status);
            return safeJson(res, 200, {
                ok: false,
                skipped: true,
                reason: "Telegram HTTP " + r.status + (responseJson?.description ? ": " + responseJson.description : ""),
                telegram_response: responseText.substring(0, 300),
                chat_id: CHAT_ID,
                duration_ms: Date.now() - startTime,
            });
        }

        return safeJson(res, 200, {
            ok: true,
            via: "telegram-bot",
            chat_id: CHAT_ID,
            message_id: responseJson?.result?.message_id,
            duration_ms: Date.now() - startTime,
        });
    } catch (e) {
        // ★★ TIMEOUT / NETWORK / cualquier error
        //     NUNCA devolvemos 500. Log + 200.
        console.error("[notify-telegram] CRASH (no bloqueante):", e && e.message);
        return safeJson(res, 200, {
            ok: false,
            skipped: true,
            reason: "Error al enviar Telegram: " + (e && e.message ? e.message : "Unknown"),
            chat_id: CHAT_ID,
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
        try { console.error("[notify-telegram] safeJson error:", e && e.message); } catch (_) {}
        return false;
    }
}

function escapeMarkdown(text) {
    // Escapar caracteres especiales de Markdown de Telegram
    return String(text || "").replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
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
            `📋 *Restaurante:* ${escapeMarkdown(name)}`,
            `📧 *Email:* ${escapeMarkdown(email)}`,
            `💼 *Plan:* ${escapeMarkdown(plan)}`,
            `📞 *Teléfono:* ${escapeMarkdown(phone)}`,
            `📍 *Dirección:* ${escapeMarkdown(address)}`,
            `🆔 *Tenant ID:* \`${escapeMarkdown(tenantId)}\``,
            `⏰ *Fecha:* ${escapeMarkdown(now)}`,
            "",
            "El cliente está en la sala de espera (24h de cortesía).",
            "Revisa el panel de SuperAdmin para aprobar y activar 7 días de trial.",
        ].join("\n");
    } catch (e) {
        return null;
    }
}
