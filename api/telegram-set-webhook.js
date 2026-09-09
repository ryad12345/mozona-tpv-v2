// =====================================================================
// MOZONA TPV — /api/telegram-set-webhook (v3.0.8)
// =====================================================================
// Configura el webhook del bot de Telegram para que apunte a
// /api/telegram-webhook en Vercel.
// =====================================================================

let _securityLib = undefined;
function getSecurity() {
    if (_securityLib !== undefined) return _securityLib;
    try { _securityLib = require("./_security.js"); } catch (_) { _securityLib = null; }
    return _securityLib;
}

module.exports = async (req, res) => {
    const sec = getSecurity();
    try { if (sec) sec.applySecurityHeaders(res); } catch (_) {}

    try {
        res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        if (req.method === "OPTIONS") return res.status(200).end();
    } catch (_) {}

    const safeJson = (status, payload) => {
        try { return res.status(status).json(payload); } catch (_) {}
    };

    try {
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
        if (!BOT_TOKEN) {
            return safeJson(200, { ok: false, error: "TELEGRAM_BOT_TOKEN no configurado" });
        }

        const host = (req.headers && req.headers.host) || "www.mozonatpv.site";
        const protocol = host.includes("localhost") ? "http" : "https";
        const webhookUrl = `${protocol}://${host}/api/telegram-webhook`;

        const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: webhookUrl,
                allowed_updates: ["message", "callback_query"],
            }),
        });

        const json = await r.json();
        return safeJson(200, {
            ok: !!json.ok,
            webhookUrl,
            telegram: json,
        });
    } catch (e) {
        return safeJson(200, { ok: false, error: e?.message });
    }
};
