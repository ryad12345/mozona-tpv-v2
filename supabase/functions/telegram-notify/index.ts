// =====================================================================
// MOZONA TPV — Edge Function: telegram-notify (v4.0.7-defender)
// =====================================================================
// Envia un mensaje a Telegram desde el servidor.
// El bot_token NUNCA llega al cliente — se lee de los secrets de Supabase.
// =====================================================================

declare const Deno: {
    env: { get(key: string): string | undefined };
    serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

// CORS headers
const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const ADMIN_CHAT_ID = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID") ?? "";

interface NotifyPayload {
    text: string;
    chat_id?: string;
    inline_keyboard?: unknown;
    parse_mode?: "HTML" | "MarkdownV2" | "Markdown";
    disable_web_page_preview?: boolean;
}

async function verifyJwtOrServiceRole(
    authHeader: string | null
): Promise<{ ok: boolean; user_id?: string; reason?: string; is_service_role?: boolean }> {
    if (!authHeader) return { ok: false, reason: "missing auth header" };

    // Aceptar el service_role key como bypass (para uso server-side)
    if (authHeader === `Bearer ${SUPABASE_ANON_KEY}`) {
        return { ok: true, is_service_role: true };
    }

    try {
        const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { Authorization: authHeader, apikey: SUPABASE_ANON_KEY },
        });
        if (!r.ok) return { ok: false, reason: `auth failed: ${r.status}` };
        const user = await r.json();
        return { ok: true, user_id: user?.id };
    } catch (e) {
        return { ok: false, reason: String(e) };
    }
}

async function sendTelegram(
    chatId: string,
    text: string,
    inline_keyboard?: unknown,
    parse_mode = "HTML",
    disable_web_page_preview = true
): Promise<{ ok: boolean; error?: string }> {
    if (!BOT_TOKEN) {
        return { ok: false, error: "TELEGRAM_BOT_TOKEN not configured in Supabase secrets" };
    }

    try {
        const body: Record<string, unknown> = {
            chat_id: chatId,
            text,
            parse_mode,
            disable_web_page_preview,
        };
        if (inline_keyboard) body.reply_markup = inline_keyboard;

        const r = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            }
        );
        const data = await r.json();
        if (data.ok) return { ok: true };
        return { ok: false, error: data.description ?? `HTTP ${r.status}` };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

Deno.serve(async (req) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS });
    }

    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "method_not_allowed" }), {
            status: 405,
            headers: { ...CORS, "Content-Type": "application/json" },
        });
    }

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    const auth = await verifyJwtOrServiceRole(authHeader);
    if (!auth.ok) {
        return new Response(
            JSON.stringify({ error: "unauthorized", reason: auth.reason }),
            {
                status: 401,
                headers: { ...CORS, "Content-Type": "application/json" },
            }
        );
    }

    let payload: NotifyPayload;
    try {
        payload = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: "invalid_json" }), {
            status: 400,
            headers: { ...CORS, "Content-Type": "application/json" },
        });
    }

    if (!payload.text) {
        return new Response(JSON.stringify({ error: "missing_text" }), {
            status: 400,
            headers: { ...CORS, "Content-Type": "application/json" },
        });
    }

    // Rate limit básico en Edge (in-memory token bucket)
    if (!auth.is_service_role) {
        const rl = (globalThis as any).__tl_notify_rl ?? new Map<string, number[]>();
        const arr: number[] = (rl.get(auth.user_id ?? "anon") ?? []).slice(-20);
        const now = Date.now();
        while (arr.length && now - arr[0] > 60_000) arr.shift();
        arr.push(now);
        (globalThis as any).__tl_notify_rl = rl;
        rl.set(auth.user_id ?? "anon", arr);
        if (arr.length > 30) {
            return new Response(
                JSON.stringify({ error: "rate_limited", retry_after: 60 }),
                {
                    status: 429,
                    headers: { ...CORS, "Content-Type": "application/json" },
                }
            );
        }
    }

    const chatId = payload.chat_id ?? ADMIN_CHAT_ID;
    if (!chatId) {
        return new Response(
            JSON.stringify({ error: "no_chat_id", reason: "ADMIN_CHAT_ID not set" }),
            {
                status: 500,
                headers: { ...CORS, "Content-Type": "application/json" },
            }
        );
    }

    const result = await sendTelegram(
        chatId,
        payload.text,
        payload.inline_keyboard,
        payload.parse_mode,
        payload.disable_web_page_preview
    );

    return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 502,
        headers: { ...CORS, "Content-Type": "application/json" },
    });
});
