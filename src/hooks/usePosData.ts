// =====================================================================
// MOZONA TPV — usePosData: hook de datos del terminal
// =====================================================================
// Fuente de datos en orden de prioridad:
//   1. Supabase (si hay sesión del usuario) → tenant real del usuario
//   2. Caché IndexedDB (offline)
//   3. Mock vacío (sin mostrar datos ficticios de "Casa Manolo")
//
// Cuando el usuario se autentica con Supabase, se carga SU tenant real
// (buscando por owner_id o por tenant_users), y de ahí se cargan
// categorías, productos (con sus image_url reales) y mesas.
// =====================================================================

import { useEffect, useState, useCallback } from "react";
import { isSupabaseConfigured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { loadRestaurantData, getMyTenant } from "../lib/restaurantData";
import {
    putCategories, putProducts, putTables,
    getAllCategories, getAllProducts, getAllTables, getMeta,
} from "../lib/offlineStorage";
import type {
    Restaurant, Category, Product, RestaurantTable, ConnectionStatus,
} from "../lib/types";

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

export interface PosDataState {
    restaurant:  Restaurant | null;
    categories:  Category[];
    products:    Product[];
    tables:      RestaurantTable[];
    connection:  ConnectionStatus;
    loading:     boolean;
    error:       string | null;
    refresh:     () => Promise<void>;
    source:      "supabase" | "lan" | "cache" | "empty";
}

const DEFAULT_RESTAURANT: Restaurant = {
    id: "",
    slug: "cargando",
    business_name: "Cargando…",
    cif_nif: "",
    address: "",
    phone: null,
    primary_color: "#2563EB",
    ticket_footer_msg: "",
    created_at: new Date().toISOString(),
};

// ---------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------

export function usePosData(): PosDataState {
    const auth = useAuth();
    const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [products,   setProducts]   = useState<Product[]>([]);
    const [tables,     setTables]     = useState<RestaurantTable[]>([]);
    const [connection, setConnection] = useState<ConnectionStatus>({
        printer: false, network: false, supabase: false,
    });
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState<string | null>(null);
    const [source,  setSource]  = useState<"supabase" | "lan" | "cache" | "empty">("empty");

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            // ★ v1.9: 100% directo a Supabase, sin IndexedDB ni mocks
            console.log("[usePosData] 🔄 refresh directo a Supabase (sin caché)...");

            // 1) Si hay sesión de camarero (vía /waiter/login), usar
            //    su tenant_id directamente
            let waiterTenantId: string | null = null;
            if (!auth.user) {
                try {
                    const cached = localStorage.getItem("mozona.waiter_session");
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        if (parsed.ok && parsed.tenant_id) {
                            waiterTenantId = parsed.tenant_id;
                        }
                    }
                } catch (e) { /* noop */ }
            }

            // 1) ★ Si hay sesión Supabase o de camarero, cargar del tenant real
            if (isSupabaseConfigured && (auth.user || waiterTenantId)) {
                try {
                    let data;
                    if (waiterTenantId) {
                        data = await loadRestaurantData(waiterTenantId);
                    } else if (auth.isSuperAdmin || auth.user) {
                        // ★ v3.4.13: Para VIP / SuperAdmin, si el AuthContext
                        //   YA cargó el tenant real (vía /api/tenant-settings),
                        //   usarlo directamente. Si no, hacer fallback server-side.
                        const realId = (auth.tenant && auth.tenant.id && auth.tenant.id !== "vip-bypass")
                            ? auth.tenant.id
                            : null;

                        if (realId) {
                            data = await loadRestaurantData(realId);
                            console.log("[usePosData] ✓ Cargado desde tenant real", realId);
                        } else {
                            // Sin tenant real → cargar vía endpoint server-side
                            // (bypasa RLS con SERVICE_ROLE)
                            try {
                                const r = await fetch(`/api/tenant-settings?email=${encodeURIComponent(auth.user?.email || "")}`);
                                const json = await r.json();
                                if (json && json.ok && json.tenant_id) {
                                    data = await loadRestaurantData(json.tenant_id);
                                    console.log("[usePosData] ✓ Cargado vía endpoint server-side, tenant=", json.tenant_id);
                                }
                            } catch (e) {
                                console.warn("[usePosData] Server-side resolve failed:", e);
                            }
                        }

                        if (!data || !data.restaurant) {
                            // Fallback extremo: primer tenant activo vía cliente
                            // (puede fallar por RLS pero es seguro intentarlo)
                            data = await loadRestaurantData();
                            if (!data.restaurant) {
                                try {
                                    const sb = (await import("../lib/supabase")).supabase;
                                    const { data: firstTenant } = await sb
                                        .from("tenants")
                                        .select("*")
                                        .order("created_at", { ascending: true })
                                        .limit(1)
                                        .maybeSingle();
                                    if (firstTenant) {
                                        data = await loadRestaurantData(firstTenant.id);
                                    }
                                } catch (e) {
                                    console.warn("[usePosData] VIP fallback tenant lookup:", e);
                                }
                            }
                        }
                    } else {
                        data = await loadRestaurantData();
                    }
                    if (data.error) {
                        console.warn("[usePosData] loadRestaurantData:", data.error);
                    }
                    if (data.restaurant) {
                        setRestaurant(data.restaurant);
                        setCategories(data.categories);
                        setProducts(data.products);
                        setTables(data.tables);
                        setConnection({
                            printer: false, network: true, supabase: true,
                        });
                        setSource("supabase");
                        setError(null);
                        // ★ DEBUG POS: log de productos cargados
                        console.log("[DEBUG POS] Productos cargados para la caja:", {
                            tenant: data.restaurant.id,
                            count: data.products.length,
                            productos: data.products.map((p: any) => ({
                                id: p.id,
                                name: p.name,
                                category: p.category,
                                price: p.price,
                            })),
                        });
                        // Persistir en caché
                        try {
                            await Promise.all([
                                putCategories(data.categories),
                                putProducts(data.products),
                                putTables(data.tables),
                            ]);
                        } catch {/* ignore */}
                        return;
                    }
                    // Sesión pero sin tenant: UI vacía
                    setRestaurant(null);
                    setCategories([]);
                    setProducts([]);
                    setTables([]);
                    setConnection({ printer: false, network: true, supabase: true });
                    setSource("empty");
                    setError(data.error ?? "No se encontró un tenant para tu cuenta");
                    return;
                } catch (e) {
                    console.warn("[usePosData] Supabase falló, usando caché:", e);
                    setError("Sin conexión con Supabase.  Mostrando datos en caché.");
                }
            }

            // 2) ★★★ CONEXIÓN DIRECTA A SUPABASE ★★★
            //    Sin IndexedDB, sin localStorage, sin fallback estático.
            //    La caja se conecta EXCLUSIVAMENTE a Supabase.
            setRestaurant(null);
            setCategories([]);
            setProducts([]);
            setTables([]);
            setConnection({ printer: false, network: false, supabase: isSupabaseConfigured });
            setSource("empty");
            setError("Inicia sesión para cargar tu menú");
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [auth.user?.id]);

    useEffect(() => { void refresh(); }, [refresh]);

    return { restaurant, categories, products, tables, connection, loading, error, refresh, source };
}
