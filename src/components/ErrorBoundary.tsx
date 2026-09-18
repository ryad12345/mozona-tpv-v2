// =====================================================================
// MOZONA TPV — ErrorBoundary (v4.0.2-hotfix)
// =====================================================================
// Captura cualquier error de la app y muestra mensaje HUMANO.
// CERO rastro de React/Stack/Build/Hash al usuario final.
// =====================================================================

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // Log interno (no se muestra al usuario)
        try {
            console.warn("[ErrorBoundary]", error?.message, info?.componentStack?.slice(0, 200));
        } catch (_) {}
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
                    <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center">
                        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center text-4xl">
                            ⚠️
                        </div>
                        <h1 className="text-[22px] font-black text-slate-900 mb-2">
                            Algo se ha desconfigurado
                        </h1>
                        <p className="text-[14px] text-slate-600 mb-6 leading-relaxed">
                            La aplicacion se ha detenido para proteger tus datos.
                            Esto puede pasar tras actualizaciones o por una conexion inestable.
                        </p>
                        <button
                            onClick={() => {
                                this.setState({ hasError: false });
                                window.location.reload();
                            }}
                            className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white font-black text-[14px] shadow-lg transition"
                        >
                            Reiniciar aplicacion
                        </button>
                        <p className="text-[11.5px] text-slate-400 mt-4">
                            Si el problema continua, contacta con soporte.<br/>
                            <span className="text-slate-500">WhatsApp +34 644 16 51 53</span>
                        </p>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
