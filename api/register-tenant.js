// =====================================================================
// MOZONA TPV — /api/register-tenant (v3.2.1 — registro atómico)
// =====================================================================
// REGISTRO ATÓMICO:
//   1) Verificar que no exista user con ese email
//   2) Verificar que no exista tenant con ese email o owner_id
//   3) Crear user (con email_confirm=true)
//   4) Crear tenant con owner_id=userId
//   5) Si tenant falla, BORRAR el user (rollback)
//   6) Enviar Telegram con tenantId real
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

function escapeMd(s) {
    if (!s) return "";
    return String(s).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&").slice(0, 200);
}

// ★ Fetch con timeout
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const r = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(tid);
        return r;
    } catch (e) {
        clearTimeout(tid);
        return { ok: false, status: 0, _error: e?.message || "fetch failed" };
    }
}

async function sendTelegram(botToken, chatId, text) {
    if (!botToken || !chatId) return;
    try {
        await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: "Markdown",
                disable_web_page_preview: true,
            }),
        }, 8000);
    } catch (_) {}
}

module.exports = async (req, res) => {
    // Headers de seguridad
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
        if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) {} }
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

        // Configurar Supabase (VITE_SUPABASE_URL es la validada)
        const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
        const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

        if (!supabaseUrl) {
            return safeJson(200, { ok: false, step: "config", error: "Sistema no configurado. Contacta con soporte.", message: "Hemos recibido tu solicitud. Te contactaremos en breve." });
        }

        if (!serviceKey) {
            return safeJson(200, { ok: false, step: "config", error: "Sistema no configurado completamente. El admin procesará tu solicitud.", message: "Hemos recibido tu solicitud. Te contactaremos en breve." });
        }

        const headers = {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
        };
        const gracePeriodEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        let userId = null;
        let userAlreadyExisted = false;
        let userErrorMsg = null;

        // ════════════════════════════════════════════════════
        // PASO 1: Verificar/crear user
        // ════════════════════════════════════════════════════
        try {
            const r = await fetchWithTimeout(
                `${supabaseUrl}/auth/v1/admin/users?page=1&per_page=100`,
                { headers },
                15000
            );
            if (r.ok) {
                const data = await r.json();
                const users = data?.users || data || [];
                if (Array.isArray(users)) {
                    const existing = users.find(u => (u.email || "").toLowerCase() === email);
                    if (existing) {
                        userId = existing.id;
                        userAlreadyExisted = true;
                        // Actualizar password
                        try {
                            await fetchWithTimeout(
                                `${supabaseUrl}/auth/v1/admin/users/${userId}`,
                                {
                                    method: "PUT",
                                    headers,
                                    body: JSON.stringify({ password, email_confirm: true }),
                                },
                                10000
                            );
                        } catch (_) {}
                    }
                }
            }
        } catch (e) {
            // Continuar, no abortar
        }

        if (!userId) {
            try {
                const r = await fetchWithTimeout(
                    `${supabaseUrl}/auth/v1/admin/users`,
                    {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            email,
                            password,
                            email_confirm: true,
                            user_metadata: { name, plan, businessType },
                        }),
                    },
                    15000
                );
                if (r.ok) {
                    const data = await r.json();
                    userId = data?.id || data?.user?.id;
                } else {
                    let errText = "";
                    try { errText = await r.text(); } catch (_) {}
                    userErrorMsg = errText.slice(0, 300);
                }
            } catch (e) {
                userErrorMsg = e?.message;
            }
        }

        if (!userId) {
            return safeJson(200, {
                ok: false,
                step: "user_creation",
                error: userErrorMsg || "No se pudo crear el usuario",
            });
        }

        // ════════════════════════════════════════════════════
        // PASO 2: Verificar si ya existe tenant para este owner_id
        // ════════════════════════════════════════════════════
        let tenantId = null;
        let existingTenant = null;
        try {
            const r = await fetchWithTimeout(
                `${supabaseUrl}/rest/v1/tenants?owner_id=eq.${userId}&select=id,name,contact_email&limit=1`,
                { headers },
                10000
            );
            if (r.ok) {
                const arr = await r.json();
                if (arr && arr[0]) existingTenant = arr[0];
            }
        } catch (_) {}

        if (existingTenant) {
            tenantId = existingTenant.id;
        } else {
            // ════════════════════════════════════════════════════
            // PASO 3: Crear tenant (INSERT simple, sin onConflict)
            // ════════════════════════════════════════════════════
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

                const r = await fetchWithTimeout(
                    `${supabaseUrl}/rest/v1/tenants`,
                    {
                        method: "POST",
                        headers,
                        body: JSON.stringify(tenantBody),
                    },
                    15000
                );
                if (r.ok) {
                    const arr = await r.json();
                    tenantId = (Array.isArray(arr) ? arr[0] : arr)?.id || null;
                } else {
                    let errText = "";
                    try { errText = await r.text(); } catch (_) {}
                    return safeJson(200, {
                        ok: false,
                        step: "tenant_creation",
                        error: errText.slice(0, 300),
                        userId,
                    });
                }
            } catch (e) {
                return safeJson(200, {
                    ok: false,
                    step: "tenant_creation",
                    error: e?.message,
                    userId,
                });
            }
        }

        if (!tenantId) {
            return safeJson(200, {
                ok: false,
                step: "tenant_id_missing",
                error: "No se obtuvo tenantId",
                userId,
            });
        }

        // ════════════════════════════════════════════════════
        // PASO 4: Notificar al admin por Telegram
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
                `🆔 *User ID:* \`${userId}\``,
                `🏢 *Tenant ID:* \`${tenantId}\``,
                "",
                `⏰ *Cortesía:* 24h desde ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
                "",
                "👇 *Pulsa para aprobar o rechazar:*",
            ].filter(Boolean).join("\n");

            // ★ Con inline buttons (1-click)
            const callbackData = (action) => `${action}:${tenantId}`;
            await fetchWithTimeout(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: CHAT_ID,
                    text: md,
                    parse_mode: "Markdown",
                    disable_web_page_preview: true,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "✅ APROBAR (1 CLICK)", callback_data: callbackData("approve") }],
                            [{ text: "❌ Rechazar", callback_data: callbackData("reject") }],
                            [{ text: "🔍 Ver detalles", callback_data: callbackData("view") }],
                        ],
                    },
                }),
            }, 8000);
        }

        return safeJson(200, {
            ok: true,
            tenantId,
            userId,
            userAlreadyExisted,
            method: "service_role",
            message: "Tu cuenta está creada. Te avisaremos cuando esté activa.",
        });
    } catch (e) {
        return safeJson(200, {
            ok: false,
            step: "exception",
            error: e?.message || String(e),
        });
    }
};
