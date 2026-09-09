// =====================================================================
// MOZONA TPV — /api/telegram-webhook (v3.0.8)
// =====================================================================
// Recibe updates del bot de Telegram.
// Procesa:
//   - callback_query de botones inline (approve, reject, view)
//   - comandos /approve y /reject por texto
// =====================================================================

let _securityLib = undefined;
function getSecurity() {
    if (_securityLib !== undefined) return _securityLib;
    try { _securityLib = require("./_security.js"); } catch (_) { _securityLib = null; }
    return _securityLib;
}

const SUPERADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";

// ★ Helper: enviar mensaje al chat
async function sendMessage(chatId, text, options = {}) {
    if (!BOT_TOKEN) return;
    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: "Markdown",
                ...options,
            }),
        });
    } catch (_) {}
}

// ★ Helper: responder a callback query
async function answerCallback(callbackQueryId, text, showAlert = false) {
    if (!BOT_TOKEN) return;
    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                callback_query_id: callbackQueryId,
                text,
                show_alert: showAlert,
            }),
        });
    } catch (_) {}
}

// ★ Aprobar tenant
async function approveTenant(tenantIdOrEmail, approvedBy = "telegram-admin") {
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const apiKey = SERVICE_KEY || ANON_KEY;
    if (!SUPABASE_URL || !apiKey) return { ok: false, error: "Supabase no configurado" };

    const headers = {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
    };

    // ★ Resolver tenantId si es email
    let targetTenantId = tenantIdOrEmail;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantIdOrEmail);
    if (!isUuid) {
        // Buscar por contact_email
        try {
            const r = await fetch(
                `${SUPABASE_URL}/rest/v1/tenants?contact_email=eq.${encodeURIComponent(tenantIdOrEmail)}&select=id&limit=1`,
                { headers }
            );
            if (r.ok) {
                const arr = await r.json();
                if (arr && arr[0]) targetTenantId = arr[0].id;
            }
        } catch (_) {}
        // Fallback heurístico
        if (!isUuid && targetTenantId === tenantIdOrEmail) {
            try {
                const r = await fetch(
                    `${SUPABASE_URL}/rest/v1/tenants?order=created_at.desc&limit=5`,
                    { headers }
                );
                if (r.ok) {
                    const arr = await r.json();
                    const match = arr.find(t => t.contact_email && t.contact_email.toLowerCase() === tenantIdOrEmail.toLowerCase());
                    if (match) targetTenantId = match.id;
                    else if (arr[0]) targetTenantId = arr[0].id;
                }
            } catch (_) {}
        }
    }

    if (!targetTenantId) {
        return { ok: false, error: "Tenant no encontrado" };
    }

    // ★ Actualizar
    try {
        const r = await fetch(
            `${SUPABASE_URL}/rest/v1/tenants?id=eq.${targetTenantId}`,
            {
                method: "PATCH",
                headers,
                body: JSON.stringify({
                    activation_status: "active_trial",
                    approved_at: new Date().toISOString(),
                    approved_by: approvedBy,
                    trial_ends_at: trialEndsAt,
                    updated_at: new Date().toISOString(),
                }),
            }
        );
        if (r.ok) {
            return { ok: true, tenantId: targetTenantId, trialEndsAt };
        }
        return { ok: false, error: await r.text() };
    } catch (e) {
        return { ok: false, error: e?.message };
    }
}

// ★ Rechazar tenant
async function rejectTenant(tenantIdOrEmail, reason = "rechazado") {
    const apiKey = SERVICE_KEY || ANON_KEY;
    if (!SUPABASE_URL || !apiKey) return { ok: false, error: "Supabase no configurado" };

    const headers = {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
    };

    let targetTenantId = tenantIdOrEmail;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantIdOrEmail);
    if (!isUuid) {
        try {
            const r = await fetch(
                `${SUPABASE_URL}/rest/v1/tenants?contact_email=eq.${encodeURIComponent(tenantIdOrEmail)}&select=id&limit=1`,
                { headers }
            );
            if (r.ok) {
                const arr = await r.json();
                if (arr && arr[0]) targetTenantId = arr[0].id;
            }
        } catch (_) {}
    }

    if (!targetTenantId) return { ok: false, error: "Tenant no encontrado" };

    try {
        const r = await fetch(
            `${SUPABASE_URL}/rest/v1/tenants?id=eq.${targetTenantId}`,
            {
                method: "PATCH",
                headers,
                body: JSON.stringify({
                    activation_status: "expired",
                    approved_by: "rejected-" + reason,
                    updated_at: new Date().toISOString(),
                }),
            }
        );
        if (r.ok) {
            return { ok: true, tenantId: targetTenantId };
        }
        return { ok: false, error: await r.text() };
    } catch (e) {
        return { ok: false, error: e?.message };
    }
}

module.exports = async (req, res) => {
    // ★ Headers de seguridad
    const sec = getSecurity();
    try { if (sec) sec.applySecurityHeaders(res); } catch (_) {}

    // CORS
    try {
        res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        if (req.method === "OPTIONS") return res.status(200).end();
    } catch (_) {}

    const safeJson = (status, payload) => {
        try { return res.status(status).json(payload); } catch (_) {}
    };

    try {
        let body = req.body || {};
        if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) {} }

        // ★ Procesar callback_query (botón inline)
        if (body.callback_query) {
            const cb = body.callback_query;
            const chatId = cb.message?.chat?.id;
            const data = cb.data || "";
            const [action, target] = data.split(":");

            if (chatId && String(chatId) === String(SUPERADMIN_CHAT_ID)) {
                if (action === "approve") {
                    const result = await approveTenant(target, "telegram-button");
                    if (result.ok) {
                        await answerCallback(cb.id, "✅ Aprobado: 7 días de trial activados");
                        await sendMessage(chatId, `✅ *Alta aprobada*\n\n🆔 \`${result.tenantId}\`\n⏰ Trial hasta: ${result.trialEndsAt.slice(0, 16).replace("T", " ")} UTC`, {
                            reply_markup: JSON.stringify({
                                inline_keyboard: [
                                    [{ text: "👁 Ir al panel admin", url: `https://www.mozonatpv.site/admin/approve?token=mozona-approve-2025` }],
                                ],
                            }),
                        });
                    } else {
                        await answerCallback(cb.id, `❌ Error: ${result.error}`, true);
                    }
                } else if (action === "reject") {
                    const result = await rejectTenant(target, "telegram-button");
                    if (result.ok) {
                        await answerCallback(cb.id, "❌ Rechazado");
                        await sendMessage(chatId, `❌ *Alta rechazada*\n\n🆔 \`${result.tenantId}\``);
                    } else {
                        await answerCallback(cb.id, `❌ Error: ${result.error}`, true);
                    }
                } else if (action === "view") {
                    await answerCallback(cb.id, "Abriendo panel admin...");
                    await sendMessage(chatId, `🔍 *Detalles del tenant*\n\n🆔 \`${target}\`\n\n👁 [Abrir panel admin](https://www.mozonatpv.site/admin/approve?token=mozona-approve-2025&email=${encodeURIComponent(target)})`);
                }
            } else {
                await answerCallback(cb.id, "No autorizado");
            }

            return safeJson(200, { ok: true });
        }

        // ★ Procesar mensaje de texto (comando /approve, /reject, /start)
        if (body.message) {
            const msg = body.message;
            const chatId = msg.chat?.id;
            const text = (msg.text || "").trim();

            if (String(chatId) !== String(SUPERADMIN_CHAT_ID)) {
                return safeJson(200, { ok: true, ignored: true });
            }

            if (text === "/start" || text === "/help") {
                await sendMessage(chatId, [
                    "🤖 *MOZONA TPV — Bot de administración*",
                    "",
                    "Cuando alguien se registra, recibes un mensaje con botones para aprobar/rechazar directamente.",
                    "",
                    "📋 *Comandos disponibles:*",
                    "`/approve <tenantId|email>` — Aprobar alta",
                    "`/reject <tenantId|email>` — Rechazar alta",
                    "`/pending` — Ver tenants pendientes",
                    "`/status` — Estado del sistema",
                    "",
                    "🌐 [Panel admin web](https://www.mozonatpv.site/admin/approve?token=mozona-approve-2025)",
                ].join("\n"));
            } else if (text === "/status") {
                const apiKey = SERVICE_KEY || ANON_KEY;
                const ok = !!(SUPABASE_URL && apiKey && BOT_TOKEN);
                await sendMessage(chatId, [
                    "📊 *Estado del sistema*",
                    "",
                    `Bot: ${BOT_TOKEN ? "✅" : "❌"}`,
                    `Supabase URL: ${SUPABASE_URL ? "✅" : "❌"}`,
                    `Service Role: ${SERVICE_KEY ? "✅" : "❌"}`,
                    `Anon Key: ${ANON_KEY ? "✅" : "❌"}`,
                ].join("\n"));
            } else if (text === "/pending") {
                const apiKey = SERVICE_KEY || ANON_KEY;
                if (SUPABASE_URL && apiKey) {
                    try {
                        const r = await fetch(
                            `${SUPABASE_URL}/rest/v1/tenants?activation_status=eq.pending_activation&select=id,name,contact_email,plan_selected,created_at&order=created_at.desc&limit=10`,
                            {
                                headers: {
                                    apikey: apiKey,
                                    Authorization: `Bearer ${apiKey}`,
                                },
                            }
                        );
                        if (r.ok) {
                            const arr = await r.json();
                            if (arr && arr.length > 0) {
                                const list = arr.map((t, i) =>
                                    `${i + 1}. *${t.name || "—"}* — \`${t.contact_email}\`\n   🆔 \`${t.id}\``
                                ).join("\n\n");
                                await sendMessage(chatId, `⏳ *Pendientes (${arr.length})*\n\n${list}\n\n✅ Para aprobar: \`/approve <id|email>\``);
                            } else {
                                await sendMessage(chatId, "✅ No hay tenants pendientes");
                            }
                        }
                    } catch (e) {
                        await sendMessage(chatId, `❌ Error: ${e?.message}`);
                    }
                } else {
                    await sendMessage(chatId, "❌ Supabase no configurado");
                }
            } else if (text.startsWith("/approve")) {
                const target = text.replace(/^\/approve\s+/, "").trim();
                if (!target) {
                    await sendMessage(chatId, "⚠️ Uso: `/approve <tenantId o email>`");
                } else {
                    const result = await approveTenant(target, "telegram-command");
                    if (result.ok) {
                        await sendMessage(chatId, `✅ *Aprobado*\n\n🆔 \`${result.tenantId}\`\n⏰ Trial hasta: ${result.trialEndsAt.slice(0, 16).replace("T", " ")} UTC`);
                    } else {
                        await sendMessage(chatId, `❌ Error: ${result.error}`);
                    }
                }
            } else if (text.startsWith("/reject")) {
                const target = text.replace(/^\/reject\s+/, "").trim();
                if (!target) {
                    await sendMessage(chatId, "⚠️ Uso: `/reject <tenantId o email>`");
                } else {
                    const result = await rejectTenant(target, "telegram-command");
                    if (result.ok) {
                        await sendMessage(chatId, `❌ *Rechazado*\n\n🆔 \`${result.tenantId}\``);
                    } else {
                        await sendMessage(chatId, `❌ Error: ${result.error}`);
                    }
                }
            } else if (text.startsWith("/setwebhook") && String(chatId) === String(SUPERADMIN_CHAT_ID)) {
                // ★ Comando admin para configurar el webhook
                const webhookUrl = `https://www.mozonatpv.site/api/telegram-webhook`;
                try {
                    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message", "callback_query"] }),
                    });
                    const json = await r.json();
                    if (json.ok) {
                        await sendMessage(chatId, `✅ Webhook configurado:\n${webhookUrl}`);
                    } else {
                        await sendMessage(chatId, `❌ Error: ${json.description}`);
                    }
                } catch (e) {
                    await sendMessage(chatId, `❌ Error: ${e?.message}`);
                }
            }
        }

        return safeJson(200, { ok: true });
    } catch (e) {
        return safeJson(200, { ok: false, error: e?.message });
    }
};
