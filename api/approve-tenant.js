// =====================================================================
// MOZONA TPV — /api/approve-tenant (v1.9.75)
// =====================================================================
// Endpoint serverless para que el SuperAdmin apruebe un alta pendiente.
// Llama a la función SQL approve_tenant_activation().
// Protegido por email del SuperAdmin (rofixinsta@gmail.com).
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
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") {
            res.status(200).end();
            return;
        }

        // Liveness
        if (req.method === "GET" && req.url && req.url.indexOf("ping=1") !== -1) {
            res.status(200).json({ ok: true, ping: true, runtime: process.version });
            return;
        }

        if (req.method !== "POST") {
            res.status(405).json({ ok: false, error: "Method not allowed" });
            return;
        }

        // Auth: solo el SuperAdmin puede aprobar
        const SUPERADMIN_EMAIL = "rofixinsta@gmail.com";
        const requesterEmail = (req.headers["x-admin-email"] || "").toLowerCase().trim();
        if (requesterEmail !== SUPERADMIN_EMAIL) {
            res.status(403).json({ ok: false, error: "Forbidden: solo el SuperAdmin puede aprobar altas" });
            return;
        }

        // Body
        let data = req.body;
        if (typeof data === "string") {
            try { data = JSON.parse(data); }
            catch (e) {
                res.status(400).json({ ok: false, error: "Invalid JSON" });
                return;
            }
        }
        const tenantId = data && data.tenantId;
        if (!tenantId) {
            res.status(400).json({ ok: false, error: "Missing tenantId" });
            return;
        }

        // Env vars para Supabase
        const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
        const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

        if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
            res.status(500).json({
                ok: false,
                error: "Server misconfiguration: SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no están configuradas en Vercel.",
            });
            return;
        }

        // Llamar a la función SQL via RPC
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);

        const rpcResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/approve_tenant_activation`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
            },
            body: JSON.stringify({
                p_tenant_id: tenantId,
                p_approved_by: SUPERADMIN_EMAIL,
            }),
            signal: controller.signal,
        });
        clearTimeout(timer);

        const result = await rpcResp.json();
        console.log("[approve-tenant]", tenantId, "result:", result);

        if (!rpcResp.ok) {
            res.status(rpcResp.status).json({
                ok: false,
                error: result?.message || "Error al aprobar tenant",
            });
            return;
        }

        res.status(200).json({
            ok: true,
            via: "supabase-rpc",
            ...result,
        });
    } catch (err) {
        console.error("[approve-tenant] CRASH:", err && err.message, err && err.stack);
        try {
            if (res && !res.headersSent) {
                res.status(500).json({ ok: false, error: "CRASH: " + (err && err.message ? err.message : "Unknown") });
            }
        } catch (_) {}
    }
};
