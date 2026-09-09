// =====================================================================
// MOZONA TPV — /api/notify-telegram (v3.0.8 — con inline buttons)
// =====================================================================
// Notifica al admin via Telegram cuando hay un nuevo registro.
// Incluye botones inline para aprobar/rechazar directamente desde el chat.
// =====================================================================

let _securityLib = undefined;
function getSecurity() {
    if (_securityLib !== undefined) return _securityLib;
    try { _securityLib = require("./_security.js"); } catch (_) { _securityLib = null; }
    return _securityLib;
}

function escapeMd(s) {
    if (!s) return "";
    return String(s).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&").slice(0, 200);
}

module.exports = async (req, res) => {
    // ★ Headers de seguridad
    const sec = getSecurity();
    try { if (sec) sec.applySecurityHeaders(res); } catch (_) {}

    // CORS
    try {
        const origin = (req.headers && req.headers.origin) || "";
        const allowed = ["https://mozonatpv.site", "https://www.mozonatpv.site", "https://mozonatpv.vercel.app", "http://localhost:5173", "http://localhost:4173"];
        if (allowed.indexOf(origin) !== -1) res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        if (req.method === "OPTIONS") return res.status(200).end();
        if (req.method !== "POST") return res.status(200).json({ ok: false, error: "Method not allowed" });
    } catch (_) {}

    const safeJson = (status, payload) => {
        try { return res.status(status).json(payload); } catch (_) {}
    };

    const log = (...args) => {
        try { console.log("[notify-telegram]", ...args); } catch (_) {}
    };

    try {
        let body = req.body || {};
        if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) {} }

        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
        const CHAT_ID   = process.env.TELEGRAM_CHAT_ID || "";

        if (!BOT_TOKEN || !CHAT_ID) {
            log("Telegram no configurado");
            return safeJson(200, {
                ok: false,
                skipped: true,
                reason: "Telegram no configurado",
            });
        }

        const tenantId      = (body.tenantId || body.id || "").toString();
        const businessName  = (body.businessName || body.name || "—").toString();
        const contactEmail  = (body.contactEmail || body.email || "—").toString();
        const planSelected  = (body.planSelected || body.plan || "—").toString();
        const businessType  = (body.businessType || "").toString();
        const phone         = (body.phone || "").toString();
        const source        = (body.source || "api").toString();
        const signupError   = body.signupError || null;

        // ★ Construir mensaje
        const md = [
            "🆕 *Nueva solicitud de alta*",
            "",
            `👤 *Nombre:* ${escapeMd(businessName)}`,
            `📧 *Email:* \`${escapeMd(contactEmail)}\``,
            `📦 *Plan:* ${escapeMd(planSelected)}`,
            businessType ? `🏪 *Tipo:* ${escapeMd(businessType)}` : "",
            phone ? `📞 *Teléfono:* ${escapeMd(phone)}` : "",
            "",
            `🆔 *Tenant ID:* \`${tenantId || "—"}\``,
            `📡 *Origen:* ${escapeMd(source)}`,
            "",
            signupError ? `⚠️ *Error signup:* ${escapeMd(signupError)}` : "",
            "",
            "👇 *Pulsa para aprobar o rechazar:*",
        ].filter(Boolean).join("\n");

        // ★ Construir inline keyboard con botones
        // Telegram limita callback_data a 64 bytes
        const target = tenantId || contactEmail || "unknown";
        const callbackData = (action) => {
            const full = `${action}:${target}`;
            return full.length > 64 ? full.slice(0, 64) : full;
        };

        const inlineKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "✅ APROBAR (1 CLICK)", callback_data: callbackData("approve") },
                    ],
                    [
                        { text: "❌ Rechazar", callback_data: callbackData("reject") },
                    ],
                    [
                        { text: "🔍 Ver detalles", callback_data: callbackData("view") },
                    ],
                ],
            },
        };

        // ★ Enviar mensaje
        const sendUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        const sendResp = await fetch(sendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: md,
                parse_mode: "Markdown",
                disable_web_page_preview: true,
                ...inlineKeyboard,
            }),
        });

        const sendJson = await sendResp.json().catch(() => ({}));
        log("Telegram response:", sendJson.ok ? "ok" : "error", sendJson.description || "");

        return safeJson(200, {
            ok: !!sendJson.ok,
            telegram: sendJson,
            message: sendJson.ok ? "Notificación enviada con botones inline" : "Error al enviar",
        });
    } catch (e) {
        log("EXCEPTION:", e?.message || e);
        return safeJson(200, {
            ok: false,
            error: e?.message || String(e),
        });
    }
};
