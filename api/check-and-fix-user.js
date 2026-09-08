// =====================================================================
// MOZONA TPV — /api/check-and-fix-user (v1.9.90)
// =====================================================================
// Endpoint que:
//   1) Verifica si el email ya existe en Supabase Auth (admin API)
//   2) Si existe: actualiza password + email_confirm = true
//   3) Si no existe: lo crea con email_confirm = true
//
// Esto resuelve el caso "Invalid login credentials" cuando el email
// ya esta registrado de pruebas anteriores pero sin confirmar.
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

    let body = req.body;
    if (typeof body === "string") {
        try { body = JSON.parse(body); }
        catch (e) { return safeJson(res, 200, { ok: false, error: "Invalid JSON" }); }
    }
    body = body || {};
    const { email, password, name } = body;

    if (!email || !password) {
        return safeJson(res, 200, { ok: false, error: "Faltan email o password" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    if (!SUPABASE_URL || !SERVICE_KEY) {
        return safeJson(res, 200, {
            ok: false,
            error: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY no esta configurada. Sin esta env var no se pueden resetear passwords ni confirmar emails desde el servidor.",
        });
    }

    // Paso 1: buscar usuario por email
    let userId = null;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const listResp = await fetch(
            `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email.trim().toLowerCase())}`,
            {
                method: "GET",
                headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
                signal: controller.signal,
            }
        );
        clearTimeout(timer);
        if (listResp.ok) {
            const listData = await listResp.json();
            if (listData.users && listData.users[0]) {
                userId = listData.users[0].id;
            }
        }
    } catch (e) {
        console.warn("[check-and-fix-user] list error:", e && e.message);
    }

    // Paso 2: si existe, actualizar password + email_confirm
    if (userId) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            const updateResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
                method: "PUT",
                headers: {
                    apikey: SERVICE_KEY,
                    Authorization: `Bearer ${SERVICE_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    password: password,
                    email_confirm: true,
                    user_metadata: { full_name: name || "" },
                }),
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (updateResp.ok) {
                return safeJson(res, 200, {
                    ok: true,
                    action: "updated",
                    userId,
                    email_confirm: true,
                    duration_ms: Date.now() - startTime,
                });
            }
        } catch (e) {
            console.warn("[check-and-fix-user] update error:", e && e.message);
        }
    }

    // Paso 3: si no existe, crear con email_confirm = true
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const createResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
            method: "POST",
            headers: {
                apikey: SERVICE_KEY,
                Authorization: `Bearer ${SERVICE_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                email: email.trim().toLowerCase(),
                password,
                email_confirm: true,
                user_metadata: { full_name: name || "" },
            }),
            signal: controller.signal,
        });
        clearTimeout(timer);

        const text = await createResp.text().catch(() => "");
        let data = null;
        try { data = JSON.parse(text); } catch (_) {}

        if (createResp.ok && data && data.id) {
            return safeJson(res, 200, {
                ok: true,
                action: "created",
                userId: data.id,
                email_confirm: true,
                duration_ms: Date.now() - startTime,
            });
        }
        return safeJson(res, 200, {
            ok: false,
            error: `Create failed: HTTP ${createResp.status}: ${text.substring(0, 200)}`,
            duration_ms: Date.now() - startTime,
        });
    } catch (e) {
        return safeJson(res, 200, {
            ok: false,
            error: "Exception: " + (e && e.message ? e.message : "Unknown"),
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
