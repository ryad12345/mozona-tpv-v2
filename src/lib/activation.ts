// =====================================================================
// MOZONA TPV — activation.ts (v1.9.75)
// =====================================================================
// Helper para crear tenant con 24h de cortesía automáticamente.
// El trigger de BD (database/28_activation_system.sql) crea la
// notificación interna para el SuperAdmin.
// =====================================================================

import { supabase } from "./supabase";

const GRACE_HOURS = 24;

export interface CreateActivationTenantInput {
    ownerId: string;
    businessName: string;
    planSelected?: string;
    contactEmail?: string;
    businessType?: string;
    restaurantAddress?: string;
    restaurantPhone?: string;
}

export interface CreateActivationTenantResult {
    ok: boolean;
    tenantId?: string;
    gracePeriodEndsAt?: string;
    error?: string;
}

/**
 * Crea un tenant con 24h de cortesía (pending_activation).
 * El trigger de BD inserta automáticamente la notificación
 * para el SuperAdmin en admin_notifications.
 */
export async function createTenantWithGrace(
    input: CreateActivationTenantInput,
): Promise<CreateActivationTenantResult> {
    let createdTenantId: string | null = null;
    try {
        const graceEndsAt = new Date(Date.now() + GRACE_HOURS * 3600_000).toISOString();

        // ★ Usamos upsert con onConflict para evitar duplicados si el owner
        //   ya tiene un tenant
        const { data, error } = await supabase
            .from("tenants")
            .upsert({
                owner_id:              input.ownerId,
                name:                  input.businessName,
                business_name:         input.businessName,
                plan:                  input.planSelected ?? "basic",
                plan_selected:         input.planSelected ?? "basic",
                contact_email:         input.contactEmail ?? null,
                activation_status:     "pending_activation",
                subscription_status:   "pending_activation",
                grace_period_ends_at:  graceEndsAt,
                trial_ends_at:         graceEndsAt, // fallback inicial
                onboarding_completed:  false,
                business_type:         input.businessType ?? null,
                restaurant_address:    input.restaurantAddress ?? null,
                restaurant_phone:      input.restaurantPhone ?? null,
            }, { onConflict: "owner_id" })
            .select()
            .single();

        if (error) {
            console.error("[activation] createTenant error:", error);
            return { ok: false, error: error.message };
        }
        if (!data) {
            return { ok: false, error: "No se devolvió tenant creado" };
        }
        createdTenantId = data.id;

        return {
            ok: true,
            tenantId: data.id,
            gracePeriodEndsAt: graceEndsAt,
        };
    } catch (e: any) {
        console.error("[activation] createTenant exception:", e);
        return { ok: false, error: e?.message ?? "Error desconocido" };
    } finally {
        // ★ v1.9.76: Disparar webhook en background (NO bloquea)
        // Si falla, el trigger de BD ya creó la notificación igualmente.
        // Es una capa adicional para redundancia + logging.
        try {
            void fetch("/api/notify-admin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tenantId:     createdTenantId,
                    businessName: input.businessName,
                    contactEmail: input.contactEmail,
                    planSelected: input.planSelected,
                    businessType: input.businessType,
                    address:      input.restaurantAddress,
                    phone:        input.restaurantPhone,
                    source:       "client-direct",
                }),
            }).catch((e) => {
                console.warn("[activation] webhook notify-admin falló (no bloqueante):", e?.message);
            });
        } catch (_) {
            // Silent: NUNCA debe bloquear el registro
        }

        // ★ v1.9.77: Disparar WhatsApp al SuperAdmin (Green API)
        // Capa adicional: además de admin_notifications, llega un WhatsApp
        // al móvil del admin. Si falla, el trigger SQL ya guardó la notif.
        try {
            void fetch("/api/notify-whatsapp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tenantId:     createdTenantId,
                    businessName: input.businessName,
                    contactEmail: input.contactEmail,
                    planSelected: input.planSelected,
                    businessType: input.businessType,
                    address:      input.restaurantAddress,
                    phone:        input.restaurantPhone,
                    source:       "client-direct",
                }),
            }).catch((e) => {
                console.warn("[activation] webhook notify-whatsapp falló (no bloqueante):", e?.message);
            });
        } catch (_) {
            // Silent: NUNCA debe bloquear el registro
        }

        // ★ v1.9.78: Disparar Telegram al SuperAdmin (canal principal)
        // Telegram es GRATIS e ILIMITADO. Canal principal de notificación.
        try {
            void fetch("/api/notify-telegram", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tenantId:     createdTenantId,
                    businessName: input.businessName,
                    contactEmail: input.contactEmail,
                    planSelected: input.planSelected,
                    businessType: input.businessType,
                    address:      input.restaurantAddress,
                    phone:        input.restaurantPhone,
                    source:       "client-direct",
                }),
            }).catch((e) => {
                console.warn("[activation] webhook notify-telegram falló (no bloqueante):", e?.message);
            });
        } catch (_) {
            // Silent: NUNCA debe bloquear el registro
        }
    }
}

/**
 * Polling del estado de activación del tenant actual.
 * Devuelve el estado o null si no se puede consultar.
 */
export async function fetchTenantActivationStatus(
    tenantId: string,
): Promise<{
    status: string;
    gracePeriodEndsAt: string | null;
    trialEndsAt: string | null;
    businessName: string | null;
    planSelected: string | null;
} | null> {
    try {
        const url = (import.meta.env.VITE_SUPABASE_URL || "").trim();
        const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
        if (!url || !key) return null;
        const r = await fetch(
            `${url}/rest/v1/tenants?id=eq.${tenantId}&select=activation_status,grace_period_ends_at,trial_ends_at,business_name,plan_selected,subscription_status`,
            { headers: { apikey: key, Authorization: `Bearer ${key}` } }
        );
        if (!r.ok) return null;
        const arr = await r.json();
        if (!arr || !arr[0]) return null;
        const t = arr[0];
        return {
            status: t.activation_status || t.subscription_status || "pending_activation",
            gracePeriodEndsAt: t.grace_period_ends_at ?? null,
            trialEndsAt: t.trial_ends_at ?? null,
            businessName: t.business_name ?? null,
            planSelected: t.plan_selected ?? null,
        };
    } catch (e) {
        console.warn("[activation] fetchTenantActivationStatus error:", e);
        return null;
    }
}
