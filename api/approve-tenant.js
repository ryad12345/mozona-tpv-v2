// =====================================================================
// MOZONA TPV — /api/approve-tenant (v3.0.0)
// =====================================================================
// Aprueba un tenant y le concede 7 días de trial.
// Acceso por:
//   - Header x-admin-email: rofixinsta@gmail.com
//   - Token en query: ?token=XXX
//   - Telegram webhook (futuro)
// =====================================================================

const { createClient } = require("@supabase/supabase-js");

const SUPERADMIN_EMAIL = "rofixinsta@gmail.com";
const VALID_TOKENS = new Set([
    "mozona-approve-2025", // Token de admin
    "mozona-ryad-2025",    // Token de Riyad
]);

module.exports = async (req, res) => {
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
        res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-admin-email");
        if (req.method === "OPTIONS") return res.status(200).end();
    } catch (_) {}

    const safeJson = (status, payload) => {
        try { return res.status(status).json(payload); } catch (_) {}
    };

    const log = (...args) => {
        try { console.log("[approve-tenant]", ...args); } catch (_) {}
    };

    try {
        // ★ Verificar autorización
        const adminEmail = (req.headers && req.headers["x-admin-email"] || "").toString().toLowerCase();
        const token = (req.query && req.query.token || "").toString();

        const isAuthorized =
            adminEmail === SUPERADMIN_EMAIL ||
            VALID_TOKENS.has(token);

        if (!isAuthorized) {
            return safeJson(403, { ok: false, error: "No autorizado" });
        }

        // ★ Parsear body
        let body = req.body || {};
        if (typeof body === "string") {
            try { body = JSON.parse(body); } catch (_) {}
        }

        const tenantId = (body.tenantId || req.query?.tenantId || "").toString();
        const email    = (body.email    || req.query?.email    || "").toString().trim().toLowerCase();
        const approvedBy = (body.approvedBy || "superadmin").toString();

        if (!tenantId && !email) {
            return safeJson(400, { ok: false, error: "tenantId o email requerido" });
        }

        // ★ Configurar Supabase
        const supabaseUrl = process.env.SUPABASE_URL
                         || process.env.VITE_SUPABASE_URL
                         || "";
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

        if (!supabaseUrl || !serviceKey) {
            return safeJson(500, { ok: false, error: "Supabase no configurado" });
        }

        const adminClient = createClient(supabaseUrl, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // ★ Calcular trial_ends_at
        const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        // ★ Si no hay tenantId, buscar por email
        let targetTenantId = tenantId;
        if (!targetTenantId && email) {
            const { data: users } = await adminClient.auth.admin.listUsers();
            const user = users?.users?.find(u => (u.email || "").toLowerCase() === email);
            if (user) {
                const { data: tenants } = await adminClient
                    .from("tenants")
                    .select("id")
                    .eq("owner_id", user.id)
                    .limit(1);
                if (tenants && tenants[0]) {
                    targetTenantId = tenants[0].id;
                }
            }
        }

        if (!targetTenantId) {
            return safeJson(404, { ok: false, error: "Tenant no encontrado" });
        }

        // ★ Actualizar tenant a active_trial
        const { data: updated, error: updateErr } = await adminClient
            .from("tenants")
            .update({
                activation_status: "active_trial",
                trial_ends_at: trialEndsAt,
                approved_at: new Date().toISOString(),
                approved_by: approvedBy,
                updated_at: new Date().toISOString(),
            })
            .eq("id", targetTenantId)
            .select("id, name, owner_id, activation_status, trial_ends_at")
            .single();

        if (updateErr) {
            log("update error:", updateErr.message);
            return safeJson(500, { ok: false, error: updateErr.message });
        }

        log("tenant aprobado:", updated.id, "trial hasta:", trialEndsAt);

        // ★ Notificar al admin por Telegram
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
        const CHAT_ID   = process.env.TELEGRAM_CHAT_ID || "";
        if (BOT_TOKEN && CHAT_ID) {
            try {
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        chat_id: CHAT_ID,
                        text: `✅ *Alta aprobada*\n\n` +
                              `🏢 ${updated.name}\n` +
                              `🆔 \\`${updated.id}\\`\n` +
                              `👤 Owner: \\`${updated.owner_id}\\`\n` +
                              `⏰ Trial hasta: ${trialEndsAt.slice(0, 16).replace("T", " ")} UTC\n\n` +
                              `_7 días de prueba activados._`,
                        parse_mode: "Markdown",
                    }),
                });
            } catch (_) {}
        }

        return safeJson(200, {
            ok: true,
            tenant: updated,
            trialEndsAt,
            message: "Alta aprobada, 7 días de trial activados.",
        });
    } catch (e) {
        log("EXCEPTION:", e?.message || e);
        return safeJson(500, { ok: false, error: e?.message || String(e) });
    }
};
