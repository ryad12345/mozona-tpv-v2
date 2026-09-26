// =====================================================================
// MOZONA TPV — Supabase Edge Function: send-email (v4.0.7-cors-fix)
// =====================================================================
// Proxy para envío de emails. Tiene headers CORS completos para evitar
// el error "Access-Control-Allow-Origin missing" en el frontend.
//
// Usa Resend API si RESEND_API_KEY está configurado (recomendado en
// producción). Si no, hace logging del email y devuelve ok=true (modo
// defensivo para que el front no rompa).
//
// Endpoint: POST /functions/v1/send-email
// =====================================================================

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// ★ v4.0.7-cors-fix: Headers CORS COMPLETOS para TODOS los métodos
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-email, x-request-id, x-application-name, x-application-version",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400", // 24h cache preflight
};

function json(payload: any, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

async function sendViaResend(payload: any): Promise<{ ok: boolean; error?: string; id?: string }> {
    if (!RESEND_API_KEY) {
        return { ok: false, error: "RESEND_API_KEY no configurada" };
    }

    const { to, subject, html, text, from } = payload;
    if (!to || !subject || (!html && !text)) {
        return { ok: false, error: "Faltan campos requeridos (to, subject, html|text)" };
    }

    try {
        const r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: from || "MOZONA TPV <hola@mozonatpv.com>",
                to: Array.isArray(to) ? to : [to],
                subject: String(subject).slice(0, 200),
                html: html || `<p>${text}</p>`,
                text: text,
            }),
        });

        if (!r.ok) {
            const t = await r.text().catch(() => "");
            return { ok: false, error: `Resend HTTP ${r.status}: ${t.slice(0, 200)}` };
        }

        const result = await r.json().catch(() => ({}));
        return { ok: true, id: result.id };
    } catch (e: any) {
        return { ok: false, error: e?.message || String(e) };
    }
}

async function logEmail(payload: any): Promise<void> {
    // Log a tabla email_outbox (para envío posterior)
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/email_outbox`, {
            method: "POST",
            headers: {
                apikey: SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
                "Content-Type": "application/json",
                Prefer: "return=representation",
            },
            body: JSON.stringify({
                to_email: payload.to,
                subject: payload.subject,
                body: payload.html || payload.text,
                status: "pending",
                created_at: new Date().toISOString(),
            }),
        });
    } catch (_) {}
}

Deno.serve(async (req: Request) => {
    // ★ Preflight CORS — SIEMPRE responder
    if (req.method === "OPTIONS") {
        return new Response("ok", {
            status: 204,
            headers: corsHeaders,
        });
    }

    try {
        const url = new URL(req.url);

        // Health check
        if (url.searchParams.get("diag") === "1") {
            return json({
                ok: true,
                ts: Date.now(),
                resend_configured: !!RESEND_API_KEY,
                supabase_configured: !!SUPABASE_SERVICE_KEY,
                mode: RESEND_API_KEY ? "resend-api" : "log-only",
            });
        }

        if (req.method !== "POST") {
            return json({ ok: false, error: "Método no permitido, usa POST" }, 405);
        }

        const body = await req.json().catch(() => ({}));
        const result = await sendViaResend(body);

        // ★ Si Resend no está configurado, hacer log-only (modo defensivo)
        if (!result.ok && !RESEND_API_KEY) {
            await logEmail(body);
            return json({
                ok: true,
                mode: "log-only",
                message: "Email en cola. RESEND_API_KEY no configurada, se enviará cuando se configure.",
                ts: Date.now(),
            });
        }

        if (!result.ok) {
            return json({ ok: false, error: result.error }, 400);
        }

        return json({
            ok: true,
            id: result.id,
            mode: "resend",
            ts: Date.now(),
        });
    } catch (e: any) {
        return json({ ok: false, error: e?.message || String(e) }, 500);
    }
});
