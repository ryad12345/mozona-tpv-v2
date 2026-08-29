// =====================================================================
// MOZONA TPV — App root
// =====================================================================

import { Component, type ErrorInfo, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { PosTerminalPro } from "./pages/PosTerminalPro";
import { SettingsPage } from "./pages/SettingsPage";
import { AuthPage } from "./pages/AuthPage";
import { LandingPage } from "./pages/LandingPage";
import { PricingPage } from "./pages/PricingPage";
import { RegisterPage } from "./pages/RegisterPage";
import { BillingSuccessPage } from "./pages/BillingSuccessPage";
import { BillingCancelPage } from "./pages/BillingCancelPage";
import { WaiterLoginPage } from "./pages/WaiterLoginPage";
import { WaiterPad } from "./pages/WaiterPad";
import { AdminInvitesPage } from "./pages/AdminInvitesPage";
import { SetupCajaPage } from "./pages/SetupCajaPage";
import { WebSocketProvider } from "./context/WebSocketContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { DesktopGuard } from "./components/DesktopGuard";
import { SubscriptionGuard } from "./components/ProtectedRoute";

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
                        <Routes>
                            {/* Públicas */}
                            <Route path="/"        element={<LandingPage />} />
                            <Route path="/pricing" element={<PricingPage />} />
                            <Route path="/auth"    element={<AuthPage />} />
                            <Route path="/register" element={<RegisterPage />} />
                            <Route path="/billing/success" element={<BillingSuccessPage />} />
                            <Route path="/billing/cancel"  element={<BillingCancelPage />} />
                            <Route path="/waiter/login"    element={<WaiterLoginPage />} />
                            <Route path="/setup-caja"      element={<SetupCajaPage />} />
                            <Route path="/admin/invites"   element={<AdminInvitesPage />} />

                            {/* TPV Admin — solo desktop/tablet */}
                            <Route path="/app"      element={<ProtectedRoute><SubscriptionGuard><DesktopGuard><PosTerminalPro /></DesktopGuard></SubscriptionGuard></ProtectedRoute>} />
                            <Route path="/settings" element={<ProtectedRoute><SubscriptionGuard><DesktopGuard><SettingsPage /></DesktopGuard></SubscriptionGuard></ProtectedRoute>} />

                            {/* Camarero — solo móvil */}
                            <Route path="/waiter"   element={<ProtectedRoute><WaiterPad /></ProtectedRoute>} />

                            <Route path="*"        element={<Navigate to="/" replace />} />
                        </Routes>
                    </BrowserRouter>
                </WebSocketProvider>
            </AuthProvider>
        </ErrorBoundary>
    );
}

export default App;
