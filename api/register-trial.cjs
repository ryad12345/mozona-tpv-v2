// =====================================================================
// MOZONA TPV — /api/register-trial (v1.9.86)
// =====================================================================
// Endpoint serverless que crea un usuario YA CONFIRMADO en Supabase
// usando la SERVICE_ROLE_KEY. Esto evita el problema de
// "Email not confirmed" que bloquea el signIn.
//
// REQUISITOS:
//   - SUPABASE_SERVICE_ROLE_KEY configurada en Vercel (sin prefijo VITE_)
//   - SUPABASE_URL o VITE_SUPABASE_URL
//
// FLUJO:
//   1) Cliente POST con { email, password, name, plan }
//   2) Server usa admin API para crear usuario con email_confirm: true
//   3) Server crea tenant con 24h de cortesia
//   4) Server dispara webhook Telegram
//   5) Server devuelve { userId, email, tenantId, success: true }
//
// El cliente debe hacer signIn con las credenciales DESPUES de
// recibir esta respuesta (porque admin API no devuelve access_token).
// =====================================================================

module.exports = async (req, res) => {
    const startTime = Date.now();

    // CORS
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
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Content-Type", "application/json");
    } catch (e) {}

    if (req.method === "OPTIONS") {
        try { res.status(200).end(); } catch (_) {}
        return;
    }

    if (req.method !== "POST") {
        return safeJson(res, 405, { ok: false, error: "POST only" });
    }

    // Body
    let body = req.body;
    if (typeof body === "string") {
        try { body = JSON.parse(body); }
        catch (e) {
            return safeJson(res, 200, { ok: false, error: "Invalid JSON" });
        }
    }
    body = body || {};
    const { email, password, name, plan, businessType } = body;

    if (!email || !password || !name) {
        return safeJson(res, 200, { ok: false, error: "Faltan campos obligatorios (email, password, name)" });
    }

    // Env vars
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    if (!SUPABASE_URL || !SERVICE_KEY) {
        return safeJson(res, 200, {
            ok: false,
            error: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY no esta configurada en Vercel. Anadela SIN prefijo VITE_.",
        });
    }

    let userId = null;
    let userAlreadyExists = false;

    // ★ Paso 1: Crear usuario con admin API (email_confirm: true)
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
            method: "POST",
            headers: {
                "apikey": SERVICE_KEY,
                "Authorization": `Bearer ${SERVICE_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                email: email.trim().toLowerCase(),
                password,
                email_confirm: true,  // ★ Auto-confirmar
                user_metadata: { full_name: name },
            }),
            signal: controller.signal,
        });
        clearTimeout(timer);

        const responseText = await resp.text().catch(() => "");
        let userData = null;
        try { userData = JSON.parse(responseText); } catch (_) {}

        if (resp.ok && userData && userData.id) {
            userId = userData.id;
            console.log("[register-trial] user creado:", userId);
        } else if (resp.status === 422 || /already|exists|registered/i.test(responseText)) {
            // El usuario ya existe, intentar obtener su id
            console.log("[register-trial] usuario ya existe, buscando...");
            userAlreadyExists = true;
            try {
                const listController = new AbortController();
                const listTimer = setTimeout(() => listController.abort(), 5000);
                const listResp = await fetch(
                    `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email.trim().toLowerCase())}`,
                    {
                        method: "GET",
                        headers: {
                            "apikey": SERVICE_KEY,
                            "Authorization": `Bearer ${SERVICE_KEY}`,
                        },
                        signal: listController.signal,
                    }
                );
                clearTimeout(listTimer);
                if (listResp.ok) {
                    const listData = await listResp.json();
                    if (listData.users && listData.users[0]) {
                        userId = listData.users[0].id;
                        // Tambien actualizar password y email_confirm
                        const updateController = new AbortController();
                        const updateTimer = setTimeout(() => updateController.abort(), 5000);
                        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
                            method: "PUT",
                            headers: {
                                "apikey": SERVICE_KEY,
                                "Authorization": `Bearer ${SERVICE_KEY}`,
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({ password, email_confirm: true }),
                            signal: updateController.signal,
                        });
                        clearTimeout(updateTimer);
                        console.log("[register-trial] usuario existente actualizado:", userId);
                    }
                }
            } catch (e) {
                console.warn("[register-trial] list/update error:", e && e.message);
            }
        } else {
            console.error("[register-trial] admin create error:", resp.status, responseText.substring(0, 300));
            return safeJson(res, 200, {
                ok: false,
                error: `Admin API HTTP ${resp.status}: ${responseText.substring(0, 300)}`,
            });
        }
    } catch (e) {
        console.error("[register-trial] admin create exception:", e);
        return safeJson(res, 200, {
            ok: false,
            error: "Error al crear usuario: " + (e && e.message ? e.message : "Unknown"),
        });
    }

    if (!userId) {
        return safeJson(res, 200, {
            ok: false,
            error: "No se pudo obtener el userId del usuario",
        });
    }

    // ★ Paso 2: Crear tenant con 24h de cortesia
    let tenantId = null;
    try {
        const graceEndsAt = new Date(Date.now() + 24 * 3600_000).toISOString();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const tenantResp = await fetch(`${SUPABASE_URL}/rest/v1/tenants`, {
            method: "POST",
            headers: {
                "apikey": SERVICE_KEY,
                "Authorization": `Bearer ${SERVICE_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "return=representation,resolution=merge-duplicates",
            },
            body: JSON.stringify({
                owner_id: userId,
                name: name,
                business_name: name,
                plan: plan || "basic",
                plan_selected: plan || "basic",
                contact_email: email,
                activation_status: "pending_activation",
                subscription_status: "pending_activation",
                grace_period_ends_at: graceEndsAt,
                trial_ends_at: graceEndsAt,
                onboarding_completed: false,
                business_type: businessType || null,
            }),
            signal: controller.signal,
        });
        clearTimeout(timer);

        const tenantText = await tenantResp.text().catch(() => "");
        let tenantData = null;
        try { tenantData = JSON.parse(tenantText); } catch (_) {}

        if (tenantResp.ok && tenantData && tenantData[0]) {
            tenantId = tenantData[0].id;
            console.log("[register-trial] tenant creado:", tenantId);
        } else {
            console.warn("[register-trial] tenant create error:", tenantResp.status, tenantText.substring(0, 200));
        }
    } catch (e) {
        console.warn("[register-trial] tenant exception:", e && e.message);
    }

    // ★ Paso 3: Disparar webhook Telegram (interno)
    try {
        const tgToken = process.env.TELEGRAM_BOT_TOKEN;
        const tgChatId = process.env.TELEGRAM_CHAT_ID;
        if (tgToken && tgChatId) {
            const now = new Date().toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
            const message = [
                "🚀 *Nueva alta en MOZONA TPV*",
                "",
                `📋 *Restaurante:* ${name}`,
                `📧 *Email:* ${email}`,
                `💼 *Plan:* ${plan || "basic"}`,
                `🆔 *Tenant:* \`${tenantId || "—"}\``,
                `👤 *User:* \`${userId}\``,
                `⏰ *Fecha:* ${now}`,
                "",
                "El cliente está en la sala de espera (24h de cortesía).",
                "Aprueba desde el panel para activar 7 días de trial.",
            ].join("\n");
            const tgController = new AbortController();
            const tgTimer = setTimeout(() => tgController.abort(), 4000);
            await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: tgChatId,
                    text: message,
                    parse_mode: "Markdown",
                    disable_web_page_preview: true,
                }),
                signal: tgController.signal,
            }).catch((e) => console.warn("[register-trial] tg error:", e && e.message));
            clearTimeout(tgTimer);
        }
    } catch (_) { /* silent */ }

    return safeJson(res, 200, {
        ok: true,
        userId,
        email: email.trim().toLowerCase(),
        name,
        plan: plan || "basic",
        tenantId,
        userAlreadyExists,
        duration_ms: Date.now() - startTime,
        message: userAlreadyExists
            ? "El usuario ya existia, se ha actualizado con email_confirm y la contrasena nueva"
            : "Usuario creado y confirmado. Ahora puedes hacer signIn con estas credenciales.",
    });
};

function safeJson(res, status, body) {
    try {
        if (!res || res.headersSent || typeof res.status !== "function") return false;
        res.status(status).json(body);
        return true;
    } catch (e) { return false; }
}
