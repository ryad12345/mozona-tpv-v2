// =====================================================================
// MOZONA TPV — AuthContext (con persistencia en localStorage)
// =====================================================================
// AuthProvider y useAuth() exponen user, session, loading, signIn,
// signInWithPassword, signOut, logout.  Persistencia en localStorage
// bajo la clave "pos_current_user" para que el login en /auth nunca
// devuelva "no provider" y el usuario permanezca logged en tras refresh.
// =====================================================================

import {
    createContext, useContext, useCallback, useEffect, useMemo, useState,
    type ReactNode,
} from "react";

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

    /** Compatibilidad con la API anterior (Supabase) — opcionales */
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

    /** Inicia sesión con email + password (modo demo usa localStorage) */
    signIn:      (email: string, password: string) => Promise<{ user: AuthUser | null; error: string | null }>;
    /** Alias de signIn (compatibilidad con supabase) */
    signInWithPassword: (email: string, password: string) => Promise<{ user: AuthUser | null; error: string | null }>;
    /** Cierra sesión */
    signOut:     () => Promise<void>;
    /** Alias de signOut */
    logout:      () => Promise<void>;

    /** Crea un usuario nuevo (demo: lo guarda en localStorage) */
    signUp:      (email: string, password: string, name?: string) => Promise<{ user: AuthUser | null; error: string | null }>;
}

// ---------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------

const STORAGE_KEY = "pos_current_user";

function loadFromStorage(): { user: AuthUser; session: AuthSession } | null {
    if (typeof localStorage === "undefined") return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.user?.email) return null;
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
// Utilidades
// ---------------------------------------------------------------------

function makeId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeSession(user: AuthUser): AuthSession {
    return {
        access_token:  `demo-${makeId()}`,
        refresh_token: `demo-r-${makeId()}`,
        expires_at:    Date.now() + 30 * 24 * 60 * 60 * 1000,
        user,
    };
}

function makeUser(email: string, name?: string): AuthUser {
    const cleanEmail = email.trim().toLowerCase();
    const derivedName = name?.trim() || cleanEmail.split("@")[0] || "Usuario";
    return {
        id:        makeId(),
        email:     cleanEmail,
        name:      derivedName,
        role:      "owner",
        created_at: new Date().toISOString(),
    };
}

// ---------------------------------------------------------------------
// Default (modo demo, NUNCA null/undefined)
// ---------------------------------------------------------------------

const FALLBACK: AuthContextValue = {
    user: null, session: null, loading: false,
    signIn: async () => ({ user: null, error: "no provider" }),
    signInWithPassword: async () => ({ user: null, error: "no provider" }),
    signOut: async () => {},
    logout: async () => {},
    signUp: async () => ({ user: null, error: "no provider" }),
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

    // Carga inicial desde localStorage
    useEffect(() => {
        const cached = loadFromStorage();
        if (cached) {
            setUser(cached.user);
            setSession(cached.session);
        }
        setLoading(false);
    }, []);

    const signIn = useCallback(async (email: string, password: string) => {
        if (!email || !password) {
            return { user: null, error: "Email y contraseña son obligatorios" };
        }
        if (password.length < 4) {
            return { user: null, error: "La contraseña debe tener al menos 4 caracteres" };
        }
        const u = makeUser(email);
        const s = makeSession(u);
        setUser(u);
        setSession(s);
        saveToStorage(u, s);
        return { user: u, error: null };
    }, []);

    const signInWithPassword = signIn;

    const signOut = useCallback(async () => {
        setUser(null);
        setSession(null);
        saveToStorage(null, null);
    }, []);

    const logout = signOut;

    const signUp = useCallback(async (email: string, password: string, name?: string) => {
        if (!email || !password) {
            return { user: null, error: "Email y contraseña son obligatorios" };
        }
        if (password.length < 6) {
            return { user: null, error: "La contraseña debe tener al menos 6 caracteres" };
        }
        const u = makeUser(email, name);
        const s = makeSession(u);
        setUser(u);
        setSession(s);
        saveToStorage(u, s);
        return { user: u, error: null };
    }, []);

    const value = useMemo<AuthContextValue>(() => ({
        user, session, loading,
        isReady: !loading,
        isSuperAdmin: false,
        status: user ? "authenticated" : "unauthenticated",
        tenant: null,
        tenantRole: null,
        profile: user,
        refresh: async () => {},
        createTenant: async () => ({ error: "demo mode" }),
        redeemInvite: async () => ({ error: "demo mode" }),
        signInWithGoogle: async () => ({ error: "demo mode" }),
        signIn, signInWithPassword, signOut, logout, signUp,
    }), [user, session, loading, signIn, signOut, signUp]);

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

/** Variante opcional. */
export function useAuthOptional(): AuthContextValue | null {
    return useContext(AuthContext);
}

export default AuthProvider;
