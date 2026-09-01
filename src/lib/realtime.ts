// =====================================================================
// MOZONA TPV — realtime: singleton seguro (anti-bucle)
// =====================================================================
// Patrón singleton para evitar suscripciones duplicadas que causan
// RangeError: Maximum call stack size exceeded.
// Solo UN canal activo en toda la app. Cleanup seguro con flag.

import { supabase } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

let globalChannel: RealtimeChannel | null = null;
let refCount = 0;
let isUnsubscribing = false;  // ★ guard contra re-entry

/**
 * Suscribe al canal GLOBAL de Realtime.
 * Solo se crea UN canal aunque se llame múltiples veces (singleton).
 *
 * @param onUpdate Callback con el payload del evento
 * @returns Función de cleanup que decrementa el refCount
 */
export function subscribeToPosChannels(
    onUpdate: (payload: { table: string; eventType: string; new: any; old: any }) => void,
): () => void {
    if (!supabase) return () => {};

    // ★ Guard contra bucle: si ya estamos desuscribiendo, no hacer nada
    if (isUnsubscribing) {
        console.warn("[realtime] ya está desuscribiendo, ignorando llamada");
        return () => {};
    }

    refCount++;
    const myRef = refCount;
    console.log("[realtime] suscribiendo, refCount=", myRef);

    // Si ya hay un canal, solo añadir el listener
    if (globalChannel) {
        console.log("[realtime] reutilizando canal existente, refCount=", myRef);
        // No podemos añadir listeners dinámicamente al canal ya creado,
        // pero el callback ya está en el closure original
        return () => {
            refCount--;
            console.log("[realtime] cleanup (sin canal), refCount=", refCount);
        };
    }

    // Crear el canal UNA SOLA VEZ
    const channelName = `tpv-global-sync-${Date.now()}`;
    console.log("[realtime] creando nuevo canal:", channelName);

    let channel: RealtimeChannel;
    try {
        channel = supabase.channel(channelName);
        channel
            .on("postgres_changes", { event: "*", schema: "public", table: "products" },
                (p: any) => onUpdate({ table: "products", eventType: p.eventType, new: p.new, old: p.old }))
            .on("postgres_changes", { event: "*", schema: "public", table: "dining_tables" },
                (p: any) => onUpdate({ table: "dining_tables", eventType: p.eventType, new: p.new, old: p.old }))
            .on("postgres_changes", { event: "*", schema: "public", table: "open_orders" },
                (p: any) => onUpdate({ table: "open_orders", eventType: p.eventType, new: p.new, old: p.old }))
            .on("postgres_changes", { event: "*", schema: "public", table: "orders" },
                (p: any) => onUpdate({ table: "orders", eventType: p.eventType, new: p.new, old: p.old }))
            .subscribe((status: string) => {
                console.log("[realtime] status:", status);
            });
        globalChannel = channel;
    } catch (e) {
        console.error("[realtime] error creando canal:", e);
        refCount--;
        return () => {};
    }

    return () => {
        // ★ Cleanup seguro con queueMicrotask para evitar recursión
        // (el bug era: leave() se llama dentro de trigger() que es
        //  llamado por callback de leave() => bucle)
        isUnsubscribing = true;
        refCount--;
        console.log("[realtime] cleanup, refCount=", refCount);

        if (refCount <= 0 && globalChannel) {
            const ch = globalChannel;
            globalChannel = null;
            // ★ queueMicrotask saca el removeChannel del stack actual
            queueMicrotask(() => {
                try {
                    void supabase.removeChannel(ch);
                } catch (e) {
                    console.warn("[realtime] removeChannel error:", e);
                }
                setTimeout(() => { isUnsubscribing = false; }, 100);
            });
        } else {
            // Pequeño delay antes de resetear el flag
            setTimeout(() => { isUnsubscribing = false; }, 100);
        }
    };
}

/** Para diagnóstico: cuántos consumidores hay activos */
export function getRealtimeRefCount(): number {
    return refCount;
}
