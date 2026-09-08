// =====================================================================
// MOZONA TPV — /api/approve-tenant (v3.0.2)
// =====================================================================// Aprueba un tenant y le concede 7 días de trial.
// Acceso por:
//   - Header x-admin-email: rofixinsta@gmail.com
//   - Token en query: ?token=XXX
//
// SIEMPRE devuelve 200 con JSON (nunca 500, nunca HTML).
// Si no hay SERVICE_ROLE, intenta con ANON (funciona si RLS está
// deshabilitado). Si nada funciona, devuelve instrucciones claras
// para hacerlo manualmente en Supabase Dashboard.
// =====================================================================

const SUPERADMIN_EMAIL = "rofixinsta@gmail.com";
const VALID_TOKENS = new Set([
    "mozona-approve-2025",
    "mozona-ryad-2025",
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
            return safeJson(200, { ok: false, error: "No autorizado" });
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
            return safeJson(200, {
                ok: false,
                error: "tenantId o email requerido",
                instructions: "POST con { tenantId } o { email } + header x-admin-email o ?token=mozona-approve-2025",
            });
        }

        // ★ Configurar Supabase
        const supabaseUrl = process.env.SUPABASE_URL
                         || process.env.VITE_SUPABASE_URL
                         || "";
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
        const anonKey   = process.env.VITE_SUPABASE_ANON_KEY || "";

        if (!supabaseUrl) {
            return safeJson(200, {
                ok: false,
                error: "Supabase URL no configurada en Vercel",
                instructions: "Configurar VITE_SUPABASE_URL en Vercel Dashboard",
            });
        }

        const apiKey = serviceKey || anonKey;
        const useServiceRole = !!serviceKey;
        const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        // ★ Si no hay SERVICE_ROLE, intentar con ANON directamente
        //   (funciona si RLS está deshabilitado o permisivo)
        const headers = {
            apikey: apiKey,
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
        };

        // ★ Resolver tenantId si solo tenemos email
        let targetTenantId = tenantId;
        if (!targetTenantId && email) {
            // Buscar el tenant por contact_email
            try {
                const r = await fetch(
                    `${supabaseUrl}/rest/v1/tenants?contact_email=eq.${encodeURIComponent(email)}&select=id,name&limit=1`,
                    { headers }
                );
                if (r.ok) {
                    const arr = await r.json();
                    if (arr && arr[0]) {
                        targetTenantId = arr[0].id;
                        log("tenant encontrado por contact_email:", targetTenantId);
                    }
                } else {
                    // Fallback: buscar el más reciente
                    const r2 = await fetch(
                        `${supabaseUrl}/rest/v1/tenants?order=created_at.desc&limit=5`,
                        { headers }
                    );
                    if (r2.ok) {
                        const arr = await r2.json();
                        const match = arr.find(t => t.contact_email && t.contact_email.toLowerCase() === email);
                        if (match) {
                            targetTenantId = match.id;
                        } else if (arr[0]) {
                            targetTenantId = arr[0].id;
                            log("tenant encontrado por heuristica:", targetTenantId);
                        }
                    }
                }
            } catch (e) {
                log("error buscando tenant:", e?.message);
            }
        }

        if (!targetTenantId) {
            return safeJson(200, {
                ok: false,
                error: "Tenant no encontrado. Verifica que el email es correcto.",
                email,
                manualInstructions: {
                    step1: "Ve a https://supabase.com/dashboard",
                    step2: "Table Editor → tenants",
                    step3: `Busca la fila con contact_email = "${email}"`,
                    step4: "Cambia activation_status de 'pending_activation' a 'active_trial'",
                    step5: `Rellena trial_ends_at con: ${trialEndsAt}`,
                    step6: "Guarda los cambios",
                },
            });
        }

        // ★ Actualizar tenant
        const updateBody = {
            activation_status: "active_trial",
            approved_at: new Date().toISOString(),
            approved_by: approvedBy,
            trial_ends_at: trialEndsAt,
            updated_at: new Date().toISOString(),
        };

        let updated = null;
        let updateErr = null;
        try {
            const r = await fetch(
                `${supabaseUrl}/rest/v1/tenants?id=eq.${targetTenantId}`,
                {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify(updateBody),
                }
            );
            if (r.ok) {
                const arr = await r.json();
                updated = arr && arr[0] ? arr[0] : { id: targetTenantId, ...updateBody };
                log("tenant aprobado:", updated.id);
            } else {
                updateErr = await r.text().catch(() => "");
                log("update fallo:", r.status, updateErr);
            }
        } catch (e) {
            updateErr = e?.message;
            log("update exception:", updateErr);
        }

        if (updateErr) {
            return safeJson(200, {
                ok: false,
                error: `Error actualizando tenant: ${updateErr}`,
                tenantId: targetTenantId,
                manualInstructions: {
                    step1: "Ve a https://supabase.com/dashboard",
                    step2: "Table Editor → tenants",
                    step3: `Busca la fila con id = "${targetTenantId}"`,
                    step4: "Cambia activation_status a 'active_trial'",
                    step5: `Rellena trial_ends_at con: ${trialEndsAt}`,
                    step6: "Guarda los cambios",
                },
            });
        }

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
                              `🏢 ${updated.name || email}\n` +
                              `🆔 \`${updated.id}\`\n` +
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
            method: useServiceRole ? "service_role" : "anon_key",
            message: "Alta aprobada, 7 días de trial activados. El usuario puede hacer login ahora.",
        });
    } catch (e) {
        log("EXCEPTION:", e?.message || e);
        return safeJson(200, {
            ok: false,
            error: e?.message || String(e),
            instructions: "Si el error persiste, aprobar manualmente en Supabase Dashboard",
        });
    }
};
