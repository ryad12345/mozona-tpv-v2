// =====================================================================
// MOZONA TPV — /api/check-status (v3.0.5)
// =====================================================================
// Polling endpoint para la sala de espera.
// Devuelve el estado del tenant por email.
// SIEMPRE devuelve 200, NUNCA 500.
// =====================================================================

// ★ Carga tolerante: si @supabase no está disponible, sigue funcionando
let createClient = null;
try {
    const supabaseLib = require("@supabase/supabase-js");
    createClient = supabaseLib.createClient;
} catch (e) {
    console.warn("[check-status] @supabase/supabase-js not available, using fetch fallback");
}

// ★ Rate limiting
const { rateLimit, getClientIp } = require("./_rateLimit.js");
// ★ Headers de seguridad
const { applySecurityHeaders } = require("./_security.js");

module.exports = async (req, res) => {
    // ★ Headers de seguridad
    try { applySecurityHeaders(res); } catch (_) {}

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
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (req.method === "OPTIONS") return res.status(200).end();
    } catch (_) {}

    const safeJson = (status, payload) => {
        try { return res.status(status).json(payload); } catch (_) {}
    };

    const log = (...args) => {
        try { console.log("[check-status]", ...args); } catch (_) {}
    };

    try {
        // ★ Aceptar email por query string o body
        let email = "";
        try {
            if (req.query && req.query.email) {
                email = String(req.query.email).trim().toLowerCase();
            } else if (req.body) {
                let body = req.body;
                if (typeof body === "string") {
                    try { body = JSON.parse(body); } catch (_) {}
                }
                email = (body.email || "").toString().trim().toLowerCase();
            }
        } catch (_) {}

        if (!email) {
            return safeJson(200, { ok: false, error: "email required" });
        }

        // ★ Validar formato email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return safeJson(200, { ok: false, error: "Formato de email inválido" });
        }

        // ★ Rate limit: 30 consultas por IP cada minuto (polling normal)
        const ip = getClientIp(req);
        const limit = rateLimit(`status:${ip}:${email}`, 30, 60 * 1000);
        if (!limit.allowed) {
            return safeJson(200, {
                ok: false,
                step: "rate_limit",
                error: "Demasiadas consultas. Espera un momento.",
                retryAfterMs: limit.resetIn,
            });
        }

        // ★ Sin email
        const supabaseUrl = process.env.SUPABASE_URL
                         || process.env.VITE_SUPABASE_URL
                         || "";
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
        const anonKey   = process.env.VITE_SUPABASE_ANON_KEY || "";

        if (!supabaseUrl) {
            return safeJson(200, {
                ok: true,
                tenant: null,
                method: "no_config",
                message: "Configurando...",
            });
        }

        const apiKey = serviceKey || anonKey;
        const headers = {
            apikey: apiKey,
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        };

        // ════════════════════════════════════════════════════
        // ESTRATEGIA: buscar el user por email y luego su tenant
        // ════════════════════════════════════════════════════

        let tenant = null;
        let userId = null;
        let method = "not_found";

        // ★ Si tenemos SERVICE_ROLE Y el módulo cargado, podemos usar auth.admin
        if (serviceKey && createClient) {
            const adminClient = createClient(supabaseUrl, serviceKey, {
                auth: { autoRefreshToken: false, persistSession: false },
            });

            // 1) Buscar user por email
            try {
                const { data: listData, error: listErr } = await adminClient.auth.admin.listUsers();
                if (!listErr && listData?.users) {
                    const user = listData.users.find(u =>
                        (u.email || "").toLowerCase() === email
                    );
                    if (user) {
                        userId = user.id;
                    }
                }
            } catch (e) {
                log("listUsers error:", e?.message);
            }

            // 2) Si tenemos userId, buscar su tenant
            if (userId) {
                try {
                    const { data: tenants, error: tenantErr } = await adminClient
                        .from("tenants")
                        .select("*")
                        .eq("owner_id", userId)
                        .order("created_at", { ascending: false })
                        .limit(1);
                    if (!tenantErr && tenants && tenants[0]) {
                        tenant = tenants[0];
                        method = "service_role";
                    }
                } catch (e) {
                    log("tenant query error:", e?.message);
                }
            }
        }

        // ★ Sin tenant pero con userId: el user existe pero tenant no
        if (!tenant && userId) {
            // Buscar tenant con columna contact_email
            try {
                const r = await fetch(
                    `${supabaseUrl}/rest/v1/tenants?contact_email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
                    { headers }
                );
                if (r.ok) {
                    const arr = await r.json();
                    if (arr && arr[0]) {
                        tenant = arr[0];
                        method = "contact_email";
                    }
                }
            } catch (_) {}
        }

        // ★ Sin tenant ni userId: buscar el más reciente (heurística)
        if (!tenant) {
            try {
                const r = await fetch(
                    `${supabaseUrl}/rest/v1/tenants?select=*&order=created_at.desc&limit=5`,
                    { headers }
                );
                if (r.ok) {
                    const arr = await r.json();
                    if (arr && arr.length > 0) {
                        // Buscar coincidencia por contact_email
                        const match = arr.find(t =>
                            t.contact_email && t.contact_email.toLowerCase() === email
                        );
                        if (match) {
                            tenant = match;
                            method = "heuristic_match";
                        } else {
                            tenant = arr[0];
                            method = "heuristic_recent";
                        }
                    }
                }
            } catch (e) {
                log("heuristic query error:", e?.message);
            }
        }

        // ★ Calcular tiempo restante de cortesía
        let graceRemainingMs = 24 * 60 * 60 * 1000; // 24h por defecto
        if (tenant?.grace_period_ends_at) {
            const end = new Date(tenant.grace_period_ends_at).getTime();
            graceRemainingMs = Math.max(0, end - Date.now());
        }

        return safeJson(200, {
            ok: true,
            tenant,
            userId,
            method,
            graceRemainingMs,
            status: tenant?.activation_status || tenant?.subscription_status || "pending_activation",
        });
    } catch (e) {
        log("EXCEPTION:", e?.message || e);
        return safeJson(200, {
            ok: false,
            error: e?.message || String(e),
        });
    }
};
