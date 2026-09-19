// =====================================================================
// MOZONA TPV — api-router.ts (v4.0.7-fallback)
// =====================================================================
// Wrapper de fetch que:
// 1. Primero intenta el endpoint Vercel original (/api/...)
// 2. Si Vercel está caído (503), fallback a Supabase Edge Function
// 3. Cachea el estado de Vercel (si falla, evita reintentar por 30s)
//
// Asi, cuando Vercel se recupere, vuelve a usarlo automaticamente.
// =====================================================================

const SUPABASE_URL =
    (import.meta.env.VITE_SUPABASE_URL as string) || "https://hcqkpokodrqimkulporw.supabase.co";

const SUPABASE_ANON_KEY =
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "";

// ★ Estado del cluster Vercel
let vercelHealthy: boolean | null = null;
let vercelCheckTs = 0;
const VERCEL_CHECK_INTERVAL = 30_000; // 30s

async function isVercelHealthy(): Promise<boolean> {
    const now = Date.now();
    if (vercelHealthy !== null && now - vercelCheckTs < VERCEL_CHECK_INTERVAL) {
        return vercelHealthy;
    }
    try {
        const r = await fetch("/api/health", { method: "GET", cache: "no-store" });
        vercelHealthy = r.ok;
    } catch (_) {
        vercelHealthy = false;
    }
    vercelCheckTs = now;
    return vercelHealthy;
}

// ★ Mapeo: /api/* → Supabase Edge Function
// Solo las acciones que tenemos en supabase/functions/*
const ACTION_MAP: Record<string, string> = {
    "business-intelligence?action=send-otp": "auth-otp?action=send-otp",
    "business-intelligence?action=verify-otp": "auth-otp?action=verify-otp",
    "business-intelligence?action=chat": "chat-routes",
};

function mapToSupabase(originalPath: string, body?: any): string | null {
    const key = `${originalPath.replace(/^\/api\//, "")}${body?.action ? "?action=" + body.action : ""}`;
    if (ACTION_MAP[key]) {
        return `${SUPABASE_URL}/functions/v1/${ACTION_MAP[key]}`;
    }
    return null;
}

export interface ApiOptions {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: any;
    headers?: Record<string, string>;
    timeout?: number;
}

export async function apiFetch(path: string, opts: ApiOptions = {}): Promise<Response> {
    const method = opts.method || "POST";
    const body = opts.body;
    const headers = {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
    };

    // ★ 1. Intentar Vercel primero
    const vercelOk = await isVercelHealthy();
    if (vercelOk) {
        try {
            const url = path.startsWith("/") ? path : `/api/${path}`;
            const r = await fetch(url, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
                cache: "no-store",
            });
            if (r.ok) return r;
            // Si no ok, intentar fallback
        } catch (_) {}
    }

    // ★ 2. Fallback a Supabase Edge Function
    const supabaseUrl = mapToSupabase(path, body);
    if (supabaseUrl) {
        const sbHeaders = {
            ...headers,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            apikey: SUPABASE_ANON_KEY,
        };
        const r = await fetch(supabaseUrl, {
            method,
            headers: sbHeaders,
            body: body ? JSON.stringify(body) : undefined,
            cache: "no-store",
        });
        if (r.ok) return r;
    }

    // ★ 3. Si nada funciona, devolver 503 fake
    return new Response(
        JSON.stringify({
            ok: false,
            friendly_message: "El servicio no responde. Reintenta en unos segundos.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
    );
}

// ★ Helper para JSON
export async function apiJson<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
    const r = await apiFetch(path, opts);
    return r.json();
}

export default apiFetch;
