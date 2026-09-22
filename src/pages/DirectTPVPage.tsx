// =====================================================================
// MOZONA TPV — Acceso Directo al TPV (VIP bypass sin login)
// Ruta: /tpv-direct o /direct
// =====================================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

const VIP_EMAILS = [
    "chalohiahmd1980@gmail.com",
    "rofixinsta@gmail.com",
];

export default function DirectTPVPage() {
    const navigate = useNavigate();
    const auth = useAuth() as any;
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [msg, setMsg] = useState("Iniciando acceso directo al TPV...");

    useEffect(() => {
        const tryEnter = () => {
            try {
                const email = VIP_EMAILS[0]; // Default VIP (Riyad)
                const mockUser = {
                    id: "vip-direct-access",
                    email: email,
                    user_metadata: { name: "VIP Direct Access", vip: true },
                    app_metadata: { provider: "vip-direct" },
                    aud: "authenticated",
                    role: "owner",
                    created_at: new Date().toISOString(),
                };
                if (auth.setMockSession) {
                    auth.setMockSession(mockUser);
                }
                setStatus("ready");
                setMsg("Acceso concedido. Entrando al TPV...");
                setTimeout(() => navigate("/app", { replace: true }), 300);
            } catch (e) {
                console.error("[DirectTPV] error", e);
                setStatus("error");
                setMsg("No se pudo iniciar sesion VIP.");
            }
        };
        const t = setTimeout(tryEnter, 200);
        return () => clearTimeout(t);
    }, [auth, navigate]);

    return (
        <div style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            color: "#fff",
            padding: "24px",
            textAlign: "center"
        }}>
            <div style={{
                width: "96px", height: "96px", borderRadius: "24px",
                background: "linear-gradient(135deg, #7c3aed, #2563eb)",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: "24px", fontSize: "44px",
                boxShadow: "0 10px 30px rgba(124,58,237,0.4)"
            }}>
                🚀
            </div>
            <h1 style={{ fontSize: "26px", fontWeight: 900, margin: "0 0 8px 0" }}>
                Acceso Directo VIP
            </h1>
            <p style={{ fontSize: "14px", color: "#94a3b8", margin: "0 0 24px 0", maxWidth: "340px" }}>
                {msg}
            </p>
            {status === "loading" && (
                <div style={{
                    width: "48px", height: "48px",
                    border: "3px solid #334155", borderTopColor: "#7c3aed",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite"
                }} />
            )}
            {status === "error" && (
                <button
                    onClick={() => window.location.reload()}
                    style={{
                        background: "linear-gradient(135deg, #7c3aed, #2563eb)",
                        color: "#fff", border: "none", padding: "14px 32px",
                        borderRadius: "12px", fontSize: "15px", fontWeight: 700,
                        cursor: "pointer", minWidth: "240px"
                    }}
                >
                    Reintentar
                </button>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
