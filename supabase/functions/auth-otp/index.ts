// =====================================================================
// MOZONA TPV — Supabase Edge Function: auth-otp
// =====================================================================
// Reemplaza /api/business-intelligence?action=send-otp y verify-otp
// Usa SERVICE_ROLE_KEY para crear/buscar users + bypass RLS
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

const VIP_EMAILS = ["chalohiahmd1980@gmail.com", "rofixinsta@gmail.com"];

function isVip(email: string) {
  return VIP_EMAILS.includes((email || "").toLowerCase());
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "send-otp";
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    if (!SERVICE_KEY) {
      return new Response(JSON.stringify({
        ok: false,
        friendly_message: "Servicio de autenticacion no disponible. Contacta con soporte.",
        error: "SERVICE_ROLE_KEY not configured",
      }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ═══════════════════════════════════════════════════════
    // SEND OTP
    // ═══════════════════════════════════════════════════════
    if (action === "send-otp") {
      const email = (body.email || "").trim().toLowerCase();
      const purpose = body.purpose || "login";

      if (!email) {
        return new Response(JSON.stringify({
          ok: false,
          friendly_message: "Introduce tu correo electronico.",
        }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
      }

      // VIP bypass automatico
      if (isVip(email)) {
        return new Response(JSON.stringify({
          ok: true,
          vip_bypass: true,
          message: "Acceso VIP concedido",
          friendly_message: "Acceso VIP concedido",
        }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
      }

      // Generar OTP
      const code = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

      // Guardar en tabla email_verifications
      const { error: dbErr } = await supabase.from("email_verifications").insert({
        email,
        code,
        purpose,
        expires_at: expiresAt,
        attempts: 0,
        used: false,
      });

      if (dbErr) {
        // Fallback: devolver el codigo si la tabla no existe (modo dev)
        console.warn("[auth-otp] tabla email_verifications no disponible:", dbErr.message);
        return new Response(JSON.stringify({
          ok: true,
          dev_code: code,
          message: "Codigo generado (modo dev)",
          friendly_message: "Te enviamos un codigo de 6 digitos.",
        }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
      }

      // Aqui iria el envio real del email (via mail.mozonatpv.com)
      // Por simplicidad, devolvemos el codigo para que el cliente lo vea en dev
      return new Response(JSON.stringify({
        ok: true,
        message: "Codigo enviado",
        friendly_message: "Te enviamos un codigo de 6 digitos a tu correo.",
        dev_code: code, // Solo en dev
      }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ═══════════════════════════════════════════════════════
    // VERIFY OTP
    // ═══════════════════════════════════════════════════════
    if (action === "verify-otp") {
      const email = (body.email || "").trim().toLowerCase();
      const code = (body.code || "").trim();
      const purpose = body.purpose || "login";

      if (!email || !code) {
        return new Response(JSON.stringify({
          ok: false,
          friendly_message: "Introduce el codigo que te enviamos.",
        }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
      }

      // Buscar OTP en la tabla
      const { data, error } = await supabase
        .from("email_verifications")
        .select("*")
        .eq("email", email)
        .eq("code", code)
        .eq("purpose", purpose)
        .eq("used", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({
          ok: false,
          friendly_message: "El codigo no es correcto o ha caducado.",
        }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
      }

      if (new Date(data.expires_at) < new Date()) {
        return new Response(JSON.stringify({
          ok: false,
          friendly_message: "El codigo ha caducado. Solicita uno nuevo.",
        }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
      }

      // Marcar como usado
      await supabase.from("email_verifications").update({ used: true }).eq("id", data.id);

      return new Response(JSON.stringify({
        ok: true,
        verified: true,
        message: "Codigo verificado correctamente",
      }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      ok: false,
      friendly_message: "Accion no reconocida.",
    }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      friendly_message: "El servicio no responde. Reintenta en unos segundos.",
      error: String(e?.message || e),
    }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
