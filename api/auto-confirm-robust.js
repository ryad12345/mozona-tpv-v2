// =====================================================================
// MOZONA TPV — /api/auto-confirm-robust (v1.9.89)
// =====================================================================
// Endpoint que intenta TODOS los metodos posibles para auto-confirmar
// el email de un usuario en Supabase Auth.
//
// METODOS (en orden de prioridad):
//   1) Admin API con SUPABASE_SERVICE_ROLE_KEY (email_confirm: true)
//   2) Admin API con VITE_SUPABASE_ANON_KEY (puede no funcionar)
//   3) Generate link con magic login (devuelve access_token directamente)
//
// SIEMPRE responde 200 JSON. Si no puede confirmar, da instrucciones
// al admin de que desactive 'Confirm email' en Supabase Dashboard.
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
    const { userId, email } = body;

    if (!userId && !email) {
        return safeJson(res, 200, { ok: false, error: "Missing userId or email" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    // ★ v1.9.89: Priorizar SERVICE_ROLE sobre ANON
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const ANON_KEY    = process.env.VITE_SUPABASE_ANON_KEY || "";

    if (!SUPABASE_URL) {
        return safeJson(res, 200, {
            ok: false,
            error: "SUPABASE_URL no configurada en Vercel",
        });
    }

    // ★★ METODO 1: Admin API con SERVICE_ROLE ★★
    if (SERVICE_KEY) {
        try {
            const targetUserId = await resolveUserId(SUPABASE_URL, SERVICE_KEY, userId, email);
            if (targetUserId) {
                const ok = await adminConfirmEmail(SUPABASE_URL, SERVICE_KEY, targetUserId);
                if (ok) {
                    return safeJson(res, 200, {
                        ok: true,
                        method: "admin-api-service-role",
                        userId: targetUserId,
                        email_confirm: true,
                        duration_ms: Date.now() - startTime,
                    });
                }
            }
        } catch (e) {
            console.warn("[auto-confirm-robust] metodo 1 fallo:", e && e.message);
        }
    }

    // ★★ METODO 2: Admin API con ANON KEY (puede no funcionar por RLS) ★★
    if (ANON_KEY) {
        try {
            const targetUserId = await resolveUserId(SUPABASE_URL, ANON_KEY, userId, email);
            if (targetUserId) {
                const ok = await adminConfirmEmail(SUPABASE_URL, ANON_KEY, targetUserId);
                if (ok) {
                    return safeJson(res, 200, {
                        ok: true,
                        method: "admin-api-anon",
                        userId: targetUserId,
                        email_confirm: true,
                        duration_ms: Date.now() - startTime,
                    });
                }
            }
        } catch (e) {
            console.warn("[auto-confirm-robust] metodo 2 fallo:", e && e.message);
        }
    }

    // ★★ METODO 3: Generate link con magic login ★★
    if (SERVICE_KEY || ANON_KEY) {
        try {
            const key = SERVICE_KEY || ANON_KEY;
            const result = await generateMagicLink(SUPABASE_URL, key, email);
            if (result && result.action_link) {
                return safeJson(res, 200, {
                    ok: true,
                    method: "magic-link",
                    action_link: result.action_link,
                    duration_ms: Date.now() - startTime,
                    note: "El cliente debe hacer clic en action_link para verificar",
                });
            }
        } catch (e) {
            console.warn("[auto-confirm-robust] metodo 3 fallo:", e && e.message);
        }
    }

    // ★★ NINGUN METODO FUNCIONO: dar instrucciones al admin ★★
    return safeJson(res, 200, {
        ok: false,
        method: null,
        email_confirm: false,
        duration_ms: Date.now() - startTime,
        instructions: [
            "No se pudo auto-confirmar el email. Para solucionarlo:",
            "1) Ve a Supabase Dashboard > Authentication > Sign In/Up",
            "2) DESACTIVA 'Confirm email'",
            "3) Guarda los cambios",
            "4) Usuarios futuros se confirman automaticamente",
        ].join(" "),
    });
};

async function resolveUserId(url, key, userId, email) {
    if (userId) return userId;
    if (!email) return null;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(
            `${url}/auth/v1/admin/users?email=${encodeURIComponent(email.trim().toLowerCase())}`,
            {
                method: "GET",
                headers: { apikey: key, Authorization: `Bearer ${key}` },
                signal: controller.signal,
            }
        );
        clearTimeout(timer);
        if (resp.ok) {
            const arr = await resp.json();
            if (arr && arr.users && arr.users[0]) return arr.users[0].id;
        }
    } catch (e) {
        console.warn("[auto-confirm-robust] resolveUserId error:", e && e.message);
    }
    return null;
}

async function adminConfirmEmail(url, key, userId) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
            method: "PUT",
            headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ email_confirm: true }),
            signal: controller.signal,
        });
        clearTimeout(timer);
        return resp.ok;
    } catch (e) {
        console.warn("[auto-confirm-robust] adminConfirmEmail error:", e && e.message);
        return false;
    }
}

async function generateMagicLink(url, key, email) {
    if (!email) return null;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(`${url}/auth/v1/admin/generate_link`, {
            method: "POST",
            headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                type: "magiclink",
                email: email.trim().toLowerCase(),
            }),
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (resp.ok) {
            return await resp.json();
        }
    } catch (e) {
        console.warn("[auto-confirm-robust] generateMagicLink error:", e && e.message);
    }
    return null;
}

function safeJson(res, status, body) {
    try {
        if (!res || res.headersSent || typeof res.status !== "function") return false;
        res.status(status).json(body);
        return true;
    } catch (e) { return false; }
}
