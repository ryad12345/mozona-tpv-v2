// =====================================================================
// MOZONA TPV — main.tsx (entry point) v4.0.7-no-loop
// =====================================================================

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/globals.css";
import { activateDefenseBot } from "./lib/security/defenseBot";
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

// ★ v4.0.7-no-loop-fix: PANTALLA DE ERROR DESHABILITADA POR DEFECTO.
//   Antes mostraba una pantalla dura que atrapaba al usuario. Ahora solo
//   se loguea en consola y se reintenta automáticamente después de 5s.
//   El ErrorBoundary de React maneja los errores recuperables.
let _hardErrorShown = false;
function showHardErrorScreen(reason: string) {
    if (_hardErrorShown || !root) return;
    _hardErrorShown = true;
    console.error("[MOZONA] Hard error screen requested (reason):", reason);
    // NO mostramos pantalla dura. Solo intentamos recargar automáticamente.
    try {
        setTimeout(() => {
            try { window.location.reload(); } catch (_) {}
        }, 5000);
    } catch (_) {}
}

// ★ Activa sistema de defensa 24/7 ANTES del render
// v2: defenseBot tiene honeypots, watchdogs de DB/Perf/Memory,
//     recuperación automática y reportes via Telegram Edge Function.
activateDefenseBot().catch(() => {});
// Compat: activa también activeDefense original (idempotente)
activateActiveDefense().catch(() => {});

try {
    createRoot(root).render(
        <StrictMode>
            <App />
        </StrictMode>
    );
} catch (err: any) {
    console.error("[MOZONA] FATAL mount error:", err);
    // ★ No mostramos pantalla dura. Logueamos y dejamos que React maneje.
}

window.addEventListener("error", (e) => {
    // ★ v4.0.7-no-loop-fix: NO mostrar pantalla dura en errores genéricos.
    //   Solo loguear. El ErrorBoundary de React maneja la recuperación.
    const msg = String(e.message || "");
    if (msg.includes("Minified React error")) {
        console.warn("[MOZONA] React error capturado (no se muestra pantalla):", msg);
    }
});
window.addEventListener("unhandledrejection", () => {
    // Manejado por Auto-Healer
});
