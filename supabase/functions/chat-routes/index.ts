// =====================================================================
// MOZONA TPV — Supabase Edge Function: chat-routes
// =====================================================================
// Reemplaza /api/business-intelligence?action=chat
// Parsea intent del usuario y devuelve respuesta estructurada
// =====================================================================

// @ts-nocheck — Deno runtime
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?target=denonext";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://hcqkpokodrqimkulporw.supabase.co";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function parseIntent(text: string): { intent: string; period?: string } {
  const t = (text || "").toLowerCase().trim();
  if (/v[ei]nt[ae]s|hoy|ayer|semana|mes/.test(t)) return { intent: "query_sales" };
  if (/st[o0]ck|b[ao]j[o0]|reponer/.test(t)) return { intent: "query_low_stock" };
  if (/m[aá]s\s*vend|top|popular/.test(t)) return { intent: "query_top_products" };
  if (/mesa|cliente/.test(t)) return { intent: "query_table_stats" };
  if (/margen|rentab|profit/.test(t)) return { intent: "query_profit" };
  if (/apunta|anota|comanda/.test(t)) return { intent: "create_order" };
  return { intent: "query_sales" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const text = body.text || body.message || "";
    const tenantId = body.tenant_id;

    const { intent } = parseIntent(text);

    if (!SERVICE_KEY || !tenantId) {
      return new Response(JSON.stringify({
        ok: true,
        intent,
        message: "Soy Riyad. Estoy aqui para ayudarte con tu local. Preguntame sobre ventas, stock o mesas.",
        friendly_message: "Soy Riyad. Estoy aqui para ayudarte con tu local.",
        quickReplies: [
          { id: "sales-today", label: "💰 Ventas de hoy", prompt: "Como han ido las ventas hoy?" },
          { id: "low-stock", label: "📦 Stock bajo", prompt: "Que productos tienen stock bajo?" },
          { id: "tables", label: "🪑 Mesas", prompt: "Estado de las mesas ahora" },
        ],
      }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Aqui irian las queries reales. Por ahora devolvemos un placeholder estructurado.
    return new Response(JSON.stringify({
      ok: true,
      intent,
      message: "Consulta recibida. En un momento te muestro los datos.",
      quickReplies: [],
    }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      friendly_message: "El chat no responde. Reintenta.",
    }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
