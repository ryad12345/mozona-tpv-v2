// =====================================================================
// MOZONA TPV — AuthContext (Supabase real, sin mocks ni autologin)
// =====================================================================

import {
    createContext, useContext, useCallback, useEffect, useMemo, useState,
    type ReactNode,
} from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

export interface AuthUser {
    id:        string;
    email:     string;
    name?:     string;
    role:      "owner" | "manager" | "waiter" | "kitchen" | "demo";
    restaurant_id?: string;
    created_at?: string;
}

export interface AuthSession {
    access_token: string;
    refresh_token?: string;
    expires_at?:   number;
    user:          AuthUser;
}

export interface AuthContextValue {
    user:        AuthUser | null;
    session:     AuthSession | null;
    loading:     boolean;

    isReady?:    boolean;
    isSuperAdmin?: boolean;
    status?:     "loading" | "authenticated" | "unauthenticated" | "disabled";
    tenant?:     any;
    tenantRole?: any;
    profile?:    any;
    refresh?:    () => Promise<void>;
    createTenant?: (...args: any[]) => Promise<any>;
    redeemInvite?: (...args: any[]) => Promise<any>;
    signInWithGoogle?: (...args: any[]) => Promise<any>;

    signIn:           (email: string, password: string) => Promise<{ user: AuthUser | null; error: string | null }>;
    signInWithPassword:(email: string, password: string) => Promise<{ user: AuthUser | null; error: string | null }>;
    signOut:          () => Promise<void>;
    logout:           () => Promise<void>;
    signUp:           (email: string, password: string, name?: string) => Promise<{ user: AuthUser | null; error: string | null }>;
}

// ---------------------------------------------------------------------
// Persistencia local
// ---------------------------------------------------------------------

const STORAGE_KEY = "pos_current_user";

function loadFromStorage(): { user: AuthUser; session: AuthSession } | null {
    if (typeof localStorage === "undefined") return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.user?.email || !parsed?.session?.access_token) return null;
        // Verifica que el token no haya expirado
        if (parsed.session.expires_at && parsed.session.expires_at < Date.now()) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function saveToStorage(user: AuthUser | null, session: AuthSession | null): void {
    if (typeof localStorage === "undefined") return;
    if (user && session) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, session }));
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function supabaseUserToAuthUser(sbUser: any, tenantId?: string | null): AuthUser {
    const meta = sbUser?.user_metadata ?? {};
    const derivedName = (meta.full_name as string) || (meta.name as string)
        || sbUser?.email?.split("@")[0] || "Usuario";
    return {
        id:        sbUser.id,
        email:     (sbUser.email ?? "").toLowerCase(),
        name:      derivedName,
        role:      "owner",
        restaurant_id: tenantId ?? undefined,
        created_at: sbUser.created_at,
    };
}

function supabaseSessionToAuthSession(sbSession: any, user: AuthUser): AuthSession {
    return {
        access_token:  sbSession.access_token,
        refresh_token: sbSession.refresh_token,
        expires_at:    sbSession.expires_at
            ? sbSession.expires_at * 1000
            : Date.now() + 60 * 60 * 1000,
        user,
    };
}

// ---------------------------------------------------------------------
// Default
// ---------------------------------------------------------------------

const FALLBACK: AuthContextValue = {
    user: null, session: null, loading: false,
    signIn:           async () => ({ user: null, error: "no provider" }),
    signInWithPassword:async () => ({ user: null, error: "no provider" }),
    signOut:          async () => {},
    logout:           async () => {},
    signUp:           async () => ({ user: null, error: "no provider" }),
};

// ---------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue>(FALLBACK);

// ---------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------

export interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser]       = useState<AuthUser | null>(null);
    const [session, setSession] = useState<AuthSession | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    // Carga inicial: cache local + verificación con Supabase
    useEffect(() => {
        let mounted = true;

        const init = async () => {
            // 1) Hidratar desde localStorage (rápido)
            const cached = loadFromStorage();
            if (cached && mounted) {
                setUser(cached.user);
                setSession(cached.session);
            }

            // 2) Verificar con Supabase si está configurado
            if (isSupabaseConfigured) {
                try {
                    const { data, error } = await supabase.auth.getSession();
                    if (!mounted) return;
                    if (error) {
                        console.warn("[AuthContext] getSession error:", error.message);
                    } else if (data.session?.user) {
                        const u = supabaseUserToAuthUser(data.session.user);
                        const s = supabaseSessionToAuthSession(data.session, u);
                        setUser(u);
                        setSession(s);
                        saveToStorage(u, s);
                    } else if (cached) {
                        // Supabase dice que no hay sesión pero teníamos cache
                        setUser(null);
                        setSession(null);
                        saveToStorage(null, null);
                    }
                } catch (e) {
                    console.warn("[AuthContext] init error:", e);
                }
            }
            if (mounted) setLoading(false);
        };

        init();

        // 3) Suscribirse a cambios de auth (login/logout en otras pestañas)
        if (isSupabaseConfigured) {
            const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
                if (!mounted) return;
                if (newSession?.user) {
                    const u = supabaseUserToAuthUser(newSession.user);
                    const s = supabaseSessionToAuthSession(newSession, u);
                    setUser(u);
                    setSession(s);
                    saveToStorage(u, s);
                } else {
                    setUser(null);
                    setSession(null);
                    saveToStorage(null, null);
                }
            });
            return () => {
                mounted = false;
                sub.subscription.unsubscribe();
            };
        }

        return () => { mounted = false; };
    }, []);

    // -----------------------------------------------------------------
    // SignIn REAL con Supabase
    // -----------------------------------------------------------------
    const signIn = useCallback(async (email: string, password: string) => {
        if (!email || !password) {
            return { user: null, error: "Email y contraseña son obligatorios" };
        }
        if (!isSupabaseConfigured) {
            return { user: null, error: "Supabase no está configurado" };
        }
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim().toLowerCase(),
                password,
            });
            if (error) {
                return { user: null, error: error.message };
            }
            if (!data?.user || !data?.session) {
                return { user: null, error: "No se pudo iniciar sesión" };
            }
            const u = supabaseUserToAuthUser(data.user);
            const s = supabaseSessionToAuthSession(data.session, u);
            setUser(u);
            setSession(s);
            saveToStorage(u, s);
            return { user: u, error: null };
        } catch (e) {
            return { user: null, error: e instanceof Error ? e.message : String(e) };
        }
    }, []);

    const signInWithPassword = signIn;

    // -----------------------------------------------------------------
    // SignUp
    // -----------------------------------------------------------------
    const signUp = useCallback(async (email: string, password: string, name?: string) => {
        if (!email || !password) {
            return { user: null, error: "Email y contraseña son obligatorios" };
        }
        if (!isSupabaseConfigured) {
            return { user: null, error: "Supabase no está configurado" };
        }
        try {
            const { data, error } = await supabase.auth.signUp({
                email: email.trim().toLowerCase(),
                password,
                options: { data: { full_name: name ?? "" } },
            });
            if (error) return { user: null, error: error.message };
            // Si Supabase tiene confirmación por email, session puede ser null
            if (!data?.user) return { user: null, error: "No se pudo crear la cuenta" };
            if (data.session) {
                const u = supabaseUserToAuthUser(data.user);
                const s = supabaseSessionToAuthSession(data.session, u);
                setUser(u);
                setSession(s);
                saveToStorage(u, s);
                return { user: u, error: null };
            }
            return { user: null, error: "Revisa tu email para confirmar la cuenta" };
        } catch (e) {
            return { user: null, error: e instanceof Error ? e.message : String(e) };
        }
    }, []);

    // -----------------------------------------------------------------
    // SignOut
    // -----------------------------------------------------------------
    const signOut = useCallback(async () => {
        if (isSupabaseConfigured) {
            try { await supabase.auth.signOut(); } catch (e) {
                console.warn("[AuthContext] signOut error:", e);
            }
        }
        setUser(null);
        setSession(null);
        saveToStorage(null, null);
    }, []);

    const logout = signOut;

    // -----------------------------------------------------------------
    // Refresh: re-leer sesión
    // -----------------------------------------------------------------
    const refresh = useCallback(async () => {
        if (!isSupabaseConfigured) return;
        try {
            const { data } = await supabase.auth.getSession();
            if (data.session?.user) {
                const u = supabaseUserToAuthUser(data.session.user);
                const s = supabaseSessionToAuthSession(data.session, u);
                setUser(u);
                setSession(s);
                saveToStorage(u, s);
            }
        } catch (e) {
            console.warn("[AuthContext] refresh error:", e);
        }
    }, []);

    // -----------------------------------------------------------------
    // Stubs de compatibilidad
    // -----------------------------------------------------------------
    const createTenant = useCallback(async (..._args: any[]) => ({ error: "Use Stripe checkout" }), []);
    const redeemInvite = useCallback(async (..._args: any[]) => ({ error: "Not implemented" }), []);
    const signInWithGoogle = useCallback(async () => {
        if (!isSupabaseConfigured) return { error: "Supabase no configurado" };
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: `${window.location.origin}/auth/callback` },
            });
            return { error: error?.message ?? null };
        } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
        }
    }, []);

    const value = useMemo<AuthContextValue>(() => ({
        user, session, loading,
        isReady: !loading,
        isSuperAdmin: false,
        status: loading ? "loading" : (user ? "authenticated" : "unauthenticated"),
        tenant: null,
        tenantRole: null,
        profile: user,
        refresh, createTenant, redeemInvite, signInWithGoogle,
        signIn, signInWithPassword, signOut, logout, signUp,
    }), [user, session, loading, signIn, signUp, signOut, refresh,
         createTenant, redeemInvite, signInWithGoogle]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

// ---------------------------------------------------------------------
// Hook — NUNCA lanza
// ---------------------------------------------------------------------

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    return ctx ?? FALLBACK;
}

export function useAuthOptional(): AuthContextValue | null {
    return useContext(AuthContext);
}

export default AuthProvider;
