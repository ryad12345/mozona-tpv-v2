// =====================================================================
// MOZONA TPV — AuthContext: sesión actual + helpers de Auth
// =====================================================================
// Maneja:
//   • signInWithEmail / signUpWithEmail
//   • signInWithGoogle (OAuth)
//   • signOut
//   • Listener onAuthStateChange
//   • profile (public.profiles) y tenant activo
//
// Las páginas ProtectedRoute / AdminRoute / SubscriptionGuard
// consumen este contexto.
// =====================================================================

import {
    createContext, useCallback, useContext, useEffect, useMemo, useState,
    type ReactNode,
} from "react";
import { isSupabaseConfigured, isSuperAdmin, supabase, type Tenant, type TenantUser, type UserProfile } from "./supabase";

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

export interface AuthState {
    status:        "loading" | "signed_in" | "signed_out" | "disabled";
    user:          import("@supabase/supabase-js").User | null;
    profile:       UserProfile | null;
    tenant:        Tenant | null;
    tenantRole:    TenantUser["role"] | null;
    isSuperAdmin:  boolean;
    isReady:       boolean;
}

export interface AuthContextValue extends AuthState {
    signIn:        (email: string, password: string) => Promise<{ error: string | null }>;
    signUp:        (email: string, password: string, name?: string) => Promise<{ error: string | null }>;
    signInWithGoogle: () => Promise<{ error: string | null }>;
    signOut:       () => Promise<void>;
    refresh:       () => Promise<void>;
    /** Crea un tenant para el usuario actual y lo marca como owner. */
    createTenant:  (name: string) => Promise<{ tenant: Tenant | null; error: string | null }>;
    /** Canjea un token de invitación.  Devuelve {tenant, error}. */
    redeemInvite:  (token: string) => Promise<{ tenant: Tenant | null; error: string | null }>;
}

// ---------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({
        status:       isSupabaseConfigured ? "loading" : "disabled",
        user:         null,
        profile:      null,
        tenant:       null,
        tenantRole:   null,
        isSuperAdmin: false,
        isReady:      !isSupabaseConfigured,
    });

    const loadTenantFor = useCallback(async (userId: string, email: string) => {
        // 1) ¿Es SuperAdmin?
        const sa = isSuperAdmin(email);
        if (sa) {
            // No necesitamos tenant real — bypass total
            setState(prev => ({
                ...prev,
                isSuperAdmin: true,
                tenantRole:   "superadmin",
                tenant:       null,
                isReady:      true,
            }));
            return;
        }
        // 2) Buscar tenant_users para este user_id
        const { data: tu, error: tuErr } = await supabase
            .from("tenant_users")
            .select("*, tenants:tenant_id (*)")
            .eq("user_id", userId)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

        if (tuErr) {
            console.warn("[Auth] tenant_users query:", tuErr.message);
        }
        const tenant = (tu?.tenants as unknown as Tenant) ?? null;
        setState(prev => ({
            ...prev,
            isSuperAdmin: false,
            tenant,
            tenantRole:   (tu?.role as TenantUser["role"]) ?? null,
            isReady:      true,
        }));
    }, []);

    const loadProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
        const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle();
        if (error) {
            console.warn("[Auth] profile query:", error.message);
            return null;
        }
        return data as UserProfile | null;
    }, []);

    const refresh = useCallback(async () => {
        if (!isSupabaseConfigured) {
            setState(prev => ({ ...prev, status: "disabled", isReady: true }));
            return;
        }
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user ?? null;
        if (!user) {
            setState({
                status: "signed_out", user: null, profile: null, tenant: null,
                tenantRole: null, isSuperAdmin: false, isReady: true,
            });
            return;
        }
        const profile = await loadProfile(user.id);
        await loadTenantFor(user.id, user.email ?? "");
        setState(prev => ({ ...prev, user, profile, status: "signed_in" }));
    }, [loadProfile, loadTenantFor]);

    // Mount: escuchar cambios de auth.
    // El listener INITIAL_SESSION de Supabase dispara con la sesión actual
    // (si existe), así que NO necesitamos llamar a refresh() aparte.
    useEffect(() => {
        if (!isSupabaseConfigured) return;
        const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (!session?.user) {
                setState({
                    status: "signed_out", user: null, profile: null, tenant: null,
                    tenantRole: null, isSuperAdmin: false, isReady: true,
                });
                return;
            }
            const profile = await loadProfile(session.user.id);
            await loadTenantFor(session.user.id, session.user.email ?? "");
            setState(prev => ({ ...prev, user: session.user, profile, status: "signed_in" }));
        });
        return () => { sub.subscription.unsubscribe(); };
    }, [loadProfile, loadTenantFor]);

    // -----------------------------------------------------------------
    // Acciones
    // -----------------------------------------------------------------

    const signIn = useCallback(async (email: string, password: string) => {
        if (!isSupabaseConfigured) return { error: "Supabase no configurado" };
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
    }, []);

    const signUp = useCallback(async (email: string, password: string, name?: string) => {
        if (!isSupabaseConfigured) return { error: "Supabase no configurado" };
        const { data, error } = await supabase.auth.signUp({
            email, password,
            options: { data: name ? { full_name: name } : {} },
        });
        if (error) return { error: error.message };
        // El trigger `handle_new_user` crea el perfil automáticamente
        // (SECURITY DEFINER, bypassea RLS).  No hace falta upsert manual.
        // Aquí creamos el tenant + vinculamos al usuario.
        if (data.user) {
            const { data: tenant, error: tErr } = await supabase.from("tenants").insert({
                name: name ?? "Mi Restaurante", owner_id: data.user.id, plan: "plus_30",
                subscription_status: "active",
            }).select().single();
            if (tErr) return { error: tErr.message };
            // Vinculamos al usuario como owner del tenant
            const { error: tuErr } = await supabase.from("tenant_users").insert({
                tenant_id: tenant.id, user_id: data.user.id, email,
                role: isSuperAdmin(email) ? "superadmin" : "owner", pin_code: "1234",
            });
            if (tuErr) return { error: tuErr.message };
        }
        return { error: null };
    }, []);

    const signInWithGoogle = useCallback(async () => {
        if (!isSupabaseConfigured) return { error: "Supabase no configurado" };
        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        return { error: error?.message ?? null };
    }, []);

    const signOut = useCallback(async () => {
        if (!isSupabaseConfigured) return;
        await supabase.auth.signOut();
    }, []);

    const createTenant = useCallback(async (name: string) => {
        if (!isSupabaseConfigured) return { tenant: null, error: "Supabase no configurado" };
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { tenant: null, error: "No hay sesión" };
        const { data: tenant, error } = await supabase.from("tenants").insert({
            name, owner_id: user.id, plan: "plus_30",
        }).select().single();
        if (error) return { tenant: null, error: error.message };
        await supabase.from("tenant_users").insert({
            tenant_id: tenant.id, user_id: user.id, email: user.email ?? "",
            role: "owner", pin_code: "1234",
        });
        return { tenant, error: null };
    }, []);

    const redeemInvite = useCallback(async (token: string) => {
        if (!isSupabaseConfigured) return { tenant: null, error: "Supabase no configurado" };
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { tenant: null, error: "No hay sesión" };
        // 1) Buscar invitación
        const { data: invite, error: invErr } = await supabase
            .from("free_invitations")
            .select("*")
            .eq("token", token)
            .maybeSingle();
        if (invErr) return { tenant: null, error: invErr.message };
        if (!invite) return { tenant: null, error: "Invitación no encontrada" };
        if (invite.is_redeemed) return { tenant: null, error: "Esta invitación ya fue canjeada" };
        if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
            return { tenant: null, error: "Invitación expirada" };
        }
        // 2) Crear tenant con el plan de la invitación
        const { data: tenant, error: tErr } = await supabase.from("tenants").insert({
            name: user.email?.split("@")[0] ?? "Mi Restaurante",
            owner_id: user.id, plan: invite.plan_granted ?? "lifetime_vip",
            subscription_status: "active",
        }).select().single();
        if (tErr) return { tenant: null, error: tErr.message };
        // 3) Vincular al usuario
        await supabase.from("tenant_users").insert({
            tenant_id: tenant.id, user_id: user.id, email: user.email ?? "",
            role: "owner", pin_code: "1234",
        });
        // 4) Marcar invitación como canjeada
        await supabase.from("free_invitations").update({
            is_redeemed: true, redeemed_by: user.id,
        }).eq("id", invite.id);
        return { tenant, error: null };
    }, []);

    // -----------------------------------------------------------------
    // Valor
    // -----------------------------------------------------------------

    const value = useMemo<AuthContextValue>(() => ({
        ...state,
        signIn, signUp, signInWithGoogle, signOut, refresh,
        createTenant, redeemInvite,
    }), [state, signIn, signUp, signInWithGoogle, signOut, refresh, createTenant, redeemInvite]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------


const STUB_AUTH: AuthContextValue = {
    user: null,
    tenant: null,
    profile: null,
    tenantRole: null,
    isReady: true,
    status: "disabled" as const,
    isSuperAdmin: false,
    signIn: async () => ({ error: "no provider" as const }),
    signUp: async () => ({ error: "no provider" as const }),
    signInWithGoogle: async () => ({ error: "no provider" as const }),
    signOut: async () => {},
    refresh: async () => {},
    createTenant: async () => ({ tenant: null, error: "no provider" as const }),
    redeemInvite: async () => ({ tenant: null, error: "no provider" as const }),
};

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        if (typeof console !== "undefined") {
            console.warn("[useAuth] sin <AuthProvider>");
        }
        return STUB_AUTH;
    }
    return ctx;
}
