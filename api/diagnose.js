// =====================================================================
// MOZONA TPV — /api/diagnose (v1.9.81)
// =====================================================================
// Endpoint que muestra el estado de las env vars (sin valores sensibles).
// Solo muestra las KEYS configuradas y longitudes, no los valores.
// =====================================================================

module.exports = async (req, res) => {
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
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Content-Type", "application/json");
    } catch (e) {}

    if (req.method === "OPTIONS") {
        try { res.status(200).end(); } catch (_) {}
        return;
    }

    if (req.method !== "GET") {
        return safeJson(res, 405, { ok: false, error: "GET only" });
    }

    // ★ Estado de cada env var (set, length, preview)
    const envStatus = {
        // Telegram
        TELEGRAM_BOT_TOKEN: {
            set: !!process.env.TELEGRAM_BOT_TOKEN,
            length: (process.env.TELEGRAM_BOT_TOKEN || "").length,
            preview: process.env.TELEGRAM_BOT_TOKEN
                ? process.env.TELEGRAM_BOT_TOKEN.substring(0, 6) + "..." + process.env.TELEGRAM_BOT_TOKEN.slice(-4)
                : "(no configurado)",
        },
        TELEGRAM_CHAT_ID: {
            set: !!process.env.TELEGRAM_CHAT_ID,
            length: (process.env.TELEGRAM_CHAT_ID || "").length,
            preview: process.env.TELEGRAM_CHAT_ID || "(no configurado)",
        },
        // Supabase
        SUPABASE_URL: {
            set: !!process.env.SUPABASE_URL,
            length: (process.env.SUPABASE_URL || "").length,
            preview: process.env.SUPABASE_URL
                ? process.env.SUPABASE_URL.replace(/\/\/.*@/, "//***@")
                : "(no configurado)",
        },
        SUPABASE_SERVICE_ROLE_KEY: {
            set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
            length: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").length,
            preview: process.env.SUPABASE_SERVICE_ROLE_KEY
                ? process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 6) + "..." + process.env.SUPABASE_SERVICE_ROLE_KEY.slice(-4)
                : "(no configurado)",
        },
        // VITE_ (cliente)
        VITE_SUPABASE_URL: {
            set: !!process.env.VITE_SUPABASE_URL,
            length: (process.env.VITE_SUPABASE_URL || "").length,
            preview: process.env.VITE_SUPABASE_URL
                ? process.env.VITE_SUPABASE_URL.replace(/\/\/.*@/, "//***@")
                : "(no configurado)",
        },
        VITE_SUPABASE_ANON_KEY: {
            set: !!process.env.VITE_SUPABASE_ANON_KEY,
            length: (process.env.VITE_SUPABASE_ANON_KEY || "").length,
            preview: process.env.VITE_SUPABASE_ANON_KEY
                ? process.env.VITE_SUPABASE_ANON_KEY.substring(0, 8) + "..."
                : "(no configurado)",
        },
    };

    // Resumen
    const summary = {
        telegram_ready: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
        supabase_admin_ready: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
        supabase_client_ready: !!(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY),
    };

    safeJson(res, 200, {
        ok: true,
        runtime: process.version,
        timestamp: new Date().toISOString(),
        env: envStatus,
        summary,
        instructions: !summary.telegram_ready
            ? "Telegram NO esta configurado. Anade TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en Vercel Dashboard > Settings > Environment Variables. SIN prefijo VITE_."
            : "Telegram OK. Los mensajes deberian llegar.",
    });
};

function safeJson(res, status, body) {
    try {
        if (!res || res.headersSent || typeof res.status !== "function") return false;
        res.status(status).json(body);
        return true;
    } catch (e) { return false; }
}
