// =====================================================================
// MOZONA TPV — useNetworkSync
// =====================================================================
// Detecta cambios de conectividad (navigator.onLine + eventos online/
// offline) y procesa la cola de IndexedDB empujando las facturas
// pendientes a Supabase Cloud (o donde se configure).
//
//   • Al volver online, drena automáticamente la cola
//   • También drena periódicamente (intervalMs, default 30s)
//   • Backoff exponencial ya gestionado por offlineStorage.markSyncFailed
//   • Soporta Background Sync API (Chromium) si está disponible
// =====================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
    countPending, enqueueSync, getReadyPending,
    markSyncDone, markSyncing, markSyncFailed,
    type PendingSyncItem, type SyncKind,
} from "../lib/offlineStorage";

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

export interface UseNetworkSyncOptions {
    /** Función que envía UN item al backend remoto. */
    remoteSync:     (item: PendingSyncItem) => Promise<void>;
    /** Intervalo en ms para drenar la cola (default 30_000). */
    intervalMs?:    number;
    /** Drenar al montar (default true). */
    autoDrain?:     boolean;
    /** Habilitar logs. */
    debug?:         boolean;
    /** Callback opcional al drenar la cola completa. */
    onDrainEnd?:    (processed: number) => void;
    /** Callback opcional de error por item. */
    onItemError?:   (item: PendingSyncItem, err: Error) => void;
}

export interface UseNetworkSyncReturn {
    isOnline:       boolean;
    pendingCount:   number;
    isSyncing:      boolean;
    lastSyncAt:     string | null;
    lastError:      string | null;
    /** Fuerce un drenado manual. */
    drain:          () => Promise<number>;
    /** Añade un item a la cola y, si hay red, lo envía ya. */
    enqueue:        (kind: SyncKind, payload: unknown) => Promise<number>;
}

// ---------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------

export function useNetworkSync(opts: UseNetworkSyncOptions): UseNetworkSyncReturn {
    const {
        remoteSync, intervalMs = 30_000, autoDrain = true,
        debug = false, onDrainEnd, onItemError,
    } = opts;

    const [isOnline, setOnline]         = useState(
        typeof navigator !== "undefined" ? navigator.onLine : true
    );
    const [pendingCount, setCount]      = useState(0);
    const [isSyncing, setIsSyncing]     = useState(false);
    const [lastSyncAt, setLastSyncAt]   = useState<string | null>(null);
    const [lastError, setLastError]     = useState<string | null>(null);

    const remoteSyncRef = useRef(remoteSync);
    const drainingRef   = useRef(false);
    useEffect(() => { remoteSyncRef.current = remoteSync; }, [remoteSync]);

    // Log helper
    const log = useCallback((...args: unknown[]) => {
        if (debug) console.log("[useNetworkSync]", ...args);
    }, [debug]);

    // -----------------------------------------------------------------
    // Refresca el contador de pendientes
    // -----------------------------------------------------------------
    const refreshCount = useCallback(async () => {
        try {
            const n = await countPending();
            setCount(n);
        } catch (e) {
            log("refreshCount error:", e);
        }
    }, [log]);

    useEffect(() => { void refreshCount(); }, [refreshCount]);

    // -----------------------------------------------------------------
    // Drenado de la cola
    // -----------------------------------------------------------------
    const drain = useCallback(async (): Promise<number> => {
        if (drainingRef.current) return 0;
        if (!navigator.onLine) {
            log("drain: offline, skip");
            return 0;
        }
        drainingRef.current = true;
        setIsSyncing(true);
        let processed = 0;
        try {
            const items = await getReadyPending();
            log(`drain: ${items.length} items ready`);

            for (const item of items) {
                if (!navigator.onLine) break;
                try {
                    await markSyncing(item.id!);
                    await remoteSyncRef.current(item);
                    await markSyncDone(item.id!);
                    processed += 1;
                } catch (e) {
                    const err = e instanceof Error ? e : new Error(String(e));
                    log(`item ${item.id} failed:`, err.message);
                    await markSyncFailed(item.id!, err.message);
                    onItemError?.(item, err);
                }
            }

            if (processed > 0) {
                setLastSyncAt(new Date().toISOString());
                setLastError(null);
            }
        } finally {
            drainingRef.current = false;
            setIsSyncing(false);
            await refreshCount();
            onDrainEnd?.(processed);
        }
        return processed;
    }, [log, onDrainEnd, onItemError, refreshCount]);

    // -----------------------------------------------------------------
    // Encolar + intentar enviar ya si hay red
    // -----------------------------------------------------------------
    const enqueue = useCallback(async (
        kind: SyncKind, payload: unknown,
    ): Promise<number> => {
        const id = await enqueueSync(kind, payload);
        await refreshCount();
        if (navigator.onLine) {
            void drain();
        }
        return id;
    }, [refreshCount, drain]);

    // -----------------------------------------------------------------
    // Listeners online / offline
    // -----------------------------------------------------------------
    useEffect(() => {
        const onOnline  = () => { setOnline(true);  log("online → drain");  void drain(); };
        const onOffline = () => { setOnline(false); log("offline"); };
        window.addEventListener("online",  onOnline);
        window.addEventListener("offline", onOffline);
        return () => {
            window.removeEventListener("online",  onOnline);
            window.removeEventListener("offline", onOffline);
        };
    }, [drain, log]);

    // -----------------------------------------------------------------
    // Drenado periódico
    // -----------------------------------------------------------------
    useEffect(() => {
        if (!autoDrain) return;
        const id = setInterval(() => { void drain(); }, intervalMs);
        return () => clearInterval(id);
    }, [autoDrain, intervalMs, drain]);

    // -----------------------------------------------------------------
    // Drenado al montar
    // -----------------------------------------------------------------
    useEffect(() => {
        if (autoDrain) void drain();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // -----------------------------------------------------------------
    // Background Sync API (Chromium 80+): si el SW lo soporta, registra
    // un sync tag. El SW (vite-plugin-pwa) puede usar la cola desde allí.
    // -----------------------------------------------------------------
    useEffect(() => {
        if (typeof navigator === "undefined") return;
        if (!("serviceWorker" in navigator)) return;
        if (!("SyncManager" in window)) return;

        const reg = (navigator.serviceWorker as unknown as {
            ready?: Promise<ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }>;
        }).ready;
        if (!reg) return;

        reg.then(r => {
            if (r.sync) {
                void r.sync.register("mozona-sync-pending");
            }
        }).catch(() => { /* no SW listo */ });
    }, []);

    return {
        isOnline, pendingCount, isSyncing,
        lastSyncAt, lastError,
        drain, enqueue,
    };
}
