// =====================================================================
// MOZONA TPV — App root
// =====================================================================

import { Component, type ErrorInfo, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { PosTerminalPro } from "./pages/PosTerminalPro";
import { SettingsPage } from "./pages/SettingsPage";
import { AuthPage } from "./pages/AuthPage";
import { WebSocketProvider } from "./context/WebSocketContext";
import { AuthProvider } from "./context/AuthContext";

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
// App
// ---------------------------------------------------------------------

export function App() {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <WebSocketProvider>
                    <BrowserRouter>
                        <Routes>
                            <Route path="/"        element={<Navigate to="/app" replace />} />
                            <Route path="/app"      element={<PosTerminalPro />} />
                            <Route path="/settings" element={<SettingsPage />} />
                            <Route path="/auth"     element={<AuthPage />} />
                            <Route path="*"        element={<Navigate to="/app" replace />} />
                        </Routes>
                    </BrowserRouter>
                </WebSocketProvider>
            </AuthProvider>
        </ErrorBoundary>
    );
}

export default App;
