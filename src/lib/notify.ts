// =====================================================================
// MOZONA TPV — notify.ts (cliente)
// =====================================================================
// Wrapper cliente para envío de emails de leads.
//
// v1.9.57: CAMBIO ARQUITECTÓNICO IMPORTANTE
//   ANTES: el cliente llamaba directamente a EmailJS con credenciales
//          en el bundle (expuestas en repo público)
//   AHORA: el cliente hace POST a /api/send-email (Vercel serverless)
//          Las credenciales viven SOLO en el servidor de Vercel.
//
//   Cliente (browser)  -->  /api/send-email  -->  EmailJS API
//                                  ^
//                                  |
//                          Vercel Serverless Function
//                          (env vars EMAILJS_* en Vercel Dashboard)
//
// SEGURIDAD:
//   - Cero credenciales en el bundle
//   - CORS restringido a mozonatpv.site y localhost
//   - EmailJS nunca se llama desde el navegador
//   - Repo público sin riesgo de phishing
// =====================================================================

const ADMIN_EMAIL_DEFAULT = "rofixinsta@gmail.com";

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
    ok:         boolean;
    error?:     string;
    via:        "vercel-proxy" | "noop" | "network-error";
    statusCode?: number;
    to?:        string;
    leadId?:    string;
}

/** ★★★ FUNCIÓN PRINCIPAL ★★★
 *  Hace POST a /api/send-email. La Vercel Serverless Function
 *  lee las credenciales del servidor y llama a EmailJS. */
export async function sendLeadEmail(data: LeadEmailData): Promise<SendResult> {
    try {
        const resp = await fetch("/api/send-email", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            body: JSON.stringify(data),
        });

        let json: any = null;
        try {
            json = await resp.json();
        } catch (_) {
            // Si la respuesta no es JSON válido, devolvemos error genérico
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
        console.error("[notify] network error:", e);
        return {
            ok: false,
            error: e?.message ?? "Error de red",
            via: "network-error",
        };
    }
}

/** Helper: email del admin (privado, no se muestra en UI) */
export function getAdminEmail(): string {
    return ADMIN_EMAIL_DEFAULT;
}

/** ★ v1.9.57: función eliminada — ya no usamos EmailJS en el cliente
 *  Mantenemos EMAILJS_CONFIGURED exportado para compatibilidad,
 *  pero siempre retorna false (las credenciales viven en el servidor). */
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

// ★ v1.9.57: log informativo al cargar el módulo
if (typeof window !== "undefined") {
    console.log(
        "%c[notify] v1.9.57",
        "background:#10b981;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold",
        "Cliente usa /api/send-email (Vercel Serverless). " +
        "Credenciales en el SERVIDOR, no en el bundle."
    );
}
