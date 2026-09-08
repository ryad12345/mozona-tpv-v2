// =====================================================================
// MOZONA TPV — /api/notify-admin (v1.9.76)
// =====================================================================
// Endpoint serverless que recibe notificaciones de nuevas altas.
// Compatible con:
//   1) POST directo desde el cliente (signUp, activation.ts)
//   2) Supabase Database Webhook (formato: { type, table, record, ... })
//   3) Trigger HTTP personalizado
//
// SIEMPRE responde 200 con JSON (nunca falla para no bloquear
// el registro del cliente). Internamente es idempotente:
//   - Si la notificación ya existe para el mismo tenant_id + type,
//     no se duplica.
// =====================================================================

module.exports = async (req, res) => {
    const startTime = Date.now();

    // ★★ CORS + respuesta siempre JSON ★★
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
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-webhook-signature");
        res.setHeader("Content-Type", "application/json");
    } catch (e) { /* silent */ }

    // ★★ OPTIONS ★★
    if (req.method === "OPTIONS") {
        try { res.status(200).end(); } catch (_) {}
        return;
    }

    // ★★ Liveness check ★★
    if (req.method === "GET" && req.url && req.url.indexOf("ping=1") !== -1) {
        return safeJson(res, 200, { ok: true, ping: true, runtime: process.version });
    }

    // ★★ Solo POST ★★
    if (req.method !== "POST") {
        return safeJson(res, 405, {
            ok: false,
            error: "Method not allowed. Use POST con body JSON.",
        });
    }

    // ★★ Parsear body de forma defensiva ★★
    let body = req.body;
    if (typeof body === "string") {
        try { body = JSON.parse(body); }
        catch (e) {
            return safeJson(res, 400, { ok: false, error: "Invalid JSON body" });
        }
    }
    body = body || {};

    // ★★ Normalizar payload: acepta múltiples formatos ★★
    // 1) Formato directo: { tenantId, businessName, contactEmail, planSelected, ... }
    // 2) Formato Supabase Webhook: { type: "INSERT", table: "tenants", record: { id, name, ... }, schema: "public" }
    // 3) Formato trigger: { record: {...} } o { new: {...} }
    const normalized = normalizePayload(body);
    if (!normalized) {
        return safeJson(res, 200, {
            ok: true,
            skipped: true,
            reason: "Payload no contiene datos de tenant reconocibles",
            received_keys: Object.keys(body),
        });
    }

    // ★★ Verificar env vars (CRÍTICO) ★★
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        console.warn("[notify-admin] env vars missing - retornando 200 para no bloquear");
        return safeJson(res, 200, {
            ok: true,
            skipped: true,
            reason: "SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configuradas en Vercel",
            received: normalized,
        });
    }

    // ★★ Verificar si ya existe (idempotente) ★★
    try {
        const exists = await notificationExists(SUPABASE_URL, SUPABASE_SERVICE_KEY, normalized);
        if (exists) {
            return safeJson(res, 200, {
                ok: true,
                skipped: true,
                reason: "Notificación duplicada (ya existe)",
                tenantId: normalized.tenantId,
            });
        }
    } catch (e) {
        console.warn("[notify-admin] check exists error (continuamos):", e && e.message);
        // No bloqueamos: continuamos a insertar
    }

    // ★★ Insertar notificación ★★
    try {
        const result = await insertNotification(SUPABASE_URL, SUPABASE_SERVICE_KEY, normalized);
        console.log("[notify-admin] OK:", normalized.tenantId, "in", Date.now() - startTime, "ms");
        return safeJson(res, 200, {
            ok: true,
            via: "supabase-rest",
            notificationId: result.id,
            tenantId: normalized.tenantId,
            duration_ms: Date.now() - startTime,
        });
    } catch (e) {
        // ★★ FALLO: NUNCA devolvemos 500 al cliente. Log + 200 con error.
        //    Esto es INTENCIONAL para que un fallo del webhook
        //    nunca bloquee el registro del tenant.
        console.error("[notify-admin] insert error (no bloqueante):", e && e.message);
        return safeJson(res, 200, {
            ok: false,
            skipped: true,
            reason: "Error al insertar notificación",
            error: e && e.message ? e.message : "Unknown",
            tenantId: normalized.tenantId,
        });
    }
};

// =====================================================================
// Helpers
// =====================================================================

function safeJson(res, status, body) {
    try {
        if (!res || res.headersSent || res.writableEnded) return false;
        if (typeof res.status !== "function") return false;
        res.status(status).json(body);
        return true;
    } catch (e) {
        try { console.error("[notify-admin] safeJson error:", e && e.message); } catch (_) {}
        return false;
    }
}

function normalizePayload(body) {
    if (!body || typeof body !== "object") return null;

    // Formato 1: POST directo del cliente
    if (body.tenantId || body.businessName) {
        return {
            tenantId:      body.tenantId || null,
            businessName:  body.businessName || body.name || "Restaurante sin nombre",
            contactEmail:  body.contactEmail || body.email || null,
            planSelected:  body.planSelected || body.plan || "basic",
            businessType:  body.businessType || null,
            address:       body.address || body.restaurant_address || null,
            phone:         body.phone || body.restaurant_phone || null,
            source:        body.source || "client-direct",
            type:          "new_registration",
        };
    }

    // Formato 2: Supabase Database Webhook (record/old)
    const rec = body.record || body.new || body.data || null;
    if (rec && typeof rec === "object") {
        // Si la tabla es admin_notifications, no re-crear (ya existe por trigger)
        if (body.table === "admin_notifications") {
            return {
                tenantId:      rec.tenant_id || null,
                businessName:  rec.title || "Nueva notificación",
                contactEmail:  null,
                planSelected:  null,
                businessType:  null,
                address:       null,
                phone:         null,
                source:        "supabase-webhook",
                type:          rec.type || "new_registration",
                skip:          true,  // no duplicar
            };
        }
        // Si la tabla es tenants
        return {
            tenantId:      rec.id || null,
            businessName:  rec.business_name || rec.name || "Restaurante sin nombre",
            contactEmail:  rec.contact_email || null,
            planSelected:  rec.plan_selected || rec.plan || "basic",
            businessType:  rec.business_type || null,
            address:       rec.restaurant_address || rec.address || null,
            phone:         rec.restaurant_phone || rec.phone || null,
            source:        "supabase-webhook",
            type:          "new_registration",
        };
    }

    return null;
}

async function notificationExists(url, key, n) {
    if (!n.tenantId) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
        const r = await fetch(
            `${url}/rest/v1/admin_notifications?tenant_id=eq.${encodeURIComponent(n.tenantId)}&type=eq.${encodeURIComponent(n.type)}&limit=1`,
            {
                method: "GET",
                headers: { apikey: key, Authorization: `Bearer ${key}` },
                signal: controller.signal,
            }
        );
        clearTimeout(timer);
        if (!r.ok) return false;
        const arr = await r.json();
        return Array.isArray(arr) && arr.length > 0;
    } catch (e) {
        clearTimeout(timer);
        return false;
    }
}

async function insertNotification(url, key, n) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
        const title = buildTitle(n);
        const message = buildMessage(n);
        const payload = {
            tenant_id:  n.tenantId || null,
            type:       n.type,
            title,
            message,
            payload: {
                tenant_id:       n.tenantId,
                business_name:   n.businessName,
                plan_selected:   n.planSelected,
                contact_email:   n.contactEmail,
                business_type:   n.businessType,
                address:         n.address,
                phone:           n.phone,
                source:          n.source,
                created_at:      new Date().toISOString(),
            },
        };
        const r = await fetch(`${url}/rest/v1/admin_notifications`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": key,
                "Authorization": `Bearer ${key}`,
                "Prefer": "return=representation",
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!r.ok) {
            const text = await r.text().catch(() => "");
            throw new Error(`HTTP ${r.status}: ${text.substring(0, 200)}`);
        }
        const arr = await r.json();
        return { id: arr && arr[0] ? arr[0].id : "created" };
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}

function buildTitle(n) {
    return "Nueva alta: " + (n.businessName || "Restaurante sin nombre");
}

function buildMessage(n) {
    const parts = [];
    parts.push((n.businessName || "Restaurante") + " se ha registrado y solicita activación.");
    if (n.planSelected) parts.push("Plan: " + n.planSelected + ".");
    if (n.contactEmail) parts.push("Email: " + n.contactEmail + ".");
    if (n.address)      parts.push("Dirección: " + n.address + ".");
    if (n.phone)        parts.push("Tel: " + n.phone + ".");
    return parts.join(" ");
}
