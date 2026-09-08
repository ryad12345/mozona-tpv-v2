// =====================================================================
// MOZONA TPV — /api/register-tenant (v3.0.6 — fetch puro, sin supabase-js)
// =====================================================================
// REGISTRO COMPLETO usando SOLO fetch directo a las APIs REST de Supabase.
// No requiere @supabase/supabase-js, funciona con cualquier env vars.
// =====================================================================

let _rateLimitLib = undefined;
function getRateLimit() {
    if (_rateLimitLib !== undefined) return _rateLimitLib;
    try { _rateLimitLib = require("./_rateLimit.js"); } catch (_) { _rateLimitLib = null; }
    return _rateLimitLib;
}

let _securityLib = undefined;
function getSecurity() {
    if (_securityLib !== undefined) return _securityLib;
    try { _securityLib = require("./_security.js"); } catch (_) { _securityLib = null; }
    return _securityLib;
}

async function sendTelegram(botToken, chatId, text) {
    if (!botToken || !chatId) return;
    try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: "Markdown",
                disable_web_page_preview: true,
            }),
        });
    } catch (_) {}
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
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (req.method === "OPTIONS") return res.status(200).end();
        if (req.method !== "POST") return res.status(200).json({ ok: false, error: "Method not allowed" });
    } catch (_) {}

    const safeJson = (status, payload) => {
        try { return res.status(status).json(payload); } catch (_) {}
    };

    try {
        // Parsear body
        let body = req.body || {};
        if (typeof body === "string") {
            try { body = JSON.parse(body); } catch (_) {}
        }
        const email      = (body.email || "").toString().trim().toLowerCase();
        const password   = (body.password || "").toString();
        const name       = (body.name || body.businessName || "").toString().trim();
        const plan       = (body.plan || "basic").toString();
        const businessType = (body.businessType || "").toString().trim();
        const phone      = (body.phone || "").toString().trim();
        const address    = (body.address || "").toString().trim();

        if (!email || !password) {
            return safeJson(200, { ok: false, step: "validation", error: "Email y contraseña son obligatorios" });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return safeJson(200, { ok: false, step: "validation", error: "Formato de email inválido" });
        }
        if (password.length < 6) {
            return safeJson(200, { ok: false, step: "validation", error: "La contraseña debe tener al menos 6 caracteres" });
        }

        // Rate limit
        const rl = getRateLimit();
        if (rl) {
            const ip = rl.getClientIp(req);
            const limit = rl.rateLimit(`register:${ip}`, 5, 10 * 60 * 1000);
            if (!limit.allowed) {
                return safeJson(200, { ok: false, step: "rate_limit", error: "Demasiados intentos. Espera unos minutos.", retryAfterMs: limit.resetIn });
            }
        }

        // ★ Configurar Supabase
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
        const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
        const anonKey     = process.env.VITE_SUPABASE_ANON_KEY || "";

        if (!supabaseUrl) {
            return safeJson(200, { ok: false, step: "config", error: "Sistema no configurado. Contacta con soporte.", message: "Hemos recibido tu solicitud. Te contactaremos en breve." });
        }

        const apiKey = serviceKey || anonKey;
        const useServiceRole = !!serviceKey;
        const headers = {
            apikey: apiKey,
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
        };

        let userId = null;
        let userAlreadyExisted = false;
        let userErrorMsg = null;

        // ════════════════════════════════════════════════════
        // PASO 1: Crear o recuperar el usuario (con fetch puro)
        // ════════════════════════════════════════════════════
        if (useServiceRole) {
            // 1a) Listar users por email
            try {
                const r = await fetch(
                    `${supabaseUrl}/auth/v1/admin/users?page=1&per_page=50`,
                    { headers }
                );
                if (r.ok) {
                    const data = await r.json();
                    const users = data?.users || data || [];
                    const existing = Array.isArray(users) ? users.find(u => (u.email || "").toLowerCase() === email) : null;
                    if (existing) {
                        userId = existing.id;
                        userAlreadyExisted = true;
                        // 1b) Actualizar password
                        try {
                            await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
                                method: "PUT",
                                headers,
                                body: JSON.stringify({ password, email_confirm: true }),
                            });
                        } catch (_) {}
                    }
                }
            } catch (_) {}

            // 1c) Si no existe, crear
            if (!userId) {
                try {
                    const r = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            email,
                            password,
                            email_confirm: true,
                            user_metadata: { name, plan, businessType },
                        }),
                    });
                    if (r.ok) {
                        const data = await r.json();
                        userId = data?.id || data?.user?.id || null;
                    } else {
                        const errText = await r.text().catch(() => "");
                        userErrorMsg = errText.slice(0, 200);
                    }
                } catch (e) {
                    userErrorMsg = e?.message;
                }
            }
        } else {
            // Sin SERVICE_ROLE: intentar signUp con anon
            try {
                const r = await fetch(`${supabaseUrl}/auth/v1/signup`, {
                    method: "POST",
                    headers: { ...headers, apikey: anonKey, Authorization: `Bearer ${anonKey}` },
                    body: JSON.stringify({
                        email,
                        password,
                        options: {
                            emailRedirectTo: `${(req.headers && req.headers.origin) || "https://mozonatpv.site"}/auth/callback`,
                            data: { name, plan, businessType },
                        },
                    }),
                });
                if (r.ok) {
                    const data = await r.json();
                    userId = data?.id || data?.user?.id || null;
                } else {
                    const errText = await r.text().catch(() => "");
                    userErrorMsg = errText.slice(0, 200);
                    if (/already.*registered|user.*exists/i.test(userErrorMsg)) {
                        // No es error fatal, user ya existe
                    }
                }
            } catch (e) {
                userErrorMsg = e?.message;
            }
        }

        // ════════════════════════════════════════════════════
        // PASO 2: Crear o actualizar el tenant
        // ════════════════════════════════════════════════════
        let tenantId = null;
        let tenantErrorMsg = null;
        const gracePeriodEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        if (userId) {
            try {
                const tenantBody = {
                    owner_id: userId,
                    name: name || email.split("@")[0],
                    contact_email: email,
                    business_name: name || email.split("@")[0],
                    business_type: businessType || null,
                    plan_selected: plan,
                    plan: plan,
                    activation_status: "pending_activation",
                    grace_period_ends_at: gracePeriodEndsAt,
                    subscription_status: "active",
                    updated_at: new Date().toISOString(),
                };

                const r = await fetch(
                    `${supabaseUrl}/rest/v1/tenants?on_conflict=owner_id`,
                    {
                        method: "POST",
                        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
                        body: JSON.stringify(tenantBody),
                    }
                );
                if (r.ok) {
                    const arr = await r.json();
                    tenantId = (Array.isArray(arr) ? arr[0] : arr)?.id || null;
                } else {
                    tenantErrorMsg = await r.text().catch(() => "");
                }
            } catch (e) {
                tenantErrorMsg = e?.message;
            }
        }

        // ════════════════════════════════════════════════════
        // PASO 3: Notificar al admin por Telegram
        // ════════════════════════════════════════════════════
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
        const CHAT_ID   = process.env.TELEGRAM_CHAT_ID || "";
        if (BOT_TOKEN && CHAT_ID) {
            const md = [
                "🆕 *Nueva solicitud de alta*",
                "",
                `👤 *Nombre:* ${escapeMd(name) || "—"}`,
                `📧 *Email:* \`${escapeMd(email)}\``,
                `📦 *Plan:* ${escapeMd(plan)}`,
                businessType ? `🏪 *Tipo:* ${escapeMd(businessType)}` : "",
                phone ? `📞 *Teléfono:* ${escapeMd(phone)}` : "",
                "",
                `🆔 *User ID:* ${userId ? "`" + userId + "`" : "_no creado_"}`,
                `🏢 *Tenant ID:* ${tenantId ? "`" + tenantId + "`" : "_no creado_"}`,
                "",
                `⏰ *Cortesía:* 24h desde ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
                "",
                "✅ Para aprobar, responde:",
                `\`/approve ${tenantId || email}\``,
                "",
                "❌ Para rechazar:",
                `\`/reject ${tenantId || email}\``,
            ].filter(Boolean).join("\n");
            await sendTelegram(BOT_TOKEN, CHAT_ID, md);
        }

        return safeJson(200, {
            ok: true,
            tenantId,
            userId,
            userAlreadyExisted,
            method: useServiceRole ? "service_role" : "anon_key",
            userError: userErrorMsg,
            tenantError: tenantErrorMsg,
            message: tenantId
                ? "Tu cuenta está creada. Te avisaremos cuando esté activa."
                : "Hemos recibido tu solicitud. Te contactaremos pronto.",
        });
    } catch (e) {
        return safeJson(200, {
            ok: false,
            step: "exception",
            error: "Ha ocurrido un error. Inténtalo de nuevo.",
            debug: e?.message,
        });
    }
};
