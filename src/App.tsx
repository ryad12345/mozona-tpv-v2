// =====================================================================
// MOZONA TPV — App.tsx (SaaS multi-tenant entry)
// =====================================================================
// Estructura:
//   <AuthProvider>                            ← sesión Supabase
//     <PwaShell>                              ← install + update + offline
//       <ServerConfigGate>                    ← pide IP de caja si falta
//       <BrowserRouter>
//         <Routes>
//           {/* Marketing */}
//           <Route path="/"                  element={<LandingPage />} />
//           <Route path="/auth"              element={<AuthPage />} />
//           <Route path="/auth/callback"     element={<AuthCallback />} />
//           <Route path="/pricing"           element={<PricingPage />} />
//           <Route path="/setup-caja"        element={<SetupCajaPage />} />
//
//           {/* Admin */}
//           <Route path="/admin/invites"     element={<AdminRoute><AdminInvitesPage /></AdminRoute>} />
//
//           {/* SaaS */}
//           <Route path="/app"               element={<SubscriptionGuard><RootRoute /></SubscriptionGuard>} />
//           <Route path="/waiter"            element={<SubscriptionGuard><WaiterPad /></SubscriptionGuard>} />
//           <Route path="/tpv"               element={<SubscriptionGuard><PosTerminalPro /></SubscriptionGuard>} />
//           <Route path="/settings"          element={<ProtectedRoute><SettingsRoute /></ProtectedRoute>} />
//         </Routes>
//       </BrowserRouter>
//     </PwaShell>
//   </AuthProvider>
// =====================================================================

import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { WebSocketProvider, useWebSocket } from "./hooks/WebSocketProvider";
import { PwaShell } from "./components/pwa/PwaShell";
import { ServerConfigBanner } from "./components/ServerConfigBanner";
import { AuthProvider, useAuth } from "./lib/auth";
import { ProtectedRoute, AdminRoute, SubscriptionGuard } from "./components/ProtectedRoute";
import { useIsMobile } from "./hooks/useIsMobile";

import { PosTerminalPro }  from "./pages/PosTerminalPro";
import { WaiterPad }       from "./pages/WaiterPad";
import { SettingsPage, type SettingsPageProps } from "./pages/SettingsPage";
import { LandingPage }     from "./pages/LandingPage";
import { AuthPage }        from "./pages/AuthPage";
import { PricingPage }     from "./pages/PricingPage";
import { AdminInvitesPage } from "./pages/AdminInvitesPage";
import { BillingSuccessPage } from "./pages/BillingSuccessPage";
import { SetupCajaPage }   from "./pages/SetupCajaPage";
import { OnboardingWizard } from "./pages/OnboardingWizard";

import { getMeta, setMeta } from "./lib/offlineStorage";
import { setRestaurantId } from "./lib/syncEngine";

function detectRoleFromUrl(): "tpv" | "waiter" | "kitchen" {
    if (typeof window === "undefined") return "tpv";
    const params = new URLSearchParams(window.location.search);
    const role = params.get("role");
    if (role === "waiter" || role === "kitchen") return role;
    if (window.location.pathname.startsWith("/waiter")) return "waiter";
    return "tpv";
}

// ---------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------

export function App() {
    const role = detectRoleFromUrl();
    return (
        <AuthProvider>
            <WebSocketProvider
                config={{ role, debug: import.meta.env.DEV }}
            >
                <PwaShell>
                    <ServerConfigGate />
                    <BrowserRouter>
                        <Routes>
                            <Route path="/"          element={<LandingPage />} />
                            <Route path="/auth"      element={<AuthPage />} />
                            <Route path="/auth/callback" element={<AuthCallback />} />
                            <Route path="/pricing"   element={<PricingPage />} />
                            <Route path="/setup-caja" element={<SetupCajaPage />} />
                            <Route path="/billing/success"
                                   element={<ProtectedRoute><BillingSuccessPage /></ProtectedRoute>} />

                            <Route path="/admin/invites"
                                   element={<AdminRoute><AdminInvitesPage /></AdminRoute>} />

                            <Route path="/setup/onboarding"
                                   element={<SubscriptionGuard><OnboardingWizard /></SubscriptionGuard>} />
                            <Route path="/app"
                                   element={<SubscriptionGuard><RootRoute /></SubscriptionGuard>} />
                            <Route path="/waiter"
                                   element={<SubscriptionGuard><WaiterPad /></SubscriptionGuard>} />
                            <Route path="/tpv"
                                   element={<SubscriptionGuard><PosTerminalPro /></SubscriptionGuard>} />
                            <Route path="/settings"
                                   element={<ProtectedRoute><SettingsRoute /></ProtectedRoute>} />

                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </BrowserRouter>
                </PwaShell>
            </WebSocketProvider>
        </AuthProvider>
    );
}

// ---------------------------------------------------------------------
// ServerConfigGate: pide IP de caja central si no hay
// ---------------------------------------------------------------------

function ServerConfigGate() {
    const ws = useWebSocket();
    return <ServerConfigBanner isConnected={ws.isConnected} />;
}

// ---------------------------------------------------------------------
// RootRoute: detecta móvil → WaiterPad, desktop → PosTerminalPro
// ---------------------------------------------------------------------

function getViewOverride(): "auto" | "tpv" | "waiter" {
    if (typeof window === "undefined") return "auto";
    const v = new URLSearchParams(window.location.search).get("view");
    if (v === "tpv" || v === "waiter") return v;
    return "auto";
}

function RootRoute() {
    const isMobile = useIsMobile();
    const override = getViewOverride();
    const showWaiter = override === "waiter" || (override === "auto" && isMobile);
    return showWaiter ? <WaiterPad /> : <PosTerminalPro />;
}

// ---------------------------------------------------------------------
// AuthCallback: tras OAuth (Google), Supabase redirige aquí
// ---------------------------------------------------------------------

function AuthCallback() {
    const nav  = useNavigate();
    const auth = useAuth();
    const [params] = useSearchParams();
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (!auth.isReady) return;
        if (done) return;
        // Supabase detecta la sesión automáticamente; sólo esperamos
        // a que `auth.user` se rellene.
        const t = setTimeout(() => {
            setDone(true);
            if (auth.user) {
                const dest = auth.isSuperAdmin
                    ? "/admin/invites"
                    : auth.tenant
                        ? "/app"
                        : "/pricing";
                nav(dest, { replace: true });
            } else {
                const err = params.get("error_description") ?? "Error de autenticación";
                nav(`/auth?error=${encodeURIComponent(err)}`, { replace: true });
            }
        }, 1500);
        return () => clearTimeout(t);
    }, [auth.isReady, auth.user, auth.isSuperAdmin, auth.tenant, nav, done, params]);

    return (
        <div className="min-h-dvh flex items-center justify-center bg-slate-50">
            <div className="text-center">
                <div className="inline-block w-10 h-10 border-[3px] border-slate-200 border-t-blue-600
                                rounded-full animate-spin mb-3" />
                <div className="text-[12.5px] text-slate-500">Completando inicio de sesión…</div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------
// SettingsRoute
// ---------------------------------------------------------------------

const SETTINGS_META_KEY = "mozona.settings";

function SettingsRoute() {
    const [initial, setInitial] = useState<SettingsPageProps["initial"] | null>(null);
    const [loaded,  setLoaded]  = useState(false);
    const auth = useAuth();

    useEffect(() => {
        let mounted = true;
        void getMeta<SettingsPageProps["initial"]>(SETTINGS_META_KEY).then(stored => {
            if (!mounted) return;
            setInitial(stored ?? null);
            setLoaded(true);
        });
        return () => { mounted = false; };
    }, []);

    const handleSave: SettingsPageProps["onSave"] = async (data) => {
        await setMeta(SETTINGS_META_KEY, data);
        if (data.restaurant_id) {
            await setRestaurantId(data.restaurant_id);
        }
    };

    if (!loaded) {
        return (
            <div className="flex items-center justify-center h-screen text-slate-400 text-sm">
                Cargando ajustes…
            </div>
        );
    }

    // Si tenemos un tenant activo, pre-rellenamos Settings con sus datos
    // para que el usuario vea siempre los valores actuales de la nube.
    const t = auth.tenant;
    const enriched: SettingsPageProps["initial"] = {
        ...(initial ?? {}),
        restaurant_id:   t?.id           ?? initial?.restaurant_id,
        business_name:   t?.name         ?? initial?.business_name,
        cif_nif:         t?.cif_nif      ?? initial?.cif_nif,
        address:         t?.address      ?? initial?.address,
        phone:           t?.phone        ?? initial?.phone,
        default_tax_rate: (t?.default_tax_rate as 10 | 21 | undefined) ?? initial?.default_tax_rate ?? 10,
    };

    return <SettingsPage initial={enriched} onSave={handleSave} />;
}
