// =====================================================================
// MOZONA TPV — server/local-server.ts
// =====================================================================
// Entry point del servidor LAN. Combina:
//   • HTTP (Express) sirviendo la API REST + bundle de React estático
//   • WebSocket nativo (ws) en /ws para eventos en tiempo real
//   • Pool PostgreSQL con reconexión automática
//
// Arranque:  PORT=3000 LAN_API_KEY=... tsx server/local-server.ts
// =====================================================================

import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { networkInterfaces } from "node:os";

import { WebSocketServer } from "ws";
import { WsManager } from "./ws-manager.js";
import { buildRouter } from "./routes.js";
import { query, closeDb } from "./db.js";
import type {
    OrderSentData, TableStatusChangedData, InvoicePaidData,
} from "../shared/ws-events.js";

// ---------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------

const PORT       = parseInt(process.env.PORT ?? "3000", 10);
const API_KEY    = process.env.LAN_API_KEY ?? "mozona-dev-key";
const HOST       = process.env.HOST ?? "0.0.0.0";
const VERSION    = "0.1.0";

// Raíz del proyecto = 2 niveles arriba de server/
const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, "..");
const DIST_DIR   = path.join(ROOT, "dist");

// ---------------------------------------------------------------------
// Express
// ---------------------------------------------------------------------

const app = express();

app.use(cors({
    origin:        true,           // LAN: cualquier origen
    credentials:   false,
    exposedHeaders: ["X-Mozona-Key"],
}));
app.use(express.json({ limit: "10mb" }));

// Logger minimalista
app.use((req, _res, next) => {
    const t = new Date().toISOString().slice(11, 19);
    console.log(`[${t}] ${req.method} ${req.url}`);
    next();
});

// ---------------------------------------------------------------------
// Detección del restaurante "default" para mandar a los clientes
// ---------------------------------------------------------------------

let cachedRestaurantId: string | null = null;
async function getDefaultRestaurantId(): Promise<string | null> {
    if (cachedRestaurantId !== null) return cachedRestaurantId;
    try {
        const r = await query<{ id: string }>(
            `SELECT id FROM restaurants ORDER BY created_at ASC LIMIT 1`,
        );
        cachedRestaurantId = r.rows[0]?.id ?? null;
    } catch {
        cachedRestaurantId = null;
    }
    return cachedRestaurantId;
}

// ---------------------------------------------------------------------
// HTTP + WebSocket server
// ---------------------------------------------------------------------

const httpServer = createServer(app);
const wss        = new WebSocketServer({ noServer: true });     // handshake manual

const wsManager  = new WsManager(wss, {
    apiKey:        API_KEY,
    serverVersion: VERSION,
    restaurantId:  undefined,                                  // se actualiza tras startup
});

(async () => {
    const restId = await getDefaultRestaurantId();
    (wsManager as unknown as { opts: { restaurantId: string | null } }).opts.restaurantId = restId;
    if (restId) console.log(`[BOOT] Restaurante por defecto: ${restId}`);
})();

// Rutas REST (se montan después para que `wsManager` esté listo)
app.use(buildRouter({ apiKey: API_KEY, ws: wsManager, version: VERSION }));

// Sirve el bundle de React compilado si existe
import { existsSync, statSync } from "node:fs";
if (existsSync(DIST_DIR) && statSync(DIST_DIR).isDirectory()) {
    app.use(express.static(DIST_DIR));
    // SPA fallback: cualquier ruta no-API devuelve index.html
    app.get(/^\/(?!api\/|ws$).*/, (_req, res) => {
        res.sendFile(path.join(DIST_DIR, "index.html"));
    });
    console.log(`[BOOT] Sirviendo bundle React desde ${DIST_DIR}`);
} else {
    console.warn(`[BOOT] dist/ no existe — sólo API. ` +
        `Ejecuta "npm run build" para generar el bundle.`);
}

// Handshake de WS en /ws
httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/ws") {
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit("connection", ws, req);
        });
    } else {
        socket.destroy();
    }
});

// ---------------------------------------------------------------------
// Bridge HTTP → WS: persistir cambios que llegan por REST también
// dispara broadcasts ya cubiertos en routes.ts. Aquí dejamos hooks
// de alto nivel para que el server Tauri Rust u otros procesos
// puedan publicar eventos sin pasar por HTTP.
// ---------------------------------------------------------------------

export function publishOrderSent(data: OrderSentData): void {
    wsManager.broadcast("ORDER_SENT", data);
}
export function publishTableStatus(data: TableStatusChangedData): void {
    wsManager.broadcast("TABLE_STATUS_CHANGED", data);
}
export function publishInvoicePaid(data: InvoicePaidData): void {
    wsManager.broadcast("INVOICE_PAID", data);
}

// ---------------------------------------------------------------------
// Manejo de errores
// ---------------------------------------------------------------------

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[ERR]", err.message);
    res.status(500).json({
        error:   "internal",
        message: err.message,
    });
});

// ---------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
    console.log(`\n[${signal}] Cerrando…`);
    try {
        await wsManager.close();
        await closeDb();
        httpServer.close(() => process.exit(0));
        // Si tarda mucho, salimos igual a los 5s
        setTimeout(() => process.exit(1), 5000).unref();
    } catch (e) {
        console.error("Error durante shutdown:", e);
        process.exit(1);
    }
}
process.on("SIGINT",  () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("uncaughtException", (err) => {
    console.error("[UNCAUGHT]", err);
    void shutdown("uncaughtException");
});

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------

httpServer.listen(PORT, HOST, () => {
    const ips = getLocalIPs();
    console.log(`
╔══════════════════════════════════════════════════════════╗
║           MOZONA TPV — LAN Server v${VERSION}              ║
╠══════════════════════════════════════════════════════════╣
║  HTTP   →  http://0.0.0.0:${PORT}                          ║
║  WS     →  ws://0.0.0.0:${PORT}/ws                          ║
║  API    →  X-Mozona-Key header (dev: ${API_KEY})         ║
╠══════════════════════════════════════════════════════════╣
║  IPs locales:                                            ║`);
    for (const ip of ips) {
        console.log(`║    ${ip.padEnd(52)}║`);
    }
    console.log(`╚══════════════════════════════════════════════════════════╝
`);
});

function getLocalIPs(): string[] {
    const out: string[] = [];
    const ifaces = networkInterfaces();
    for (const name of Object.keys(ifaces)) {
        if (name === "lo") continue;
        for (const i of ifaces[name] ?? []) {
            if (i.family === "IPv4" && !i.internal) {
                out.push(`${name}: ${i.address}`);
            }
        }
    }
    return out;
}
