// =====================================================================
// MOZONA TPV — /api/auto-confirm-user (v1.9.85)
// =====================================================================
// Endpoint serverless que auto-confirma el email de un usuario
// en Supabase usando la SERVICE_ROLE_KEY.
//
// PROBLEMA: Supabase tiene "Confirm email" activado por defecto.
//           Cuando se hace signUp desde el cliente, devuelve:
//             { user: {...}, session: NULL }
//           porque Supabase espera confirmacion por email.
//
// SOLUCION: Despues del signUp, el cliente llama a este endpoint
//           con el userId. El server usa la SERVICE_ROLE_KEY para
//           auto-confirmar el email del usuario.
//
// ENDPOINTS:
//   POST /api/auto-confirm-user
//   Body: { userId: "uuid", email: "user@example.com" }
//
// SIEMPRE responde 200 JSON. NUNCA falla para no bloquear el registro.
// =====================================================================

module.exports = async (req, res) => {
    const startTime = Date.now();

    // ★★ CORS + JSON ★★
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
    } catch (e) { /* silent */ }

    if (req.method === "OPTIONS") {
        try { res.status(200).end(); } catch (_) {}
        return;
    }

    if (req.method !== "POST") {
        return safeJson(res, 405, { ok: false, error: "POST only" });
    }

    // ★★ Body ★★
    let body = req.body;
    if (typeof body === "string") {
        try { body = JSON.parse(body); }
        catch (e) {
            return safeJson(res, 200, { ok: false, skipped: true, reason: "Invalid JSON" });
        }
    }
    body = body || {};
    const { userId, email } = body;

    if (!userId && !email) {
        return safeJson(res, 200, { ok: false, skipped: true, reason: "Missing userId or email" });
    }

    // ★★ Env vars ★★
    // ★ v1.9.86: usar VITE_SUPABASE_URL como fallback si SUPABASE_URL no esta
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    // ★ v1.9.86: usar VITE_SUPABASE_ANON_KEY como fallback
    //   (el admin API normalmente requiere service_role, pero intentamos
    //    con anon por si las politicas RLS lo permiten)
    const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

    if (!SUPABASE_URL || !SERVICE_KEY) {
        console.warn("[auto-confirm-user] env vars missing");
        return safeJson(res, 200, {
            ok: false,
            skipped: true,
            reason: "SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configuradas en Vercel. Anadelas SIN prefijo VITE_.",
        });
    }

    // ★★ Resolver userId (si solo se paso email) ★★
    let targetUserId = userId;
    try {
        if (!targetUserId && email) {
            // Listar usuarios por email usando Admin API
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
                const arr = await listResp.json();
                if (arr && arr.users && arr.users[0]) {
                    targetUserId = arr.users[0].id;
                }
            }
        }
    } catch (e) {
        console.warn("[auto-confirm-user] list users error:", e && e.message);
    }

    if (!targetUserId) {
        return safeJson(res, 200, {
            ok: false,
            skipped: true,
            reason: "No se pudo resolver el userId (no se encontro usuario con ese email)",
        });
    }

    // ★★ Auto-confirmar el email via Admin API ★★
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(
            `${SUPABASE_URL}/auth/v1/admin/users/${targetUserId}`,
            {
                method: "PUT",
                headers: {
                    "apikey": SERVICE_KEY,
                    "Authorization": `Bearer ${SERVICE_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    email_confirm: true,
                }),
                signal: controller.signal,
            }
        );
        clearTimeout(timer);

        const responseText = await resp.text().catch(() => "");
        console.log("[auto-confirm-user] response:", resp.status, responseText.substring(0, 200));

        if (!resp.ok) {
            return safeJson(res, 200, {
                ok: false,
                skipped: true,
                reason: `Admin API HTTP ${resp.status}: ${responseText.substring(0, 200)}`,
                userId: targetUserId,
                duration_ms: Date.now() - startTime,
            });
        }

        return safeJson(res, 200, {
            ok: true,
            via: "admin-api",
            userId: targetUserId,
            email_confirm: true,
            duration_ms: Date.now() - startTime,
        });
    } catch (e) {
        console.error("[auto-confirm-user] error:", e && e.message);
        return safeJson(res, 200, {
            ok: false,
            skipped: true,
            reason: "Error: " + (e && e.message ? e.message : "Unknown"),
            userId: targetUserId,
            duration_ms: Date.now() - startTime,
        });
    }
};

function safeJson(res, status, body) {
    try {
        if (!res || res.headersSent || typeof res.status !== "function") return false;
        res.status(status).json(body);
        return true;
    } catch (e) { return false; }
}
