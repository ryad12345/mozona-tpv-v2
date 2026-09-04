// =====================================================================
// MOZONA TPV — App root
// =====================================================================

import { Component, Suspense, lazy, type ErrorInfo, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// ★ Páginas ligeras (carga inmediata: landing, auth, pricing)
import { AuthPage } from "./pages/AuthPage";
import { LandingPage } from "./pages/LandingPage";
import { PricingPage } from "./pages/PricingPage";

// ★ Páginas pesadas (lazy loading: TPV, settings, waiter)
const PosTerminalPro  = lazy(() => import("./pages/PosTerminalPro").then(m => ({ default: m.PosTerminalPro })));
const SettingsPage    = lazy(() => import("./pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const RegisterPage    = lazy(() => import("./pages/RegisterPage").then(m => ({ default: m.RegisterPage })));
const BillingSuccessPage = lazy(() => import("./pages/BillingSuccessPage").then(m => ({ default: m.BillingSuccessPage })));
const BillingCancelPage  = lazy(() => import("./pages/BillingCancelPage").then(m => ({ default: m.BillingCancelPage })));
const WaiterLoginPage = lazy(() => import("./pages/WaiterLoginPage").then(m => ({ default: m.WaiterLoginPage })));
const WaiterPad       = lazy(() => import("./pages/WaiterPad").then(m => ({ default: m.WaiterPad })));
const AdminInvitesPage = lazy(() => import("./pages/AdminInvitesPage").then(m => ({ default: m.AdminInvitesPage })));
const SetupCajaPage   = lazy(() => import("./pages/SetupCajaPage").then(m => ({ default: m.SetupCajaPage })));
const InviteRedeemPage  = lazy(() => import("./pages/InviteRedeemPage").then(m => ({ default: m.InviteRedeemPage })));
const OnboardingWizardPage = lazy(() => import("./pages/OnboardingWizardPage").then(m => ({ default: m.OnboardingWizardPage })));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage").then(m => ({ default: m.ResetPasswordPage })));

// ★ Página de cierre de caja (nueva, lazy)
const CashRegisterPage = lazy(() => import("./pages/CashRegisterPage").then(m => ({ default: m.CashRegisterPage })));

import { WebSocketProvider } from "./context/WebSocketContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { DesktopGuard } from "./components/DesktopGuard";
import { SubscriptionGuard } from "./components/ProtectedRoute";
import { FloatingAssistantButton } from "./components/assistant/FloatingAssistantButton";

// ★ Spinner reutilizable para Suspense
function PageLoader({ label = "Cargando…" }: { label?: string }) {
    return (
        <div className="min-h-dvh w-full flex items-center justify-center bg-slate-50">
            <div className="text-center">
                <div className="w-10 h-10 mx-auto mb-3 border-[3px] border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                <div className="text-[12px] text-slate-500">{label}</div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------
// ErrorBoundary
// ---------------------------------------------------------------------

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: (error: Error, reset: () => void) => ReactNode;
}
interface ErrorBoundaryState {
    error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        if (typeof console !== "undefined") {
            console.error("[ErrorBoundary]", error, info);
        }
    }

    reset = () => this.setState({ error: null });

    render() {
        if (this.state.error) {
            if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
            return (
                <div className="min-h-dvh w-full flex flex-col items-center justify-center bg-slate-900 text-white p-4 text-center">
                    <div className="text-[11.5px] font-bold uppercase tracking-wider text-rose-400 mb-1">
                        Aviso del Sistema
                    </div>
                    <p className="text-xs text-slate-400 mb-4 max-w-md font-mono break-words">
                        {this.state.error.message}
                    </p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold"
                    >
                        Reiniciar TPV
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

// ---------------------------------------------------------------------
// ProtectedRoute: redirige a /auth si no hay user
// ---------------------------------------------------------------------

function ProtectedRoute({ children }: { children: ReactNode }) {
    const auth = useAuth();
    if (auth.loading) {
        return (
            <div className="min-h-dvh w-full flex items-center justify-center bg-slate-50">
                <div className="text-center">
                    <div className="w-10 h-10 mx-auto mb-3 border-[3px] border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                    <div className="text-[12px] text-slate-500">Cargando…</div>
                </div>
            </div>
        );
    }
    if (!auth.user) {
        return <Navigate to="/auth" replace />;
    }
    return <>{children}</>;
}

// ---------------------------------------------------------------------
// App
// ---------------------------------------------------------------------

export function App() {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <WebSocketProvider>
                    <BrowserRouter>
                        <Suspense fallback={<PageLoader />}>
                            <Routes>
                                {/* Públicas */}
                                <Route path="/"        element={<LandingPage />} />
                                <Route path="/pricing" element={<PricingPage />} />
                                <Route path="/auth"    element={<AuthPage />} />
                                <Route path="/reset-password" element={<Suspense fallback={<PageLoader label="Cargando…" />}><ResetPasswordPage /></Suspense>} />
                                <Route path="/register" element={<Suspense fallback={<PageLoader label="Registrando…" />}><RegisterPage /></Suspense>} />
                                <Route path="/billing/success" element={<Suspense fallback={<PageLoader />}><BillingSuccessPage /></Suspense>} />
                                <Route path="/billing/cancel"  element={<Suspense fallback={<PageLoader />}><BillingCancelPage /></Suspense>} />
                                <Route path="/waiter/login"    element={<Suspense fallback={<PageLoader />}><WaiterLoginPage /></Suspense>} />
                                <Route path="/setup-caja"      element={<Suspense fallback={<PageLoader />}><SetupCajaPage /></Suspense>} />
                                <Route path="/admin/invites"   element={<Suspense fallback={<PageLoader />}><AdminInvitesPage /></Suspense>} />

                                {/* ★ Canje de invitación y onboarding inicial */}
                                <Route path="/invite/:token"   element={<Suspense fallback={<PageLoader label="Cargando invitación…" />}><InviteRedeemPage /></Suspense>} />
                                <Route path="/setup/onboarding" element={<ProtectedRoute><Suspense fallback={<PageLoader label="Preparando tu TPV…" />}><OnboardingWizardPage /></Suspense></ProtectedRoute>} />

                                {/* TPV Admin — solo desktop/tablet */}
                                <Route path="/app"      element={<ProtectedRoute><SubscriptionGuard><DesktopGuard><Suspense fallback={<PageLoader label="Iniciando TPV…" />}><PosTerminalPro /></Suspense></DesktopGuard></SubscriptionGuard></ProtectedRoute>} />
                                <Route path="/settings" element={<ProtectedRoute><SubscriptionGuard><DesktopGuard><Suspense fallback={<PageLoader label="Cargando ajustes…" />}><SettingsPage /></Suspense></DesktopGuard></SubscriptionGuard></ProtectedRoute>} />

                                {/* Cierre de caja (arqueo / turnos) */}
                                <Route path="/cash-register" element={<ProtectedRoute><SubscriptionGuard><DesktopGuard><Suspense fallback={<PageLoader label="Cierre de caja…" />}><CashRegisterPage /></Suspense></DesktopGuard></SubscriptionGuard></ProtectedRoute>} />

                                {/* Camarero — solo móvil */}
                                <Route path="/waiter"   element={<ProtectedRoute><Suspense fallback={<PageLoader label="Cargando comandero…" />}><WaiterPad /></Suspense></ProtectedRoute>} />

                                <Route path="*"        element={<Navigate to="/" replace />} />
                            </Routes>
                        </Suspense>
                    </BrowserRouter>

                    {/* ★ v1.9.38: Botón flotante GLOBAL del asistente Riyad */}
                    <FloatingAssistantButton />
                </WebSocketProvider>
            </AuthProvider>
        </ErrorBoundary>
    );
}

export default App;
