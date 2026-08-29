// =====================================================================
// MOZONA TPV — DeviceDetect (/)
// =====================================================================
// Detecta si el dispositivo es un terminal de caja (desktop/tablet ancho)
// o un móvil de camarero.  Redirige al sitio correcto:
//   - Caja     → /app  (TPV, asumiendo sesión activa)
//   - Móvil    → /auth (login con email + password, sin PIN)
// =====================================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "../hooks/useIsMobile";
import { useAuth } from "../context/AuthContext";
import { IconStore, IconUser, IconCheck, IconArrowRight } from "../components/icons";

export function DeviceDetect() {
    const nav = useNavigate();
    const auth = useAuth();
    const isMobile = useIsMobile();
    const [decided, setDecided] = useState(false);

    // Auto-redirección tras 2.5s si el usuario no ha clickado
    useEffect(() => {
        if (decided) return;
        const t = setTimeout(() => {
            if (!decided) {
                handleSelect(isMobile);
            }
        }, 2500);
        return () => clearTimeout(t);
    }, [isMobile, decided]);

    const handleSelect = (goMobile: boolean) => {
        setDecided(true);
        if (goMobile) {
            // Móvil → login con email/password
            nav("/auth?role=mobile", { replace: true });
        } else {
            // Caja → si hay sesión al TPV, si no al login
            if (auth.user) {
                nav("/app", { replace: true });
            } else {
                nav("/auth", { replace: true });
            }
        }
    };

    if (auth.loading) {
        return (
            <div className="min-h-dvh w-full flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100">
                <div className="text-center">
                    <div className="w-10 h-10 mx-auto mb-3 border-[3px] border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                    <div className="text-[12px] text-slate-500">Cargando…</div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-dvh w-full bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col">
            {/* Header */}
            <div className="px-6 py-5 flex items-center gap-3 border-b border-slate-200/60 bg-white/60 backdrop-blur">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white flex items-center justify-center font-black shadow-md shadow-blue-600/30">
                    M
                </div>
                <div>
                    <div className="text-[15px] font-black tracking-tight text-slate-900">MOZONA TPV</div>
                    <div className="text-[10.5px] text-slate-500">Selecciona el modo de uso</div>
                </div>
            </div>

            <main className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-2xl">
                    <h1 className="text-center text-[22px] sm:text-[28px] font-black tracking-tight text-slate-900 mb-1">
                        ¿Cómo vas a usar MOZONA?
                    </h1>
                    <p className="text-center text-[13px] text-slate-500 mb-8">
                        Detectamos automáticamente tu dispositivo.  Elige manualmente si quieres.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Opción 1: Terminal de caja */}
                        <button
                            type="button"
                            onClick={() => handleSelect(false)}
                            className={`group relative p-6 rounded-3xl border-2 text-left transition active:scale-95
                                ${!isMobile
                                    ? "border-blue-500 bg-blue-50/50 ring-4 ring-blue-500/10"
                                    : "border-slate-200 bg-white hover:border-blue-300"}`}
                        >
                            {!isMobile && (
                                <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center">
                                    <IconCheck size={14} strokeWidth={3} />
                                </div>
                            )}
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center mb-3 shadow-md shadow-blue-600/30">
                                <IconStore size={24} strokeWidth={1.8} />
                            </div>
                            <div className="text-[16px] font-black text-slate-900 mb-1">Terminal de caja</div>
                            <div className="text-[12px] text-slate-500 leading-snug">
                                Pantalla grande de la barra o mostrador.  TPV completo con carta, mesas y cobros.
                            </div>
                            <div className="mt-4 flex items-center gap-1 text-[12px] font-bold text-blue-600">
                                Ir al TPV
                                <IconArrowRight size={14} strokeWidth={2.4} />
                            </div>
                        </button>

                        {/* Opción 2: Móvil de camarero */}
                        <button
                            type="button"
                            onClick={() => handleSelect(true)}
                            className={`group relative p-6 rounded-3xl border-2 text-left transition active:scale-95
                                ${isMobile
                                    ? "border-emerald-500 bg-emerald-50/50 ring-4 ring-emerald-500/10"
                                    : "border-slate-200 bg-white hover:border-emerald-300"}`}
                        >
                            {isMobile && (
                                <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                                    <IconCheck size={14} strokeWidth={3} />
                                </div>
                            )}
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center mb-3 shadow-md shadow-emerald-600/30">
                                <IconUser size={24} strokeWidth={1.8} />
                            </div>
                            <div className="text-[16px] font-black text-slate-900 mb-1">Camarero / móvil</div>
                            <div className="text-[12px] text-slate-500 leading-snug">
                                Móvil o tablet del camarero.  Inicia sesión con tu email y contraseña para tomar comandas.
                            </div>
                            <div className="mt-4 flex items-center gap-1 text-[12px] font-bold text-emerald-600">
                                Iniciar sesión
                                <IconArrowRight size={14} strokeWidth={2.4} />
                            </div>
                        </button>
                    </div>

                    <p className="text-center text-[10.5px] text-slate-400 mt-6">
                        Conexión cifrada SSL · Sesión en Supabase
                    </p>
                </div>
            </main>
        </div>
    );
}

export default DeviceDetect;
