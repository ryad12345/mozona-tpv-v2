// =====================================================================
// MOZONA TPV — main.tsx (entry point)
// =====================================================================

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/globals.css";

const root = document.getElementById("root");
if (!root) {
    throw new Error("No se encontró el elemento #root");
}

createRoot(root).render(
    <StrictMode>
        <App />
    </StrictMode>
);
