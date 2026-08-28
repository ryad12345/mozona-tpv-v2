// =====================================================================
// MOZONA TPV — useWaiters: hook reactivo de gestión de camareros
// =====================================================================

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import {
    syncWaiters, listCachedWaiters, findByPinCached,
    createWaiter, updateWaiter, deleteWaiterById,
    type Waiter, type WaiterRole,
} from "../lib/waiters";
import type { CachedWaiter } from "../lib/offlineStorage";

export interface UseWaitersReturn {
    waiters:     Waiter[];
    loading:     boolean;
    error:       string | null;
    refresh:     () => Promise<void>;
    create:      (input: { name: string; pin_code: string; role: WaiterRole }) => Promise<Waiter | null>;
    update:      (id: string, patch: { name?: string; pin_code?: string; role?: WaiterRole; is_active?: boolean }) => Promise<Waiter | null>;
    remove:      (id: string) => Promise<boolean>;
    validatePin: (pin: string) => Promise<CachedWaiter | null>;
}

export function useWaiters(): UseWaitersReturn {
    const auth = useAuth();
    const [waiters, setWaiters] = useState<Waiter[]>([]);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState<string | null>(null);

    const tenantId = auth.tenant?.id ?? null;

    const refresh = useCallback(async () => {
        if (!tenantId) {
            setWaiters([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            // 1) Carga instantánea desde caché
            const cached = await listCachedWaiters(tenantId);
            if (cached.length > 0) {
                setWaiters(cached.map(c => ({
                    id: c.id, tenant_id: c.tenant_id, user_id: c.user_id,
                    name: c.name, email: null, pin_code: c.pin_code,
                    role: c.role, is_active: c.is_active,
                    created_at: new Date(c.cached_at).toISOString(),
                })));
            }
            // 2) Sync con Supabase en background
            const remote = await syncWaiters(tenantId);
            setWaiters(remote);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    useEffect(() => {
        if (auth.isReady && tenantId) {
            void refresh();
        }
    }, [auth.isReady, tenantId, refresh]);

    const create = useCallback(async (input: { name: string; pin_code: string; role: WaiterRole }) => {
        if (!tenantId) return null;
        try {
            const w = await createWaiter({ ...input, tenant_id: tenantId });
            setWaiters(prev => [...prev, w]);
            return w;
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            return null;
        }
    }, [tenantId]);

    const update = useCallback(async (
        id: string,
        patch: { name?: string; pin_code?: string; role?: WaiterRole; is_active?: boolean },
    ) => {
        try {
            const w = await updateWaiter(id, patch);
            setWaiters(prev => prev.map(x => x.id === id ? w : x));
            return w;
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            return null;
        }
    }, []);

    const remove = useCallback(async (id: string) => {
        try {
            await deleteWaiterById(id);
            setWaiters(prev => prev.filter(x => x.id !== id));
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            return false;
        }
    }, []);

    const validatePin = useCallback(async (pin: string) => {
        if (!tenantId) return null;
        return findByPinCached(tenantId, pin);
    }, [tenantId]);

    return { waiters, loading, error, refresh, create, update, remove, validatePin };
}
