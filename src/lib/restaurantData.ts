// =====================================================================
// MOZONA TPV — restaurantData: carga real desde Supabase
// =====================================================================

import { supabase, isSupabaseConfigured } from "./supabase";
import type { Restaurant, Category, Product, RestaurantTable } from "./types";

// ---------------------------------------------------------------------
// Tipos de respuesta
// ---------------------------------------------------------------------

export interface RestaurantDataResult {
    restaurant: Restaurant | null;
    categories: Category[];
    products:   Product[];
    tables:     RestaurantTable[];
    source:     "supabase" | "cache" | "mock" | "empty";
    error:      string | null;
}

// ---------------------------------------------------------------------
// Tenant del usuario actual (busca por owner_id = auth.uid())
// ---------------------------------------------------------------------

export async function getMyTenant(): Promise<Restaurant | null> {
    if (!isSupabaseConfigured) return null;
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            // Sin sesión: intentar el primer tenant activo (VIP bypass)
            const firstActive = await getFirstActiveTenant();
            if (firstActive) {
                const { data } = await supabase
                    .from("tenants").select("*").eq("id", firstActive).maybeSingle();
                if (data) return data as Restaurant;
            }
            return null;
        }

        // ★ v1.9.1: ir DIRECTO al primer tenant activo (sin owner_id)
        //    El user no es owner del tenant (caso VIP), así que
        //    ahorramos queries innecesarias que devuelven 400
        try {
            const firstActive = await getFirstActiveTenant();
            if (firstActive) {
                const { data } = await supabase
                    .from("tenants").select("*").eq("id", firstActive).maybeSingle();
                if (data) {
                    console.log("[getMyTenant] ✓ primer tenant activo:", firstActive);
                    return data as Restaurant;
                }
            }
        } catch (e) {
            console.warn("[getMyTenant] first tenant lookup error:", e);
        }

        // Si tampoco funcionó, intentar tenant_users (best-effort)
        try {
            const { data: tu, error: err2 } = await supabase
                .from("tenant_users")
                .select("tenant_id")
                .eq("user_id", user.id)
                .maybeSingle();
            if (err2) console.warn("[getMyTenant] tenant_users error:", err2.message);
            if (tu?.tenant_id) {
                const { data: t } = await supabase
                    .from("tenants").select("*").eq("id", tu.tenant_id).maybeSingle();
                if (t) return t as Restaurant;
            }
        } catch (e) {
            console.warn("[getMyTenant] tenant_users lookup error:", e);
        }

        return null;
    } catch (e) {
        console.warn("[restaurantData] getMyTenant error:", e);
        return null;
    }
}

/** Llama al RPC get_first_active_tenant() (SECURITY DEFINER, bypasea RLS). */
async function getFirstActiveTenant(): Promise<string | null> {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.rpc("get_first_active_tenant");
        if (error || !data) return null;
        return data as string;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------
// Categorías del tenant
// ---------------------------------------------------------------------

export async function loadCategories(tenantId: string): Promise<Category[]> {
    if (!isSupabaseConfigured) return [];
    // 1) Con tenant
    const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("sort_order");
    if (error) {
        console.warn("[restaurantData] loadCategories error:", error.message);
        return [];
    }
    if (data && data.length > 0) {
        console.log("[loadCategories] ✓", data.length, "con tenant");
        return data as Category[];
    }
    // 2) FALLBACK: leer TODAS las categorías activas
    console.warn("[loadCategories] 0 con tenant, leyendo todas...");
    const { data: allData } = await supabase
        .from("categories")
        .select("*")
        .order("sort_order");
    if (!allData) return [];
    // Tenant dominante
    const byTenant: Record<string, number> = {};
    for (const c of allData) {
        const k = String(c.tenant_id ?? "null");
        byTenant[k] = (byTenant[k] ?? 0) + 1;
    }
    const dominant = Object.entries(byTenant).sort(([, a], [, b]) => b - a)[0]?.[0];
    if (dominant && dominant !== "null") {
        return allData.filter(c => String(c.tenant_id) === dominant) as Category[];
    }
    return allData as Category[];
}

// ---------------------------------------------------------------------
// Productos del tenant
// ---------------------------------------------------------------------

/** ★★★ CONEXIÓN DIRECTA A SUPABASE ★★★
 *  Sin IndexedDB, sin localStorage, sin fallback estático.
 *  Garantiza que el catálogo de la caja viene SIEMPRE de la BD.
 *
 *  Si tenantId no devuelve resultados, hace query sin filtro
 *  y usa los productos del tenant dominante (el que tenga más).
 */
export async function loadProducts(tenantId: string): Promise<Product[]> {
    if (!isSupabaseConfigured) return [];
    console.log("[loadProducts] ★★ INICIO ★★ tenantId=", tenantId);

    const mapProduct = (p: any): Product => ({
        ...p,
        price: Number(p.price ?? 0),
        tax_rate: Number(p.tax_rate ?? 10),
        is_available: p.is_active ?? true,
        restaurant_id: p.tenant_id,
        category_id: p.category_id ?? null,
    });

    // 1) Query con tenant_id
    const { data, error } = await supabase
        .from("products")
        .select("id, name, description, price, category, image_url, is_active, tenant_id, tax_rate, category_id, sort_order")
        .eq("tenant_id", tenantId)
        .order("name");
    if (error) {
        console.warn("[loadProducts] error con tenant:", error.message);
    } else if (data && data.length > 0) {
        console.log("[loadProducts] ✓", data.length, "productos con tenant", tenantId);
        return data.map(mapProduct);
    }

    // 2) ★ FALLBACK: query sin filtro de tenant (is_active=true)
    console.warn("[loadProducts] 0 productos con tenant, buscando en todos...");
    const { data: allData, error: allErr } = await supabase
        .from("products")
        .select("id, name, description, price, category, image_url, is_active, tenant_id, tax_rate, category_id, sort_order")
        .eq("is_active", true)
        .order("name")
        .limit(1000);
    if (allErr) {
        console.error("[loadProducts] error sin filtro:", allErr.message);
        return [];
    }
    if (!allData || allData.length === 0) {
        console.warn("[loadProducts] 0 productos en la BD");
        return [];
    }

    // 3) Distribución por tenant_id
    const byTenant: Record<string, number> = {};
    for (const p of allData) {
        const k = String(p.tenant_id ?? "null");
        byTenant[k] = (byTenant[k] ?? 0) + 1;
    }
    console.log("[loadProducts] DISTRIBUCIÓN por tenant_id:", byTenant);

    // 4) Usar el tenant DOMINANTE
    const sortedTenants = Object.entries(byTenant).sort(([, a], [, b]) => b - a);
    const dominantTenant = sortedTenants[0]?.[0];
    if (dominantTenant && dominantTenant !== "null") {
        const prods = allData
            .filter(p => String(p.tenant_id) === dominantTenant)
            .map(mapProduct);
        console.log("[loadProducts] ✓ tenant dominante:", dominantTenant, "→", prods.length, "productos");
        return prods;
    }
    console.log("[loadProducts] devolviendo todos sin tenant:", allData.length);
    return allData.map(mapProduct);
}

// ---------------------------------------------------------------------
// Mesas del tenant
// ---------------------------------------------------------------------

export async function loadTables(tenantId: string): Promise<RestaurantTable[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
        .from("dining_tables")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("zone")
        .order("name");
    if (error) {
        console.warn("[restaurantData] loadTables error:", error.message);
        return [];
    }
    return (data ?? []).map((t: any, i: number) => ({
        id: t.id,
        restaurant_id: t.tenant_id,
        zone_id: null,
        zone: t.zone,
        // Numeración SECUENCIAL basada en el orden del array (1, 2, 3, ..., 16)
        // Esto evita duplicados cuando la BD tiene nombres como "B-1" y "S-1"
        // que ambos extraerían el dígito "1".
        table_number: String(i + 1),
        status: t.status === "occupied" ? "OCCUPIED"
              : t.status === "billed"   ? "BILL_REQUESTED"
              : t.status === "reserved" ? "RESERVED"
              : t.status === "dirty"    ? "DIRTY"
              : "FREE",
    })) as RestaurantTable[];
}

// ---------------------------------------------------------------------
// Carga completa: tenant + categorías + productos + mesas
// ---------------------------------------------------------------------

export async function loadRestaurantData(tenantId?: string): Promise<RestaurantDataResult> {
    if (!isSupabaseConfigured) {
        return {
            restaurant: null, categories: [], products: [], tables: [],
            source: "empty", error: "Supabase no configurado",
        };
    }

    try {
        // 1) Resolver tenant
        let tenant: Restaurant | null = null;
        if (tenantId) {
            const { data } = await supabase
                .from("tenants")
                .select("*")
                .eq("id", tenantId)
                .maybeSingle();
            tenant = data as Restaurant | null;
        }
        if (!tenant) tenant = await getMyTenant();
        if (!tenant) {
            return {
                restaurant: null, categories: [], products: [], tables: [],
                source: "empty", error: "No se encontró un tenant para este usuario",
            };
        }

        // 2) Cargar en paralelo
        const [categories, products, tables] = await Promise.all([
            loadCategories(tenant.id),
            loadProducts(tenant.id),
            loadTables(tenant.id),
        ]);

        console.log(
            "[loadRestaurantData] tenant =", tenant.id,
            "products =", products.length,
            "categories =", categories.length,
            "tables =", tables.length,
        );

        return { restaurant: tenant, categories, products, tables, source: "supabase", error: null };
    } catch (e) {
        return {
            restaurant: null, categories: [], products: [], tables: [],
            source: "empty", error: e instanceof Error ? e.message : String(e),
        };
    }
}
