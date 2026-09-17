// =====================================================================
// MOZONA TPV — /api/business-intelligence (v3.6.0)
// =====================================================================
// DECISION ARQUITECTONICA: Logica de negocio nativa en SQL.
//   - action=restock-drafts: get_restock_drafts() SQL puro
//   - action=profit-insights: get_profit_insights() SQL puro
//   - action=invoice-scan:    IA centralizada (AI_BACKEND_URL)
//   - action=voice-order:     IA centralizada (AI_BACKEND_URL)
//
// CERO latencia IA para Barista y Socio (instantaneo).
// CERO friccion para el cliente: IA corre en NUESTRO servidor.
// =====================================================================

let _securityLib = undefined;
function getSecurity() {
    if (_securityLib !== undefined) return _securityLib;
    try { _securityLib = require("./_security.js"); } catch (_) { _securityLib = null; }
    return _securityLib;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const r = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(tid);
        return r;
    } catch (e) {
        clearTimeout(tid);
        return { ok: false, status: 0, error: e };
    }
}

module.exports = async (req, res) => {
    const sec = getSecurity();
    try { if (sec) sec.applySecurityHeaders(res); } catch (_) {}

    // CORS
    try {
        const origin = (req.headers && req.headers.origin) || "";
        const allowed = [
            "https://mozonatpv.site", "https://www.mozonatpv.site",
            "https://mozonatpv.vercel.app", "http://localhost:5173", "http://localhost:4173"
        ];
        if (allowed.indexOf(origin) !== -1) res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-tenant-id");
        if (req.method === "OPTIONS") return res.status(200).end();
    } catch (_) {}

    const safeJson = (status, payload) => {
        try { return res.status(status).json(payload); } catch (_) {}
    };

    try {
        const action = (req.query?.action || req.body?.action || "").toString();
        if (!action) return safeJson(200, { ok: false, error: "action requerido" });

        const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
        // ★ v3.6.0: IA CENTRALIZADA — apunta a NUESTRO servidor
        const AI_BACKEND_URL = (process.env.AI_BACKEND_URL || "https://ai.mozonatpv.com").replace(/\/$/, "");

        if (!supabaseUrl || !serviceKey) {
            return safeJson(200, { ok: false, error: "Sistema no configurado" });
        }

        const headers = {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
        };

        // ═════════════════════════════════════════════════════════════
        // 1. 🌌 BARISTA FANTASMA — SQL puro (instantáneo)
        // ═════════════════════════════════════════════════════════════
        if (action === "restock-drafts") {
            const tenantId = (req.body?.tenantId || req.query?.tenantId || "").toString();
            if (!tenantId) return safeJson(200, { ok: false, error: "tenantId requerido" });

            try {
                const r = await fetchWithTimeout(`${supabaseUrl}/rest/v1/rpc/get_restock_drafts`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ p_tenant_id: tenantId }),
                }, 8000);

                if (!r || !r.ok) {
                    const errText = r ? await r.text() : "no response";
                    return safeJson(200, { ok: false, error: `SQL error: ${errText.slice(0, 200)}`, hint: "Aplica database/39_native_business_logic.sql" });
                }

                const data = await r.json();
                // Guardar borradores en supplier_orders para auditoría
                if (data.orders && data.orders.length > 0) {
                    const inserts = data.orders.map((o: any) => ({
                        tenant_id: tenantId,
                        supplier_id: o.supplier_id,
                        status: "draft",
                        lines: o.lines,
                        subtotal: parseFloat(o.subtotal),
                        whatsapp_url: o.whatsapp_url,
                        notes: o.message_preview,
                    }));
                    try {
                        await fetchWithTimeout(`${supabaseUrl}/rest/v1/supplier_orders`, {
                            method: "POST",
                            headers,
                            body: JSON.stringify(inserts),
                        }, 5000);
                    } catch (_) {}
                }
                return safeJson(200, { ok: true, ...data, source: "sql_native" });
            } catch (e) {
                return safeJson(200, { ok: false, error: e?.message });
            }
        }

        // ═════════════════════════════════════════════════════════════
        // 2. 👥 SOCIO OCULTO — SQL puro (instantáneo)
        // ═════════════════════════════════════════════════════════════
        if (action === "profit-insights") {
            const tenantId = (req.body?.tenantId || req.query?.tenantId || "").toString();
            if (!tenantId) return safeJson(200, { ok: false, error: "tenantId requerido" });

            try {
                const r = await fetchWithTimeout(`${supabaseUrl}/rest/v1/rpc/get_profit_insights`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ p_tenant_id: tenantId }),
                }, 8000);

                if (!r || !r.ok) {
                    const errText = r ? await r.text() : "no response";
                    return safeJson(200, { ok: false, error: `SQL error: ${errText.slice(0, 200)}`, hint: "Aplica database/39_native_business_logic.sql" });
                }

                const data = await r.json();
                return safeJson(200, { ok: true, ...data, source: "sql_native" });
            } catch (e) {
                return safeJson(200, { ok: false, error: e?.message });
            }
        }

        // ═════════════════════════════════════════════════════════════
        // 3. 📸 ESCANER FACTURAS — IA CENTRALIZADA (nuestra infra)
        // ═════════════════════════════════════════════════════════════
        if (action === "invoice-scan") {
            if (req.method !== "POST") return safeJson(200, { ok: false, error: "POST requerido" });
            const body = req.body || {};
            const imageBase64 = body.imageBase64 || body.image;
            if (!imageBase64) return safeJson(200, { ok: false, error: "imageBase64 requerido" });

            try {
                // ★ Delegar a NUESTRO backend IA centralizado (sin Ollama local del cliente)
                const r = await fetchWithTimeout(`${AI_BACKEND_URL}/api/vision/invoice`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        image: imageBase64,
                        tenant_id: req.body.tenantId,
                        customer: "mozona",
                    }),
                }, 60000);

                if (!r || !r.ok) {
                    return safeJson(200, {
                        ok: false,
                        error: `IA centralizada no responde (${r?.status || 0}). Contacta soporte.`,
                        ai_backend: AI_BACKEND_URL,
                    });
                }

                const data = await r.json();

                // Log en ai_logs
                try {
                    await fetchWithTimeout(`${supabaseUrl}/rest/v1/ai_logs`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            tenant_id: req.body.tenantId || null,
                            action: "invoice_scan",
                            model: "centralized_llama3.2_vision",
                            latency_ms: data.latency_ms || 0,
                            output_json: data.result || null,
                            status: "ok",
                        }),
                    }, 5000);
                } catch (_) {}

                return safeJson(200, { ok: true, data: data.result || data, model: "centralized_llama3.2_vision" });
            } catch (e) {
                return safeJson(200, { ok: false, error: e?.message });
            }
        }

        // ═════════════════════════════════════════════════════════════
        // 4. 🎙️ VOZ — IA CENTRALIZADA (Whisper nuestro + LLM nuestro)
        // ═════════════════════════════════════════════════════════════
        if (action === "voice-order") {
            if (req.method !== "POST") return safeJson(200, { ok: false, error: "POST requerido" });
            const body = req.body || {};
            const audioBase64 = body.audioBase64 || body.audio;
            if (!audioBase64 && !body.manualText) return safeJson(200, { ok: false, error: "audioBase64 o manualText requerido" });

            try {
                const r = await fetchWithTimeout(`${AI_BACKEND_URL}/api/voice/order`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        audio: audioBase64,
                        manual_text: body.manualText,
                        menu_context: body.menuContext,
                        tenant_id: req.body.tenantId,
                    }),
                }, 60000);

                if (!r || !r.ok) {
                    return safeJson(200, { ok: false, error: `IA voz no responde (${r?.status || 0})` });
                }
                const data = await r.json();

                try {
                    await fetchWithTimeout(`${supabaseUrl}/rest/v1/ai_logs`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            tenant_id: req.body.tenantId || null,
                            action: "voice_order",
                            model: "centralized_whisper+llama",
                            output_json: data,
                            status: "ok",
                        }),
                    }, 5000);
                } catch (_) {}

                return safeJson(200, { ok: true, data, model: "centralized_whisper+llama" });
            } catch (e) {
                return safeJson(200, { ok: false, error: e?.message });
            }
        }

        return safeJson(200, { ok: false, error: `action desconocida: ${action}` });
    } catch (e) {
        return safeJson(200, { ok: false, error: e?.message || "Error" });
    }
};
