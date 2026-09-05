// =====================================================================
// MOZONA TPV — notify.ts (cliente, v1.9.62)
// =====================================================================
// Wrapper cliente para envío de emails de leads.
// Hace POST a /api/send-email (Vercel Serverless Function).
// CERO credenciales en el bundle del cliente.
// =====================================================================

const ADMIN_EMAIL_DEFAULT = "rofixinsta@gmail.com";
const CLIENT_TIMEOUT_MS = 8000;

export interface LeadEmailData {
    leadId?:         string;
    restaurantName?: string;
    userEmail?:      string;
    selectedPlan?:   string;
    businessType?:   string;
    source?:         string;
    trialEndsAt?:    string;
    status?:         string;
}

export interface SendResult {
    ok:          boolean;
    error?:      string;
    via:         "vercel-proxy" | "network-error" | "client-timeout";
    statusCode?: number;
    to?:         string;
    leadId?:     string;
}

/** ★★★ FUNCIÓN PRINCIPAL ★★★
 *  POST a /api/send-email con AbortController (8s timeout cliente) */
export async function sendLeadEmail(data: LeadEmailData): Promise<SendResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    try {
        const resp = await fetch("/api/send-email", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            body: JSON.stringify(data),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        let json: any = null;
        try {
            json = await resp.json();
        } catch (_) {
            return {
                ok: false,
                error: `Respuesta no-JSON del servidor (HTTP ${resp.status})`,
                via: "network-error",
                statusCode: resp.status,
            };
        }

        if (!resp.ok || !json?.ok) {
            return {
                ok: false,
                error: json?.error ?? `HTTP ${resp.status}`,
                via: "network-error",
                statusCode: resp.status,
            };
        }

        return {
            ok: true,
            via: "vercel-proxy",
            statusCode: resp.status,
            to: json.to,
            leadId: json.leadId,
        };
    } catch (e: any) {
        clearTimeout(timeoutId);
        if (e?.name === "AbortError") {
            return {
                ok: false,
                error: "Timeout: el servidor no respondió en 8 segundos",
                via: "client-timeout",
            };
        }
        console.error("[notify] network error:", e);
        return {
            ok: false,
            error: e?.message ?? "Error de red",
            via: "network-error",
        };
    }
}

export function getAdminEmail(): string {
    return ADMIN_EMAIL_DEFAULT;
}

// Compatibilidad legacy
export const EMAILJS_CONFIGURED = false;

export interface EmailJSConfigStatus {
    configured: boolean;
    missing:    string[];
    invalid:    string[];
    values:     { serviceId: string; templateId: string; publicKey: string };
    rawLengths: { serviceId: number; templateId: number; publicKey: number };
    source:     "env" | "fallback" | "none";
}

export function checkEmailJSConfig(): EmailJSConfigStatus {
    return {
        configured: false,
        missing: ["VITE_EMAILJS_*"],
        invalid: [],
        values: { serviceId: "", templateId: "", publicKey: "" },
        rawLengths: { serviceId: 0, templateId: 0, publicKey: 0 },
        source: "none",
    };
}

if (typeof window !== "undefined") {
    console.log(
        "%c[notify] v1.9.62",
        "background:#10b981;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold",
        "POST /api/send-email (Vercel Serverless). " +
        "Credenciales SOLO en el servidor. Timeout cliente: 8s."
    );
}
