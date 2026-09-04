// =====================================================================
// MOZONA TPV — supabase.ts: cliente Supabase Cloud (SaaS multi-tenant)
// =====================================================================
// El cliente único se usa para:
//   • Auth (signIn, signUp, OAuth, session, onAuthStateChange)
//   • Datos de tenant (restaurants, products, tables, orders, ...)
//   • Realtime (postgres_changes) para sincronizar comandas entre TPV
//     y móviles.
//   • Storage (imágenes de productos, logos)
//
// La app offline (sin .env) sigue funcionando con mock data y
// `isSupabaseConfigured = false`.
// =====================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------
// Configuración desde variables de entorno Vite
// ---------------------------------------------------------------------

const SUPABASE_URL   = (import.meta.env.VITE_SUPABASE_URL      ?? "").trim();
const SUPABASE_ANON  = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

/** true si hay URL + anon key válidas. */
export const isSupabaseConfigured: boolean =
    SUPABASE_URL.startsWith("https://") && SUPABASE_ANON.length > 20;

/** Email del SuperAdmin (bypass paywall + acceso a /admin/invites). */
export const SUPERADMIN_EMAIL: string =
    (import.meta.env.VITE_SUPERADMIN_EMAIL ?? "rofixinsta@gmail.com").trim().toLowerCase();

/** URL pública absoluta (para Stripe Checkout, magic links, etc). */
export const PUBLIC_URL: string =
    (import.meta.env.VITE_PUBLIC_URL
        ?? (typeof window !== "undefined" ? window.location.origin : "https://mozona-tpv.com")
    ).replace(/\/+$/, "");

/** Cliente Supabase.  Si no está configurado, devuelve un cliente
 *  "dummy" que fallará al usarse.  Mantenerlo exportado para que
 *  los demás módulos (auth, syncEngine, etc.) no rompan al importar. */
export const supabase: SupabaseClient = isSupabaseConfigured
    ? createClient(SUPABASE_URL, SUPABASE_ANON, {
        auth: {
            persistSession:    true,
            autoRefreshToken:  true,
            detectSessionInUrl: true,
            storageKey:        "mozona.auth.session",
        },
        realtime: { params: { eventsPerSecond: 10 } },
        global: {
            headers: { "x-application-name": "mozona-tpv" },
        },
    })
    : createClient("https://placeholder.supabase.co", "placeholder-anon-key", {
        auth:   { persistSession: false },
        global: { fetch: () => Promise.reject(new Error("Supabase no configurado")) },
    });

// ---------------------------------------------------------------------
// Helpers de identificación
// ---------------------------------------------------------------------

/** restaurant_id persistido en IndexedDB meta (legacy). */
export const RESTAURANT_ID_KEY = "mozona.restaurant_id";

/** ¿El email pertenece al SuperAdmin? */
export function isSuperAdmin(email: string | null | undefined): boolean {
    if (!email) return false;
    return email.trim().toLowerCase() === SUPERADMIN_EMAIL;
}

// ---------------------------------------------------------------------
// Tipo UserProfile (espejo de public.profiles)
// ---------------------------------------------------------------------

export interface UserProfile {
    id:     string;
    email:  string;
    name?:  string | null;
    avatar_url?: string | null;
    is_superadmin?: boolean;
    created_at?: string;
}

export interface TenantUser {
    id:        string;
    tenant_id: string;
    user_id:   string;
    email:     string;
    role:      "owner" | "waiter" | "cashier" | "superadmin";
    pin_code:  string;
    created_at: string;
}

export interface Tenant {
    id:                    string;
    name:                  string;
    owner_id:              string;
    plan:                  "plus_30" | "pro_50" | "lifetime_vip";
    subscription_status:   "active" | "trialing" | "past_due" | "canceled"
                          | "trial" | "expired";
    trial_started_at?:     string | null;
    trial_ends_at?:        string | null;
    cancelled_at?:         string | null;
    stripe_customer_id?:     string | null;
    stripe_subscription_id?: string | null;
    /** Datos fiscales del tenant (rellenados en el wizard) */
    cif_nif?:              string | null;
    address?:              string | null;
    phone?:                string | null;
    primary_color?:        string;
    ticket_footer_msg?:    string;
    default_tax_rate?:     number;
    /** `false` hasta que el cliente completa el wizard inicial. */
    onboarding_completed?: boolean;
    created_at:           string;
}

// ---------------------------------------------------------------------
// requireRestaurantId: ahora apunta a IndexedDB meta
// ---------------------------------------------------------------------

/** Versión síncrona deprecada — usar `syncEngine.getRestaurantId()` */
export function requireRestaurantId(): string {
    throw new Error(
        "requireRestaurantId() está deprecated.  " +
        "Importa getRestaurantId() desde './syncEngine' o " +
        "RestaurantContext desde './tenant'."
    );
}
