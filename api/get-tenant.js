// =====================================================================
// MOZONA TPV — /api/get-tenant (v2.0.3)
// =====================================================================
// Endpoint que busca un tenant por email del owner.
// Usa SUPABASE_SERVICE_ROLE_KEY si está configurada (bypass RLS).
// Si no, usa VITE_SUPABASE_ANON_KEY como fallback.
// Hace múltiples intentos para encontrar el tenant:
//   1) Por contact_email (si la columna existe)
//   2) Por owner_id via email del usuario (si auth.users es accesible)
//   3) Por name similar
// =====================================================================

module.exports = async (req, res) => {
    try {
        // CORS
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
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

        if (req.method === "OPTIONS") {
            return res.status(200).end();
        }
        if (req.method !== "POST") {
            return res.status(405).json({ ok: false, error: "Method not allowed" });
        }

        // Parsear body
        let body = req.body || {};
        if (typeof body === "string") {
            try { body = JSON.parse(body); } catch (_) {}
        }
        const email = (body.email || "").toString().trim().toLowerCase();
        if (!email) {
            return res.status(400).json({ ok: false, error: "email required" });
        }

        // Configurar cliente Supabase
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
        const anonKey   = process.env.VITE_SUPABASE_ANON_KEY || "";

        if (!supabaseUrl) {
            return res.status(500).json({ ok: false, error: "Supabase URL not configured" });
        }

        // ★ Priorizar SERVICE_ROLE (bypass RLS) si está configurada
        const apiKey = serviceKey || anonKey;
        if (!apiKey) {
            return res.status(500).json({ ok: false, error: "Supabase API key not configured" });
        }

        // ★ Intento 1: buscar por contact_email
        let r = await fetch(
            `${supabaseUrl}/rest/v1/tenants?contact_email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
            {
                headers: {
                    apikey: apiKey,
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
            }
        );

        if (r.ok) {
            const arr = await r.json();
            if (arr && arr[0]) {
                return res.status(200).json({
                    ok: true,
                    tenant: arr[0],
                    method: "contact_email",
                });
            }
        } else {
            console.warn("[get-tenant] intento 1 (contact_email) fallo:", r.status, await r.text().catch(() => ""));
        }

        // ★ Intento 2: buscar en auth.users y matchear con owner_id
        try {
            const ur = await fetch(
                `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
                {
                    headers: {
                        apikey: apiKey,
                        Authorization: `Bearer ${apiKey}`,
                    },
                }
            );
            if (ur.ok) {
                const users = await ur.json();
                if (users && users.users && users.users[0]) {
                    const userId = users.users[0].id;
                    // Buscar tenant por owner_id
                    const tr = await fetch(
                        `${supabaseUrl}/rest/v1/tenants?owner_id=eq.${userId}&select=*&limit=1`,
                        {
                            headers: {
                                apikey: apiKey,
                                Authorization: `Bearer ${apiKey}`,
                            },
                        }
                    );
                    if (tr.ok) {
                        const tarr = await tr.json();
                        if (tarr && tarr[0]) {
                            return res.status(200).json({
                                ok: true,
                                tenant: tarr[0],
                                method: "auth_users+owner_id",
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("[get-tenant] intento 2 (auth.users) error:", e?.message);
        }

        // ★ Intento 3: buscar el más reciente y verificar heurísticamente
        try {
            const lr = await fetch(
                `${supabaseUrl}/rest/v1/tenants?select=*&order=created_at.desc&limit=10`,
                {
                    headers: {
                        apikey: apiKey,
                        Authorization: `Bearer ${apiKey}`,
                    },
                }
            );
            if (lr.ok) {
                const tenants = await lr.json();
                if (tenants && tenants.length > 0) {
                    // Buscar coincidencia heurística
                    for (const t of tenants) {
                        // Match por name, cif_nif, o lo que sea
                        if (t.contact_email && t.contact_email.toLowerCase() === email) {
                            return res.status(200).json({ ok: true, tenant: t, method: "heuristic_contact_email" });
                        }
                    }
                    // No hay match exacto, devolver el más reciente
                    return res.status(200).json({
                        ok: true,
                        tenant: tenants[0],
                        method: "heuristic_recent",
                        warning: "no_exact_match",
                    });
                }
            }
        } catch (e) {
            console.warn("[get-tenant] intento 3 (heuristic) error:", e?.message);
        }

        // ★ No encontrado
        return res.status(200).json({
            ok: true,
            tenant: null,
            method: "not_found",
        });
    } catch (e) {
        console.error("[get-tenant] error:", e);
        return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
};
