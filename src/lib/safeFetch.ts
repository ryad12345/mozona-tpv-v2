// =====================================================================
// MOZONA TPV — safeFetch (v4.0.7-json-safe)
// =====================================================================
// Helper de fetch que NUNCA lanza SyntaxError por respuestas no-JSON.
// Verifica content-type antes de parsear y devuelve un objeto
// estructurado consistente en caso de error.
// =====================================================================

export interface SafeFetchOptions extends RequestInit {
    timeoutMs?: number;
}

export interface SafeFetchResult<T = any> {
    ok: boolean;
    status: number;
    data: T | null;
    error: string | null;
    friendly_message?: string;
    contentType: string;
    _rawPreview?: string;
}

/**
 * Fetch seguro que nunca lanza SyntaxError.
 * Si la respuesta no es JSON válido, devuelve { ok: false, error: "..." }
 * con un friendly_message para mostrar al usuario.
 */
export async function safeFetch<T = any>(
    url: string,
    options: SafeFetchOptions = {}
): Promise<SafeFetchResult<T>> {
    const { timeoutMs = 15000, ...fetchOptions } = options;

    try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), timeoutMs);

        let response: Response;
        try {
            response = await fetch(url, {
                ...fetchOptions,
                signal: controller.signal,
            });
        } finally {
            clearTimeout(tid);
        }

        const contentType = response.headers.get("content-type") || "";

        // ★ Si no es JSON, leer como texto y devolver error estructurado
        if (!contentType.includes("application/json") && !contentType.includes("text/json")) {
            const text = await response.text().catch(() => "");
            return {
                ok: false,
                status: response.status,
                data: null,
                error: `Respuesta no JSON (${contentType || "sin content-type"})`,
                friendly_message: "El servicio no responde correctamente. Reintenta en unos segundos.",
                contentType,
                _rawPreview: text.slice(0, 300),
            };
        }

        // ★ Intentar parsear JSON
        try {
            const data = await response.json();
            if (!response.ok) {
                return {
                    ok: false,
                    status: response.status,
                    data,
                    error: data?.error || data?.message || `HTTP ${response.status}`,
                    friendly_message: data?.friendly_message || "El servicio no responde correctamente.",
                    contentType,
                };
            }
            return {
                ok: true,
                status: response.status,
                data,
                error: null,
                contentType,
            };
        } catch (e: any) {
            const text = await response.text().catch(() => "");
            return {
                ok: false,
                status: response.status,
                data: null,
                error: `JSON malformado: ${e?.message || "unknown"}`,
                friendly_message: "El servicio respondió de forma inesperada. Reintenta en unos segundos.",
                contentType,
                _rawPreview: text.slice(0, 300),
            };
        }
    } catch (e: any) {
        // ★ Network error, timeout, etc
        const isTimeout = e?.name === "AbortError";
        return {
            ok: false,
            status: 0,
            data: null,
            error: isTimeout ? "Timeout" : (e?.message || "Network error"),
            friendly_message: isTimeout
                ? "La operación ha tardado demasiado. Reintenta en unos segundos."
                : "No pudimos conectar con el servicio. Revisa tu conexión a internet.",
            contentType: "",
        };
    }
}
