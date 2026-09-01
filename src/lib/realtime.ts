// =====================================================================
// MOZONA TPV — realtime: suscripción global a canales
// =====================================================================

import { supabase } from "./supabase";

/**
 * Suscribe a los 4 canales de Realtime (products, dining_tables,
 * open_orders, orders) SIN filtros de tenant.
 *
 * @param onUpdate Callback llamado en cada cambio
 * @returns Función de cleanup (unsubscribe)
 */
export function subscribeToPosChannels(onUpdate: () => void): () => void {
    if (!supabase) return () => {};
    const ts = Date.now();
    const rnd = Math.random().toString(36).slice(2, 6);
    const channelName = `tpv-global-sync-${ts}-${rnd}`;
    console.log("[subscribeToPosChannels] creando canal:", channelName);

    const channel = supabase
        .channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
            console.log("[realtime] products change");
            onUpdate();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "dining_tables" }, () => {
            console.log("[realtime] dining_tables change");
            onUpdate();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "open_orders" }, () => {
            console.log("[realtime] open_orders change");
            onUpdate();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
            console.log("[realtime] orders change");
            onUpdate();
        })
        .subscribe((status) => {
            console.log("[realtime] canal status:", status);
        });

    return () => {
        console.log("[subscribeToPosChannels] removiendo canal");
        void supabase.removeChannel(channel);
    };
}
