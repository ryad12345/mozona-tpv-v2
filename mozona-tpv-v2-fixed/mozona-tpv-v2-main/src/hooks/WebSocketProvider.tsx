// =====================================================================
// MOZONA TPV — WebSocketProvider
// =====================================================================
// Provider de React que envuelve useLocalSocket en un Context para
// que cualquier componente del árbol pueda consumir la conexión
// (estado, envío, suscripción) sin prop-drilling.
//
// Uso:
//   <WebSocketProvider config={{ role: "tpv" }}>
//     <App />
//   </WebSocketProvider>
//
//   // En cualquier componente:
//   const { isConnected, sendOrder, broadcastTableStatus } = useWebSocket();
// =====================================================================

import {
    createContext, useContext, useMemo, useCallback,
    type ReactNode,
} from "react";
import { useLocalSocket, type UseLocalSocketReturn } from "./useLocalSocket";
import { buildWsUrl, setLanConfig, type LanEndpoint } from "../lib/ws-config";
import type {
    OrderSentData, TableStatusChangedData, InvoicePaidData,
} from "../../shared/ws-events";

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

export interface WebSocketProviderConfig extends Partial<LanEndpoint> {
    /** Habilitar logs (default false) */
    debug?: boolean;
    /** Reconectar automáticamente al montar (default true) */
    autoConnect?: boolean;
}

export interface WebSocketContextValue extends UseLocalSocketReturn {
    /** Helpers tipados de alto nivel */
    sendOrder:           (data: OrderSentData)    => boolean;
    broadcastTableStatus:(data: TableStatusChangedData) => boolean;
    broadcastInvoicePaid:(data: InvoicePaidData)   => boolean;
    /** Actualiza la URL del WS (cambia host/puerto/key) */
    setEndpoint: (cfg: Partial<LanEndpoint>) => void;
    /** URL HTTP equivalente (para fetch REST) */
    httpBaseUrl: string | null;
}

// ---------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

// ---------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------

export function WebSocketProvider({
    config, children,
}: { config?: WebSocketProviderConfig; children: ReactNode }) {
    // Si el padre pasó un endpoint, persístelo en localStorage
    useMemo(() => {
        if (config?.host || config?.port || config?.key || config?.role) {
            setLanConfig(config);
        }
    }, [config?.host, config?.port, config?.key, config?.role]);

    const url = useMemo(() => buildWsUrl(config), [
        config?.host, config?.port, config?.key, config?.role,
    ]);

    const socket = useLocalSocket({
        url,
        autoConnect: config?.autoConnect ?? true,
        debug:       config?.debug       ?? false,
    });

    // Helpers tipados --------------------------------------------------
    const sendOrder = useCallback((data: OrderSentData) =>
        socket.send("ORDER_SENT", data), [socket]);

    const broadcastTableStatus = useCallback((data: TableStatusChangedData) =>
        socket.send("TABLE_STATUS_CHANGED", data), [socket]);

    const broadcastInvoicePaid = useCallback((data: InvoicePaidData) =>
        socket.send("INVOICE_PAID", data), [socket]);

    const setEndpoint = useCallback((cfg: Partial<LanEndpoint>) => {
        setLanConfig(cfg);
        // Forzamos un reconnect con la nueva URL
        socket.reconnect();
    }, [socket]);

    const httpBaseUrl = useMemo(() => {
        if (!url) return null;
        try {
            const u = new URL(url);
            return `${u.protocol === "wss:" ? "https:" : "http:"}//${u.host}`;
        } catch {
            return null;
        }
    }, [url]);

    // Valor del context -----------------------------------------------
    const value = useMemo<WebSocketContextValue>(() => ({
        ...socket,
        sendOrder,
        broadcastTableStatus,
        broadcastInvoicePaid,
        setEndpoint,
        httpBaseUrl,
    }), [socket, sendOrder, broadcastTableStatus, broadcastInvoicePaid, setEndpoint, httpBaseUrl]);

    return (
        <WebSocketContext.Provider value={value}>
            {children}
        </WebSocketContext.Provider>
    );
}

// ---------------------------------------------------------------------
// Hook de consumo
// ---------------------------------------------------------------------

export function useWebSocket(): WebSocketContextValue {
    const ctx = useContext(WebSocketContext);
    if (!ctx) {
        throw new Error(
            "useWebSocket() debe usarse dentro de <WebSocketProvider>",
        );
    }
    return ctx;
}

/** Variante que no lanza si no hay provider (devuelve defaults). */
export function useWebSocketOptional(): WebSocketContextValue | null {
    return useContext(WebSocketContext);
}
