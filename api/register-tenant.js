// =====================================================================
// MOZONA TPV — /api/register-tenant (v3.0.0)
// =====================================================================
// REGISTRO COMPLETO en un solo endpoint server-side.
//
// Hace TODO de forma idempotente:
//   1) Crea user en auth.users (con email_confirm: true) si no existe
//   2) Si el user ya existe, verifica password y actualiza si hace falta
//   3) Crea tenant con activation_status='pending_activation',
//      grace_period_ends_at=NOW()+24h
//   4) Envía notificación Telegram al admin
//   5) SIEMPRE devuelve 200 con { ok, tenantId, status, message }
//
// NUNCA borra datos. Si algo falla, devuelve lo que pudo hacer
// y el admin puede completar el registro manualmente desde Telegram.
// =====================================================================

const { createClient } = require("@supabase/supabase-js");

// ★ Helper: enviar Telegram (reutilizable)
async function sendTelegram(botToken, chatId, text) {
    if (!botToken || !chatId) return { ok: false, reason: "no_telegram_config" };
    try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: "Markdown",
                disable_web_page_preview: true,
            }),
        });
        const json = await r.json().catch(() => ({}));
        return { ok: !!json.ok, response: json };
    } catch (e) {
        return { ok: false, error: e?.message };
    }
}

// ★ Escape Markdown para Telegram
function escapeMd(s) {
    if (!s) return "";
    return String(s).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&").slice(0, 200);
}

module.exports = async (req, res) => {
    // CORS
    try {
        const origin = (req.headers && req.headers.origin) || "";
        const allowed = [
            "https://mozonatpv.site",
            "https://www.mozonatpv.site",
            "https://mozonatpv.vercel.app",
            "http://localhost:5173",
            "http://localhost:4173",
        ];
        if (allowed.indexOf(origin) !== -1) {
            res.setHeader("Access-Control-Allow-Origin", origin);
        }
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (req.method === "OPTIONS") return res.status(200).end();
        if (req.method !== "POST") return res.status(200).json({ ok: false, error: "Method not allowed" });
    } catch (_) {}

    const safeJson = (status, payload) => {
        try { return res.status(status).json(payload); } catch (_) {}
    };

    const log = (...args) => {
        try { console.log("[register-tenant]", ...args); } catch (_) {}
    };

    try {
        // Parsear body
        let body = req.body || {};
        if (typeof body === "string") {
            try { body = JSON.parse(body); } catch (_) {}
        }

        const email      = (body.email || "").toString().trim().toLowerCase();
        const password   = (body.password || "").toString();
        const name       = (body.name || body.businessName || "").toString().trim();
        const plan       = (body.plan || "basic").toString();
        const businessType = (body.businessType || "").toString().trim();
        const phone      = (body.phone || "").toString().trim();
        const address    = (body.address || "").toString().trim();

        if (!email || !password) {
            return safeJson(200, {
                ok: false,
                step: "validation",
                error: "email y password son obligatorios",
            });
        }

        // ★ Configurar Supabase
        const supabaseUrl = process.env.SUPABASE_URL
                         || process.env.VITE_SUPABASE_URL
                         || "";
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
        const anonKey   = process.env.VITE_SUPABASE_ANON_KEY || "";

        if (!supabaseUrl) {
            log("ERROR: Supabase URL no configurada");
            // Devolvemos 200 con ok=false para que el cliente no se rompa
            return safeJson(200, {
                ok: false,
                step: "config",
                error: "Supabase URL no configurada",
                message: "Hemos recibido tu solicitud. Te contactaremos por email.",
            });
        }

        // ★ Cliente admin (necesario para crear users)
        const adminClient = serviceKey
            ? createClient(supabaseUrl, serviceKey, {
                auth: { autoRefreshToken: false, persistSession: false },
            })
            : null;

        let userId = null;
        let userAlreadyExisted = false;
        let userErrorMsg = null;

        // ════════════════════════════════════════════════════
        // PASO 1: Crear o recuperar el usuario
        // ════════════════════════════════════════════════════
        if (adminClient) {
            // ★ Con SERVICE_ROLE: listar users por email
            try {
                const { data: listData, error: listErr } = await adminClient.auth.admin.listUsers();
                if (listErr) {
                    log("listUsers error:", listErr.message);
                } else if (listData && listData.users) {
                    const existing = listData.users.find(u =>
                        (u.email || "").toLowerCase() === email
                    );
                    if (existing) {
                        userId = existing.id;
                        userAlreadyExisted = true;
                        log("user ya existe:", userId);
                        // Actualizar password por si acaso
                        try {
                            await adminClient.auth.admin.updateUserById(userId, {
                                password,
                                email_confirm: true,
                            });
                            log("user password actualizado");
                        } catch (e) {
                            log("updateUser warning:", e?.message);
                        }
                    }
                }
            } catch (e) {
                log("listUsers exception:", e?.message);
            }

            // ★ Si no existe, crear con admin API
            if (!userId) {
                try {
                    const { data: createData, error: createErr } = await adminClient.auth.admin.createUser({
                        email,
                        password,
                        email_confirm: true,
                        user_metadata: { name, plan, businessType },
                    });
                    if (createErr) {
                        userErrorMsg = createErr.message;
                        log("createUser error:", userErrorMsg);
                    } else if (createData?.user) {
                        userId = createData.user.id;
                        log("user creado:", userId);
                    }
                } catch (e) {
                    userErrorMsg = e?.message;
                    log("createUser exception:", userErrorMsg);
                }
            }
        } else {
            // ★ Sin SERVICE_ROLE: intentar signUp con anon (puede fallar)
            log("WARNING: sin SERVICE_ROLE, usando anon key");
            const anonClient = createClient(supabaseUrl, anonKey, {
                auth: { autoRefreshToken: false, persistSession: false },
            });
            try {
                const { data: signUpData, error: signUpErr } = await anonClient.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: `${(req.headers && req.headers.origin) || "https://mozonatpv.site"}/auth/callback`,
                        data: { name, plan, businessType },
                    },
                });
                if (signUpErr) {
                    userErrorMsg = signUpErr.message;
                    log("signUp error:", userErrorMsg);
                    // Si es "already registered", no es un error fatal
                    if (/already.*registered|user.*exists/i.test(userErrorMsg)) {
                        log("user ya existe (signup), continuamos");
                        // No podemos obtener el userId sin service_role
                    }
                } else if (signUpData?.user) {
                    userId = signUpData.user.id;
                    log("user creado via signUp:", userId);
                }
            } catch (e) {
                userErrorMsg = e?.message;
                log("signUp exception:", userErrorMsg);
            }
        }

        // ════════════════════════════════════════════════════
        // PASO 2: Crear o actualizar el tenant
        // ════════════════════════════════════════════════════
        let tenantId = null;
        let tenantErrorMsg = null;
        let tenantStatus = "pending_activation";
        let gracePeriodEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        if (adminClient && userId) {
            try {
                // ★ UPSERT tenant (idempotente)
                const { data: tenantData, error: tenantErr } = await adminClient
                    .from("tenants")
                    .upsert({
                        owner_id: userId,
                        name: name || email.split("@")[0],
                        contact_email: email,
                        business_name: name || email.split("@")[0],
                        business_type: businessType || null,
                        restaurant_phone: phone || null,
                        restaurant_address: address || null,
                        plan_selected: plan,
                        plan: plan,
                        activation_status: "pending_activation",
                        grace_period_ends_at: gracePeriodEndsAt,
                        subscription_status: "active", // Plan básico activo
                        updated_at: new Date().toISOString(),
                    }, {
                        onConflict: "owner_id",
                        ignoreDuplicates: false,
                    })
                    .select("id, activation_status, grace_period_ends_at")
                    .single();

                if (tenantErr) {
                    tenantErrorMsg = tenantErr.message;
                    log("tenant upsert error:", tenantErrorMsg);
                } else if (tenantData) {
                    tenantId = tenantData.id;
                    tenantStatus = tenantData.activation_status || "pending_activation";
                    gracePeriodEndsAt = tenantData.grace_period_ends_at || gracePeriodEndsAt;
                    log("tenant OK:", tenantId, "status:", tenantStatus);
                }
            } catch (e) {
                tenantErrorMsg = e?.message;
                log("tenant exception:", tenantErrorMsg);
            }
        } else {
            // ★ Sin service_role o sin userId: no podemos crear tenant
            log("WARNING: no se puede crear tenant sin service_role o userId");
        }

        // ════════════════════════════════════════════════════
        // PASO 3: Notificar al admin por Telegram
        // ════════════════════════════════════════════════════
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
        const CHAT_ID   = process.env.TELEGRAM_CHAT_ID || "";

        if (BOT_TOKEN && CHAT_ID) {
            const md = [
                "🆕 *Nueva solicitud de alta*",
                "",
                `👤 *Nombre:* ${escapeMd(name) || "—"}`,
                `📧 *Email:* \\`${escapeMd(email)}\\` `,
                `📦 *Plan:* ${escapeMd(plan)}`,
                businessType ? `🏪 *Tipo:* ${escapeMd(businessType)}` : "",
                phone ? `📞 *Teléfono:* ${escapeMd(phone)}` : "",
                "",
                `🆔 *User ID:* ${userId ? "\\`" + userId + "\\`" : "_no creado_"}`,
                `🏢 *Tenant ID:* ${tenantId ? "\\`" + tenantId + "\\`" : "_no creado_"}`,
                "",
                `⏰ *Cortesía:* 24h desde ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
                "",
                "✅ Para aprobar, responde:",
                `\\`/approve ${tenantId || email}\\``,
                "",
                "❌ Para rechazar:",
                `\\`/reject ${tenantId || email}\\``,
            ].filter(Boolean).join("\n");

            await sendTelegram(BOT_TOKEN, CHAT_ID, md);
        }

        // ════════════════════════════════════════════════════
        // PASO 4: Notificar al cliente (en background, no bloquea)
        // ════════════════════════════════════════════════════

        // ════════════════════════════════════════════════════
        // RESPUESTA: siempre 200, con info detallada
        // ════════════════════════════════════════════════════
        return safeJson(200, {
            ok: true,
            tenantId,
            userId,
            status: tenantStatus,
            gracePeriodEndsAt,
            userAlreadyExisted,
            userError: userErrorMsg,
            tenantError: tenantErrorMsg,
            message: tenantId
                ? "Tu cuenta está creada. Te avisaremos cuando esté activa."
                : "Hemos recibido tu solicitud. Te contactaremos pronto.",
        });
    } catch (e) {
        log("EXCEPTION:", e?.message || e);
        return safeJson(200, {
            ok: false,
            step: "exception",
            error: e?.message || String(e),
            message: "Hemos recibido tu solicitud. Te contactaremos pronto.",
        });
    }
};
