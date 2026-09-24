// =====================================================================
// MOZONA TPV — Supabase Edge Function: api-compat (v4.0.7-compat)
// =====================================================================
// Capa de compatibilidad para los /api/* de Vercel que estaban caídos.
// Mapea cada ruta al Edge Function correspondiente:
//
//   /api/tenant-settings      → get_tenant_settings (helper interno)
//   /api/send-email           → send_email (usa Edge Function send-email)
//   /api/notify-telegram      → notify_telegram (Edge Function register-tenant)
//   /api/check-status         → admin-ops list_tenants
//   /api/health               → devolvemos health del cluster
//   /api/activate             → admin-ops approve_tenant
//   /api/approve-tenant       → admin-ops approve_tenant
//   /api/create-user          → admin-ops create_auth_user (no existe, fallback)
//
// Lee query params + body para encaminar.
// =====================================================================

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";

const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
};

const json = (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, "Content-Type": "application/json" },
    });

async function fetchWithTimeout(url: string, options: RequestInit = {}, ms = 15000): Promise<Response> {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), ms);
    try {
        const r = await fetch(url, { ...options, signal: ctrl.signal });
        clearTimeout(tid);
        return r;
    } catch (e) {
        clearTimeout(tid);
        throw e;
    }
}

// ─── HANDLERS ──────────────────────────────────────────────────────────────

async function getTenantSettings(email: string): Promise<any> {
    // Buscar tenant por email en Supabase directo
    const r = await fetchWithTimeout(
        `${SUPABASE_URL}/rest/v1/tenants?contact_email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
        {
            method: "GET",
            headers: {
                apikey: SERVICE_KEY,
                Authorization: `Bearer ${SERVICE_KEY}`,
                "Content-Type": "application/json",
            },
        },
        10000
    );
    if (!r.ok) return { ok: false, error: "HTTP " + r.status };
    const arr = await r.json().catch(() => []);
    const tenant = Array.isArray(arr) ? arr[0] : null;
    if (!tenant) return { ok: false, error: "Tenant no encontrado" };
    return {
        ok: true,
        settings: {
            tenant_id: tenant.id,
            plan: tenant.plan_selected || tenant.plan || "basic",
            email: tenant.contact_email,
            name: tenant.business_name || tenant.name,
            activation_status: tenant.activation_status,
            trial_ends_at: tenant.trial_ends_at,
        },
    };
}

async function sendEmail(payload: any): Promise<any> {
    // Forward a Edge Function send-email si existe, o enviar directo
    if (!BOT_TOKEN || !SERVICE_KEY) {
        return { ok: false, error: "Email no configurado (TELEGRAM_BOT_TOKEN o service key faltantes)" };
    }
    // Reenviar a Edge Function send-email si existe
    try {
        const r = await fetchWithTimeout(
            `${SUPABASE_URL}/functions/v1/send-email`,
            {
                method: "POST",
                headers: {
                    apikey: SERVICE_KEY,
                    Authorization: `Bearer ${SERVICE_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            },
            15000
        );
        if (r.ok) return r.json();
        return { ok: false, error: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
    } catch (e: any) {
        return { ok: false, error: e?.message || String(e) };
    }
}

async function notifyTelegram(payload: any): Promise<any> {
    // Reenviar al register-tenant que ya tiene los botones correctos
    try {
        const r = await fetchWithTimeout(
            `${SUPABASE_URL}/functions/v1/register-tenant`,
            {
                method: "POST",
                headers: {
                    apikey: SERVICE_KEY,
                    Authorization: `Bearer ${SERVICE_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            },
            15000
        );
        return r.json();
    } catch (e: any) {
        return { ok: false, error: e?.message || String(e) };
    }
}

async function checkStatus(payload: any, url: URL): Promise<any> {
    // Si email = "__list_all_pending__" → listar pendientes
    if (payload?.email === "__list_all_pending__" || url.searchParams.get("email") === "__list_all_pending__") {
        const r = await fetchWithTimeout(
            `${SUPABASE_URL}/functions/v1/admin-ops`,
            {
                method: "POST",
                headers: {
                    apikey: SERVICE_KEY,
                    Authorization: `Bearer ${SERVICE_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ action: "list_tenants", status: "pending_activation" }),
            },
            15000
        );
        return r.json();
    }
    // Si no, buscar tenant por email
    return getTenantSettings(payload?.email ?? url.searchParams.get("email") ?? "");
}

async function approveTenant(payload: any): Promise<any> {
    const r = await fetchWithTimeout(
        `${SUPABASE_URL}/functions/v1/admin-ops`,
        {
            method: "POST",
            headers: {
                apikey: SERVICE_KEY,
                Authorization: `Bearer ${SERVICE_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                action: "approve_tenant",
                tenantId: payload?.tenantId ?? payload?.tenant_id,
                trialDays: payload?.trialDays ?? 14,
            }),
        },
        15000
    );
    return r.json();
}

async function createUser(payload: any): Promise<any> {
    // Crear usuario en Supabase Auth
    const r = await fetchWithTimeout(
        `${SUPABASE_URL}/auth/v1/admin/users`,
        {
            method: "POST",
            headers: {
                apikey: SERVICE_KEY,
                Authorization: `Bearer ${SERVICE_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                email: payload?.email,
                password: payload?.password,
                email_confirm: true,
                user_metadata: payload?.name ? { name: payload.name } : undefined,
            }),
        },
        15000
    );
    if (!r.ok) {
        const t = await r.text().catch(() => "");
        return { ok: false, error: `HTTP ${r.status}: ${t.slice(0, 200)}` };
    }
    const user = await r.json();
    return { ok: true, user };
}

async function health(): Promise<any> {
    return {
        ok: true,
        status: "healthy",
        ts: Date.now(),
        platform: "supabase-edge-functions",
        api_compat: true,
    };
}

// ─── ROUTER ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    try {
        const url = new URL(req.url);
        const path = url.pathname.replace(/^\/api\//, "").replace(/^api\//, "").replace(/^functions\/v1\/api-compat\/?/, "");
        const body = await req.json().catch(() => ({}));

        // Tambien aceptar path en el body (algunos frontend usan esto)
        const action = path || body?.action || body?.path || "";

        if (!SUPABASE_URL || !SERVICE_KEY) {
            return json({ ok: false, error: "Edge Function no configurada (SUPABASE_URL/SERVICE_ROLE_KEY faltan)" });
        }

        let result: any;

        switch (action) {
            case "tenant-settings":
                result = await getTenantSettings(body?.email ?? url.searchParams.get("email") ?? "");
                break;
            case "send-email":
                result = await sendEmail(body);
                break;
            case "notify-telegram":
                result = await notifyTelegram(body);
                break;
            case "check-status":
                result = await checkStatus(body, url);
                break;
            case "approve-tenant":
            case "activate":
                result = await approveTenant(body);
                break;
            case "create-user":
                result = await createUser(body);
                break;
            case "health":
                result = await health();
                break;
            default:
                return json({
                    ok: false,
                    error: `Ruta /api/${action} no soportada en api-compat. Edge Function '${SUPABASE_URL}/functions/v1/api-compat' está operativa para: tenant-settings, send-email, notify-telegram, check-status, approve-tenant, create-user, health.`,
                    available_routes: ["tenant-settings", "send-email", "notify-telegram", "check-status", "approve-tenant", "create-user", "health"],
                    received_path: action,
                });
        }

        return json(result);
    } catch (e: any) {
        return json({ ok: false, error: e?.message || String(e) });
    }
});
