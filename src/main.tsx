// =====================================================================
// MOZONA TPV — main.tsx (entry point) v4.0.7-no-loop
// =====================================================================

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/globals.css";
import { activateActiveDefense } from "./lib/security/activeDefense";

const BUILD_HASH = import.meta.env.VITE_BUILD_HASH ?? "dev";
console.log(
    "%cMOZONA TPV v4.0.7-no-loop%c build: %c" + BUILD_HASH + "%c",
    "background:#7c3aed;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold",
    "color:#64748b",
    "color:#10b981;font-weight:bold",
    ""
);

console.log("[MOZONA] cargado en", new Date().toISOString());

// ★ v4.0.7-no-sw: Desregistrar CUALQUIER service worker viejo (idempotente)
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.unregister().catch(() => {}));
    });
    if ("caches" in window) {
        caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
    }
}

const root = document.getElementById("root");
if (!root) {
    throw new Error("No se encontro el elemento #root");
}

function showHardErrorScreen(reason: string) {
    if (!root) return;
    root.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#f8fafc 0%,#ede9fe 50%,#dbeafe 100%);color:#0f172a;padding:24px;text-align:center">
            <div style="width:96px;height:96px;border-radius:28px;background:linear-gradient(135deg,#f59e0b 0%,#ef4444 100%);display:flex;align-items:center;justify-content:center;margin-bottom:24px;box-shadow:0 10px 30px rgba(245,158,11,0.3);font-size:48px">⚠️</div>
            <h1 style="font-size:26px;font-weight:900;margin:0 0 8px 0;letter-spacing:-0.5px">Algo se ha desconfigurado</h1>
            <p style="font-size:14px;color:#64748b;margin:0 0 24px 0;max-width:340px;line-height:1.5">La aplicacion se ha detenido. Esto puede pasar tras actualizaciones.</p>
            <button onclick="window.location.reload()" style="background:linear-gradient(135deg,#7c3aed 0%,#2563eb 100%);color:white;border:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 8px 20px rgba(124,58,237,0.3);min-width:240px">Reiniciar aplicacion</button>
            <p style="font-size:11px;color:#94a3b8;margin-top:20px">Detalle: ${reason}</p>
        </div>
    `;
}

// ★ Activa sistema de defensa 24/7 ANTES del render
activateActiveDefense().catch(() => {});

try {
    createRoot(root).render(
        <StrictMode>
            <App />
        </StrictMode>
    );
} catch (err: any) {
    console.error("[MOZONA] FATAL mount error:", err);
    showHardErrorScreen(String(err?.message || err));
}

window.addEventListener("error", (e) => {
    const msg = String(e.message || "");
    if (msg.includes("Minified React error")) {
        showHardErrorScreen(msg);
    }
});
window.addEventListener("unhandledrejection", () => {
    // Manejado por Auto-Healer
});
