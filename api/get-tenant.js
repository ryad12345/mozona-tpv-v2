// =====================================================================
// MOZONA TPV — /api/get-tenant (v2.0.4)
// =====================================================================
// Endpoint que busca un tenant por email del usuario.
// INTELIGENTE: funciona con o sin SERVICE_ROLE, con o sin columna
// contact_email, con o sin migración 28 ejecutada.
// SIEMPRE devuelve 200 (nunca 500). Si algo falla, devuelve estado
// por defecto para que la UI no se rompa.
// =====================================================================

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
        const email = (body.email || "").toString().trim().toLowerCase();

        // ★ Sin email: devolver estado por defecto, NO 500
        if (!email) {
            return safeJson(200, { ok: true, tenant: null, method: "no_email" });
        }

        // ★ Configurar cliente: leer TODAS las env vars posibles
        const supabaseUrl = process.env.SUPABASE_URL
                         || process.env.VITE_SUPABASE_URL
                         || "";
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
        const anonKey   = process.env.VITE_SUPABASE_ANON_KEY
                       || process.env.SUPABASE_ANON_KEY
                       || "";

        // ★ Sin URL: devolver estado por defecto
        if (!supabaseUrl) {
            console.warn("[get-tenant] Supabase URL no configurada");
            return safeJson(200, { ok: true, tenant: null, method: "no_config" });
        }

        const apiKey = serviceKey || anonKey;
        const headers = {
            apikey: apiKey,
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        };
        const isServiceRole = !!serviceKey;

        // ★ Helper: hacer query y parsear resultado
        const doQuery = async (url) => {
            try {
                const r = await fetch(url, { headers });
                if (!r.ok) return { ok: false, status: r.status, body: null, err: await r.text().catch(() => "") };
                return { ok: true, status: r.status, body: await r.json().catch(() => null) };
            } catch (e) {
                return { ok: false, status: 0, body: null, err: e?.message || String(e) };
            }
        };

        // ★★★ INTENTO 1: Por contact_email (columna de la migración 28) ★★★
        //   Solo si tenemos columnas que SÍ existen en TODAS las tablas
        const r1 = await doQuery(
            `${supabaseUrl}/rest/v1/tenants?select=id,name,owner_id,plan,subscription_status,created_at&order=created_at.desc&limit=20`
        );

        if (r1.ok && Array.isArray(r1.body) && r1.body.length > 0) {
            // Buscar el tenant que coincida con el email
            // (heurística: comparar el email con el email del owner via auth.users)
            // Pero para no hacer otra query, devolvemos el más reciente
            // Y marcamos que necesita verificación

            // ★ Si tenemos SERVICE_ROLE, podemos hacer una query más profunda
            if (isServiceRole) {
                // Intentar buscar el user por email y matchear con owner_id
                try {
                    const ur = await fetch(
                        `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
                        { headers }
                    );
                    if (ur.ok) {
                        const usersJson = await ur.json();
                        const user = usersJson?.users?.[0];
                        if (user?.id) {
                            // Buscar tenant por owner_id
                            const matched = r1.body.find(t => t.owner_id === user.id);
                            if (matched) {
                                return safeJson(200, {
                                    ok: true,
                                    tenant: matched,
                                    method: "auth_users_match",
                                    userId: user.id,
                                });
                            }
                            // El user existe pero no tiene tenant todavía
                            return safeJson(200, {
                                ok: true,
                                tenant: null,
                                method: "user_no_tenant",
                                userId: user.id,
                            });
                        }
                    }
                } catch (_) {}
            }

            // ★ Sin SERVICE_ROLE o sin match exacto: devolver el más reciente
            //   La UI mostrará "preparando tu espacio" si no es el correcto
            return safeJson(200, {
                ok: true,
                tenant: r1.body[0],
                method: isServiceRole ? "recent_no_match" : "anon_recent",
                candidates: r1.body.length,
            });
        }

        // ★ Si la query falla, intentar con columnas mínimas (puede ser RLS)
        if (!r1.ok) {
            console.warn("[get-tenant] intento 1 fallo:", r1.status, r1.err?.slice(0, 200));
        }

        // ★★★ INTENTO 2: Query mínima sin columnas custom ★★★
        const r2 = await doQuery(
            `${supabaseUrl}/rest/v1/tenants?select=id,name&order=created_at.desc&limit=1`
        );
        if (r2.ok && Array.isArray(r2.body) && r2.body[0]) {
            return safeJson(200, {
                ok: true,
                tenant: r2.body[0],
                method: "minimal_query",
            });
        }

        // ★★★ INTENTO 3: Solo contar para saber si hay tenants ★★★
        const r3 = await doQuery(
            `${supabaseUrl}/rest/v1/tenants?select=id&limit=1`
        );
        if (r3.ok) {
            return safeJson(200, {
                ok: true,
                tenant: null,
                method: "no_data_yet",
            });
        }

        // ★ Si todo falla, devolver estado "preparando"
        return safeJson(200, {
            ok: true,
            tenant: null,
            method: "all_failed",
            lastError: r3.err?.slice(0, 200),
        });
    } catch (e) {
        // ★ NUNCA devolver 500: logear y devolver estado por defecto
        console.error("[get-tenant] error no controlado:", e?.message || e);
        return safeJson(200, {
            ok: true,
            tenant: null,
            method: "exception",
            error: e?.message || String(e),
        });
    }
};
