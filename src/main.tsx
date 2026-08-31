import { WebSocketProvider } from './context/WebSocketContext';
// =====================================================================
// MOZONA TPV — main.tsx (entry point)
// =====================================================================

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/globals.css";

const BUILD_HASH = import.meta.env.VITE_BUILD_HASH ?? "dev";
console.log(
    "%cMOZONA TPV%c build: %c" + BUILD_HASH,
    "background:#0F2942;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold",
    "color:#64748b",
    "color:#10b981;font-weight:bold",
);

// ★ Forzar al Service Worker a actualizarse inmediatamente
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => {
            reg.update().catch(() => {});
        });
    });
    // Si el SW nuevo está esperando, activarlo sin recargar
    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => {
            reg.waiting?.postMessage({ type: "SKIP_WAITING" });
        });
    }
}

const root = document.getElementById("root");
if (!root) {
    throw new Error("No se encontró el elemento #root");
}

createRoot(root).render(
    <StrictMode>
        <WebSocketProvider><App /></WebSocketProvider>
    </StrictMode>
);
