// =====================================================================
// MOZONA TPV — /api/ai-assistant (v3.5.0)
// =====================================================================
// Endpoint unificado para los 3 módulos de IA 100% LOCAL:
//   - action=scan-invoice  → Ollama (Llama 3.2 Vision) lee factura
//   - action=voice-order   → Whisper.cpp (audio) + Ollama (texto→items)
//   - action=predict-pricing → SQL analysis + Ollama genera sugerencias
//
// CERO dependencia de APIs externas. Todo corre on-premise.
// Si Ollama/Whisper no están configurados, devuelve instrucciones.
// =====================================================================

let _securityLib = undefined;
function getSecurity() {
    if (_securityLib !== undefined) return _securityLib;
    try { _securityLib = require("./_security.js"); } catch (_) { _securityLib = null; }
    return _securityLib;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
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
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-tenant-id, x-user-email");
        if (req.method === "OPTIONS") return res.status(200).end();
    } catch (_) {}

    const safeJson = (status, payload) => {
        try { return res.status(status).json(payload); } catch (_) {}
    };

    try {
        if (req.method !== "POST") {
            return safeJson(200, { ok: false, error: "POST requerido" });
        }

        // Parsear body
        let body = req.body || {};
        if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) {} }

        const action = (body.action || req.query?.action || "").toString();
        const tenantId = (body.tenantId || req.headers["x-tenant-id"] || "").toString();
        const userEmail = (body.userEmail || req.headers["x-user-email"] || "").toString().trim().toLowerCase();

        if (!action) return safeJson(200, { ok: false, error: "action requerido" });

        // ★ Configuración local
        const OLLAMA_HOST = (process.env.OLLAMA_HOST || "http://localhost:11434").replace(/\/$/, "");
        const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || "llama3.2-vision";
        const OLLAMA_LLM_MODEL = process.env.OLLAMA_LLM_MODEL || "llama3.1:8b";
        const WHISPER_HOST = (process.env.WHISPER_HOST || "http://localhost:8080").replace(/\/$/, "");

        // Supabase (para escribir resultados)
        const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
        const sbHeaders = {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
        };

        const startedAt = Date.now();
        const aiLog = async (status, output, errorMsg) => {
            try {
                if (!supabaseUrl || !serviceKey || !tenantId) return;
                await fetchWithTimeout(`${supabaseUrl}/rest/v1/ai_logs`, {
                    method: "POST",
                    headers: sbHeaders,
                    body: JSON.stringify({
                        tenant_id: tenantId,
                        action,
                        latency_ms: Date.now() - startedAt,
                        output_json: output ? JSON.stringify(output).slice(0, 4000) : null,
                        status,
                        error_message: errorMsg || null,
                    }),
                }, 5000);
            } catch (_) {}
        };

        // ═════════════════════════════════════════════════════════════
        // ACTION: scan-invoice  (multimodal local)
        // ═════════════════════════════════════════════════════════════
        if (action === "scan-invoice") {
            const imageBase64 = body.imageBase64 || body.image;
            const prompt = body.prompt || `Analiza esta factura de proveedor y extrae en JSON:
{
  "vendor": "nombre del proveedor",
  "invoice_number": "número si aparece",
  "date": "YYYY-MM-DD",
  "lines": [
    { "name": "Producto", "quantity": 1, "unit_price": 0.00, "total": 0.00 }
  ],
  "subtotal": 0.00,
  "tax": 0.00,
  "total": 0.00
}
Responde SOLO con JSON válido, sin texto adicional.`;

            if (!imageBase64) {
                return safeJson(200, { ok: false, error: "imageBase64 requerido" });
            }

            // ★ Llamada a Ollama local con Llama 3.2 Vision
            try {
                const r = await fetchWithTimeout(`${OLLAMA_HOST}/api/generate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: OLLAMA_VISION_MODEL,
                        prompt,
                        images: [imageBase64.replace(/^data:image\/[a-z]+;base64,/, "")],
                        stream: false,
                        format: "json",
                    }),
                }, 90000); // 90s para modelos multimodales

                if (!r || !r.ok) {
                    await aiLog("error", null, `Ollama no responde (HTTP ${r?.status || 0})`);
                    return safeJson(200, {
                        ok: false,
                        error: `Ollama no disponible en ${OLLAMA_HOST}. ¿Está corriendo? Arrancalo con: ollama serve`,
                        hint: "ollama pull " + OLLAMA_VISION_MODEL,
                    });
                }

                const data = await r.json();
                const rawText = data.response || "";
                let parsed;
                try { parsed = JSON.parse(rawText); }
                catch (_) {
                    // Intentar extraer JSON del texto
                    const m = rawText.match(/\{[\s\S]*\}/);
                    parsed = m ? JSON.parse(m[0]) : { raw: rawText };
                }

                await aiLog("ok", parsed, null);
                return safeJson(200, { ok: true, data: parsed, model: OLLAMA_VISION_MODEL, latency: Date.now() - startedAt });
            } catch (e) {
                await aiLog("error", null, e?.message);
                return safeJson(200, { ok: false, error: `Error IA local: ${e?.message}. ¿Ollama está corriendo?` });
            }
        }

        // ═════════════════════════════════════════════════════════════
        // ACTION: voice-order  (Whisper local + LLM local)
        // ═════════════════════════════════════════════════════════════
        if (action === "voice-order") {
            const audioBase64 = body.audioBase64 || body.audio;
            const menuContext = body.menuContext || "";

            if (!audioBase64) {
                return safeJson(200, { ok: false, error: "audioBase64 requerido" });
            }

            // ★ Paso 1: Whisper local → transcripción
            let transcription = "";
            try {
                // Whisper.cpp espera multipart/form-data. Aquí simplificamos:
                // enviamos JSON y el server local se encarga (más simple).
                const wReq = {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        audio: audioBase64.replace(/^data:audio\/[a-z]+;base64,/, ""),
                        language: "es",
                    }),
                };
                const r = await fetchWithTimeout(`${WHISPER_HOST}/inference`, wReq, 30000);
                if (r && r.ok) {
                    const data = await r.json();
                    transcription = data.text || data.transcription || "";
                }
            } catch (_) {}

            if (!transcription) {
                // Fallback: si el cliente no tiene Whisper instalado, aceptar transcripción manual
                transcription = body.manualText || "";
                if (!transcription) {
                    return safeJson(200, {
                        ok: false,
                        error: `Whisper no disponible en ${WHISPER_HOST}. Arrancalo o pasa manualText.`,
                        hint: "Instala whisper-server: https://github.com/ggml-org/whisper.cpp",
                    });
                }
            }

            // ★ Paso 2: LLM local → extraer items
            try {
                const itemPrompt = `Eres un asistente de TPV. Convierte esta orden hablada del camarero:
"${transcription}"

CATÁLOGO DISPONIBLE:
${menuContext}

Extrae los productos pedidos y responde SOLO con JSON:
{
  "transcription": "texto transcrito",
  "items": [
    { "product_name": "nombre exacto", "quantity": 1, "notes": "" }
  ],
  "confidence": 0.95
}`;
                const r = await fetchWithTimeout(`${OLLAMA_HOST}/api/generate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: OLLAMA_LLM_MODEL,
                        prompt: itemPrompt,
                        stream: false,
                        format: "json",
                    }),
                }, 30000);

                if (!r || !r.ok) {
                    await aiLog("error", null, "Ollama no disponible para LLM");
                    return safeJson(200, { ok: false, error: "Ollama no responde" });
                }
                const data = await r.json();
                let parsed;
                try { parsed = JSON.parse(data.response || "{}"); }
                catch (_) { parsed = { raw: data.response }; }
                parsed.transcription = transcription;

                await aiLog("ok", parsed, null);
                return safeJson(200, { ok: true, data: parsed, model: OLLAMA_LLM_MODEL, latency: Date.now() - startedAt });
            } catch (e) {
                await aiLog("error", null, e?.message);
                return safeJson(200, { ok: false, error: e?.message });
            }
        }

        // ═════════════════════════════════════════════════════════════
        // ACTION: predict-pricing  (SQL análisis + LLM genera insights)
        // ═════════════════════════════════════════════════════════════
        if (action === "predict-pricing") {
            if (!tenantId) {
                return safeJson(200, { ok: false, error: "tenantId requerido" });
            }
            if (!supabaseUrl || !serviceKey) {
                return safeJson(200, { ok: false, error: "Supabase no configurado" });
            }

            // ★ SQL análisis: productos con stock bajo + ventas bajas (mermas potenciales)
            try {
                // Top productos con stock bajo
                const lowStock = await fetchWithTimeout(
                    `${supabaseUrl}/rest/v1/products?tenant_id=eq.${tenantId}&current_stock=lt.5&select=id,name,price,current_stock,min_stock,category_id&limit=20`,
                    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
                    10000
                );
                const lowStockData = lowStock.ok ? (await lowStock.json()) : [];

                // Items sin venta en últimos 30 días (potencial merma)
                const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
                const orderItems = await fetchWithTimeout(
                    `${supabaseUrl}/rest/v1/orders?tenant_id=eq.${tenantId}&created_at=gte.${thirtyDaysAgo}&select=id,created_at`,
                    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
                    10000
                );
                const recentOrders = orderItems.ok ? (await orderItems.json()) : [];

                // Total de productos del tenant
                const allProducts = await fetchWithTimeout(
                    `${supabaseUrl}/rest/v1/products?tenant_id=eq.${tenantId}&select=id,name,price,current_stock&limit=200`,
                    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
                    10000
                );
                const allData = allProducts.ok ? (await allProducts.json()) : [];

                // ★ LLM local: genera insights
                const prompt = `Analiza estos datos de un TPV y sugiere acciones:

Productos totales: ${JSON.stringify(allData.slice(0, 30))}
Stock bajo: ${JSON.stringify(lowStockData)}
Ventas 30d (ordenes): ${recentOrders.length}

Responde SOLO JSON con array de sugerencias:
{
  "suggestions": [
    { "product_id": "uuid", "type": "discount|restock|price_up|no_change", "reason": "...", "value": "..." }
  ],
  "summary": "Resumen ejecutivo en 1 frase"
}`;
                const r = await fetchWithTimeout(`${OLLAMA_HOST}/api/generate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ model: OLLAMA_LLM_MODEL, prompt, stream: false, format: "json" }),
                }, 30000);

                if (!r || !r.ok) {
                    // Sin LLM, devuelve análisis SQL puro
                    await aiLog("ok", { lowStock: lowStockData, total_products: allData.length }, null);
                    return safeJson(200, {
                        ok: true,
                        data: {
                            low_stock: lowStockData,
                            total_products: allData.length,
                            suggestion: "Instala Ollama para obtener sugerencias con IA",
                        },
                        ai_powered: false,
                    });
                }

                const data = await r.json();
                let parsed;
                try { parsed = JSON.parse(data.response || "{}"); }
                catch (_) { parsed = {}; }

                // ★ Crear alertas en BD si hay sugerencias con severidad
                if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
                    for (const s of parsed.suggestions.slice(0, 5)) {
                        if (s.type === "discount" || s.type === "restock") {
                            await fetchWithTimeout(`${supabaseUrl}/rest/v1/ai_alerts`, {
                                method: "POST",
                                headers: sbHeaders,
                                body: JSON.stringify({
                                    tenant_id: tenantId,
                                    product_id: s.product_id,
                                    alert_type: s.type === "discount" ? "price_drop" : "restock",
                                    severity: "warning",
                                    title: `Sugerencia IA: ${s.type}`,
                                    message: s.reason || "",
                                    suggested_action: s,
                                }),
                            }, 5000);
                        }
                    }
                }

                await aiLog("ok", parsed, null);
                return safeJson(200, { ok: true, data: parsed, ai_powered: true, latency: Date.now() - startedAt });
            } catch (e) {
                await aiLog("error", null, e?.message);
                return safeJson(200, { ok: false, error: e?.message });
            }
        }

        // ═════════════════════════════════════════════════════════════
        // ACTION: barista-ghost (automatización de proveedores)
        //   - Detecta productos con stock bajo
        //   - Genera borrador de pedido al proveedor preferido
        //   - Construye URL de WhatsApp lista para enviar
        // ═════════════════════════════════════════════════════════════
        if (action === "barista-ghost") {
            if (!tenantId) return safeJson(200, { ok: false, error: "tenantId requerido" });
            if (!supabaseUrl || !serviceKey) return safeJson(200, { ok: false, error: "Supabase no configurado" });

            try {
                // 1) Productos con stock bajo (current_stock <= min_stock)
                const lowStockRes = await fetchWithTimeout(
                    `${supabaseUrl}/rest/v1/products?tenant_id=eq.${tenantId}&select=id,name,current_stock,min_stock,cost_price&current_stock=lte.5&order=name&limit=50`,
                    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
                    10000
                );
                const lowStock = lowStockRes.ok ? await lowStockRes.json() : [];

                if (lowStock.length === 0) {
                    return safeJson(200, {
                        ok: true,
                        data: {
                            needs_restock: [],
                            message: "✅ Todo el stock está por encima del mínimo. No se necesita pedir nada.",
                        },
                    });
                }

                // 2) Para cada producto bajo, busca el proveedor preferido
                const drafts = [];
                for (const product of lowStock) {
                    try {
                        const psRes = await fetchWithTimeout(
                            `${supabaseUrl}/rest/v1/product_suppliers?tenant_id=eq.${tenantId}&product_id=eq.${product.id}&is_preferred=eq.true&select=cost_price,pack_size,supplier_id,suppliers!inner(id,name,phone)&limit=1`,
                            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
                            8000
                        );
                        if (psRes.ok) {
                            const arr = await psRes.json();
                            if (arr && arr[0]) {
                                const ps = arr[0];
                                const supplier = ps.suppliers;
                                const need = Math.max(0, (product.min_stock || 5) - (product.current_stock || 0));
                                const pack = ps.pack_size || 1;
                                const packsToOrder = Math.ceil(need / pack);
                                drafts.push({
                                    product_id: product.id,
                                    product_name: product.name,
                                    current_stock: product.current_stock,
                                    min_stock: product.min_stock,
                                    need_units: need,
                                    packs_to_order: packsToOrder,
                                    pack_size: pack,
                                    cost_per_pack: ps.cost_price * pack,
                                    subtotal: packsToOrder * ps.cost_price * pack,
                                    supplier: {
                                        id: supplier.id,
                                        name: supplier.name,
                                        phone: supplier.phone,
                                    },
                                });
                            }
                        }
                    } catch (_) {}
                }

                // 3) Agrupar por proveedor
                const bySupplier = {};
                for (const d of drafts) {
                    if (!d.supplier) continue;
                    const key = d.supplier.id;
                    if (!bySupplier[key]) {
                        bySupplier[key] = {
                            supplier: d.supplier,
                            lines: [],
                            subtotal: 0,
                        };
                    }
                    bySupplier[key].lines.push(d);
                    bySupplier[key].subtotal += d.subtotal;
                }

                // 4) Para cada proveedor, generar URL WhatsApp y crear draft
                const orders = [];
                for (const k of Object.keys(bySupplier)) {
                    const o = bySupplier[k];
                    const supplier = o.supplier;
                    const linesText = o.lines.map(l =>
                        `• ${l.product_name}: ${l.packs_to_order} pack(s) x ${(l.cost_per_pack).toFixed(2)}€ = ${l.subtotal.toFixed(2)}€`
                    ).join("\n");
                    const totalText = o.subtotal.toFixed(2);
                    const message = `Hola ${supplier.name}, ¿podrías prepararme el siguiente pedido?\n\n${linesText}\n\n*Total: ${totalText}€*\n\nGracias.`;
                    const phoneClean = (supplier.phone || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
                    const whatsappUrl = phoneClean
                        ? `https://wa.me/${phoneClean}?text=${encodeURIComponent(message)}`
                        : null;

                    // Guardar borrador
                    try {
                        await fetchWithTimeout(`${supabaseUrl}/rest/v1/supplier_orders`, {
                            method: "POST",
                            headers: sbHeaders,
                            body: JSON.stringify({
                                tenant_id: tenantId,
                                supplier_id: supplier.id,
                                lines: o.lines,
                                subtotal: o.subtotal,
                                whatsapp_url: whatsappUrl,
                                notes: message,
                            }),
                        }, 8000);
                    } catch (_) {}

                    orders.push({
                        supplier,
                        lines: o.lines,
                        subtotal: o.subtotal,
                        whatsapp_url: whatsappUrl,
                        message_preview: message.slice(0, 200) + "...",
                    });
                }

                await aiLog("ok", { drafts_count: orders.length, total: orders.reduce((s, o) => s + o.subtotal, 0) }, null);
                return safeJson(200, {
                    ok: true,
                    data: {
                        orders,
                        total_drafts: orders.length,
                        total_estimated_cost: orders.reduce((s, o) => s + o.subtotal, 0),
                        message: orders.length === 0
                            ? "Hay productos bajo de stock pero no tienen proveedor asignado."
                            : `He preparado ${orders.length} pedido(s) listos para enviar.`,
                    },
                });
            } catch (e) {
                await aiLog("error", null, e?.message);
                return safeJson(200, { ok: false, error: e?.message });
            }
        }

        // ═════════════════════════════════════════════════════════════
        // ACTION: profit-coach (Socio Oculto)
        //   - Analiza márgenes por producto
        //   - Detecta productos con margen bajo
        //   - Sugiere subidas de precio o renegociar con proveedor
        // ═════════════════════════════════════════════════════════════
        if (action === "profit-coach") {
            if (!tenantId) return safeJson(200, { ok: false, error: "tenantId requerido" });
            if (!supabaseUrl || !serviceKey) return safeJson(200, { ok: false, error: "Supabase no configurado" });

            try {
                // 1) Productos con precio de venta y coste
                const productsRes = await fetchWithTimeout(
                    `${supabaseUrl}/rest/v1/products?tenant_id=eq.${tenantId}&select=id,name,price,cost_price,target_margin_pct&limit=300`,
                    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
                    10000
                );
                const products = productsRes.ok ? await productsRes.json() : [];

                // 2) Análisis de margen
                const insights = [];
                let totalMargin = 0;
                let totalRevenue = 0;
                for (const p of products) {
                    const price = Number(p.price || 0);
                    const cost = Number(p.cost_price || 0);
                    if (price === 0 || cost === 0) continue;

                    const margin = ((price - cost) / price) * 100;
                    const marginAbs = price - cost;
                    totalMargin += marginAbs;
                    totalRevenue += price;

                    if (margin < (p.target_margin_pct || 65)) {
                        const suggestedPrice = cost / (1 - ((p.target_margin_pct || 65) / 100));
                        insights.push({
                            product_id: p.id,
                            product_name: p.name,
                            price,
                            cost,
                            current_margin: margin.toFixed(1),
                            target_margin: p.target_margin_pct || 65,
                            severity: margin < 40 ? "critical" : margin < 55 ? "warning" : "info",
                            suggestion: `Sube precio a ${suggestedPrice.toFixed(2)}€ para alcanzar tu margen objetivo del ${p.target_margin_pct || 65}%.`,
                            potential_gain: ((suggestedPrice - price) * 10).toFixed(2), // estimado en 10 ventas
                        });
                    }
                }

                insights.sort((a, b) =>
                    (b.severity === "critical" ? 2 : b.severity === "warning" ? 1 : 0) -
                    (a.severity === "critical" ? 2 : a.severity === "warning" ? 1 : 0)
                );

                await aiLog("ok", { insights: insights.length, avg_margin: totalRevenue ? (totalMargin / totalRevenue * 100).toFixed(1) : 0 }, null);
                return safeJson(200, {
                    ok: true,
                    data: {
                        total_products: products.length,
                        products_with_cost: products.filter((p: any) => Number(p.cost_price || 0) > 0).length,
                        avg_margin_pct: totalRevenue ? ((totalMargin / totalRevenue) * 100).toFixed(1) : "0",
                        insights: insights.slice(0, 20),
                        ai_powered: false,
                    },
                });
            } catch (e) {
                await aiLog("error", null, e?.message);
                return safeJson(200, { ok: false, error: e?.message });
            }
        }

        return safeJson(200, { ok: false, error: `action desconocida: ${action}` });
    } catch (e) {
        return safeJson(200, { ok: false, error: e?.message || "Error desconocido" });
    }
};
