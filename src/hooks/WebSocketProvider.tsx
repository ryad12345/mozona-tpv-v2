// =====================================================================
// MOZONA TPV — WebSocketProvider (versión completa con subscribe)
// =====================================================================

import React, {
    createContext, useContext, useState, useCallback,
    type ReactNode,
} from "react";

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

export interface WebSocketContextType {
    isConnected: boolean;
    status: string;
    lastMessage: any;
    queueSize: number;
    latencyMs: number | null;
    reconnectAttempts: number;
    clientsCount: number | null;
    serverInfo: any | null;
    lastError: string | null;
    /** API */
    send: (msg: any) => boolean;
    sendMessage: (msg: any) => void;
    /** Suscripción tipada a eventos del server. Devuelve cleanup. */
    subscribe: (type: string, handler: (env: any) => void) => () => void;
    reconnect: () => void;
    disconnect: () => void;
    flushQueue: () => void;
    setEndpoint: (cfg: { host?: string; port?: number }) => void;
    httpBaseUrl: string | null;
    /** Helpers de alto nivel (compatibilidad) */
    sendOrder: (data: any) => boolean;
    broadcastTableStatus: (data: any) => boolean;
    broadcastInvoicePaid: (data: any) => boolean;
    [key: string]: any;
}

const NOOP = () => {};
const NOOP_SUB = () => NOOP;

// ---------------------------------------------------------------------
// Default (cuando no hay provider o está en "modo demo")
// ---------------------------------------------------------------------

const DEFAULT_WS: WebSocketContextType = {
    isConnected:      true,
    status:           "online",
    lastMessage:      null,
    queueSize:        0,
    latencyMs:        null,
    reconnectAttempts:0,
    clientsCount:     null,
    serverInfo:       null,
    lastError:        null,
    send:             () => false,
    sendMessage:      NOOP,
    subscribe:        NOOP_SUB,
    reconnect:        NOOP,
    disconnect:       NOOP,
    flushQueue:       NOOP,
    setEndpoint:      NOOP,
    httpBaseUrl:      null,
    sendOrder:        () => false,
    broadcastTableStatus: () => false,
    broadcastInvoicePaid: () => false,
};

export const WebSocketContext = createContext<WebSocketContextType>(DEFAULT_WS);

// ---------------------------------------------------------------------
// Provider (versión "demo/online" — no abre WebSocket real)
// ---------------------------------------------------------------------

export function WebSocketProvider({ children }: { children: ReactNode }) {
    const [isConnected] = useState(true);
    const [status]      = useState("online");
    const [lastMessage] = useState<any>(null);
    const [queueSize, setQueueSize] = useState(0);
    const [serverInfo]  = useState<any>(null);
    const [lastError]   = useState<string | null>(null);

    // Almacén de handlers para subscribe
    const handlersRef = React.useRef<Map<string, Set<(env: any) => void>>>(new Map());

    const send = useCallback((_msg: any) => {
        // Modo demo: encolamos el mensaje y no lo enviamos
        setQueueSize(q => q + 1);
        if (typeof console !== "undefined") {
            console.info("[WebSocketProvider] demo: send encolado", _msg);
        }
        return false;
    }, []);

    const sendMessage = useCallback((msg: any) => { send(msg); }, [send]);

    const subscribe = useCallback((type: string, handler: (env: any) => void) => {
        const set = handlersRef.current.get(type) ?? new Set();
        set.add(handler);
        handlersRef.current.set(type, set);
        return () => {
            set.delete(handler);
            if (set.size === 0) handlersRef.current.delete(type);
        };
    }, []);

    const sendOrder = useCallback((data: any) => send({ type: "ORDER_SENT", data }), [send]);
    const broadcastTableStatus = useCallback((data: any) =>
        send({ type: "TABLE_STATUS_CHANGED", data }), [send]);
    const broadcastInvoicePaid = useCallback((data: any) =>
        send({ type: "INVOICE_PAID", data }), [send]);

    const reconnect   = useCallback(NOOP, []);
    const disconnect  = useCallback(NOOP, []);
    const flushQueue  = useCallback(NOOP, []);
    const setEndpoint = useCallback(NOOP, []);

    const value: WebSocketContextType = {
        isConnected, status, lastMessage, queueSize,
        latencyMs: null,
        reconnectAttempts: 0,
        clientsCount: null,
        serverInfo, lastError,
        send, sendMessage, subscribe, reconnect, disconnect, flushQueue, setEndpoint,
        httpBaseUrl: null,
        sendOrder, broadcastTableStatus, broadcastInvoicePaid,
    };

    return (
        <WebSocketContext.Provider value={value}>
            {children}
        </WebSocketContext.Provider>
    );
}

// ---------------------------------------------------------------------
// Hook de consumo
// ---------------------------------------------------------------------

export function useWebSocket(): WebSocketContextType {
    const ctx = useContext(WebSocketContext);
    return ctx || DEFAULT_WS;
}

/** Variante que no lanza si no hay provider (devuelve defaults). */
export function useWebSocketOptional(): WebSocketContextType | null {
    return useContext(WebSocketContext);
}

export default WebSocketProvider;
