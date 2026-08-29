// =====================================================================
// MOZONA TPV — ErrorBoundary
// =====================================================================

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
    children: ReactNode;
    fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        if (typeof console !== "undefined") {
            console.error("[ErrorBoundary]", error, info);
        }
    }

    reset = () => {
        this.setState({ error: null });
    };

    render() {
        if (this.state.error) {
            if (this.props.fallback) {
                return this.props.fallback(this.state.error, this.reset);
            }
            return (
                <div className="min-h-dvh w-full flex flex-col items-center justify-center bg-slate-100 p-5">
                    <div className="max-w-md w-full bg-white rounded-2xl border border-rose-200 shadow-sm p-6 text-center">
                        <div className="text-[11.5px] font-bold uppercase tracking-wider text-rose-600 mb-1">
                            Aviso del Sistema
                        </div>
                        <div className="text-[13px] text-slate-700 mb-4 font-mono break-words">
                            {this.state.error.message}
                        </div>
                        <button
                            onClick={this.reset}
                            className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-bold active:scale-95 transition"
                        >
                            Reintentar
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
