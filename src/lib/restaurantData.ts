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

        // 1) Por owner_id
        const { data: byOwner } = await supabase
            .from("tenants")
            .select("*")
            .eq("owner_id", user.id)
            .maybeSingle();
        if (byOwner) return byOwner as Restaurant;

        // 2) Por tenant_users (camarero, manager, etc.)
        const { data: tu } = await supabase
            .from("tenant_users")
            .select("tenant_id, tenants(*)")
            .eq("user_id", user.id)
            .maybeSingle();
        if (tu?.tenants) return tu.tenants as unknown as Restaurant;

        // 3) VIP / SuperAdmin: no es owner pero debe ver el primer tenant activo
        const firstActive = await getFirstActiveTenant();
        if (firstActive) {
            const { data } = await supabase
                .from("tenants").select("*").eq("id", firstActive).maybeSingle();
            if (data) {
                console.log("[getMyTenant] VIP bypass → primer tenant activo:", firstActive);
                return data as Restaurant;
            }
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
    const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("sort_order");
    if (error) {
        console.warn("[restaurantData] loadCategories error:", error.message);
        return [];
    }
    return (data ?? []) as Category[];
}

// ---------------------------------------------------------------------
// Productos del tenant
// ---------------------------------------------------------------------

export async function loadProducts(tenantId: string): Promise<Product[]> {
    if (!isSupabaseConfigured) return [];
    console.log("[loadProducts] tenantId=", tenantId);
    const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name");
    if (error) {
        console.warn("[loadProducts] error:", error.message);
        return [];
    }

    // ★ MODO DETECTIVE: si no hay productos con este tenant_id,
    //   buscar en TODOS los productos y reportar distribución
    if ((data?.length ?? 0) === 0) {
        console.warn("[loadProducts] 0 productos con tenant_id=", tenantId, "— buscando en todos");
        const { data: allData } = await supabase
            .from("products")
            .select("*")
            .order("name")
            .limit(500);
        if (allData && allData.length > 0) {
            const byTenant: Record<string, number> = {};
            for (const p of allData) {
                const k = String(p.tenant_id ?? "null");
                byTenant[k] = (byTenant[k] ?? 0) + 1;
            }
            console.log("[loadProducts] DISTRIBUCIÓN por tenant_id:", byTenant);
            // Usar el primer tenant que tenga productos
            const firstTenantWithProducts = allData.find(p => p.tenant_id)?.tenant_id;
            if (firstTenantWithProducts && firstTenantWithProducts !== tenantId) {
                console.warn("[loadProducts] usando tenant_id alternativo:", firstTenantWithProducts);
                return allData.filter((p: any) => p.tenant_id === firstTenantWithProducts).map((p: any) => ({
                    ...p,
                    price: Number(p.price ?? 0),
                    tax_rate: Number(p.tax_rate ?? 10),
                    is_available: p.is_active ?? true,
                    restaurant_id: p.tenant_id,
                    category_id: p.category_id ?? null,
                })) as Product[];
            }
            return allData.map((p: any) => ({
                ...p,
                price: Number(p.price ?? 0),
                tax_rate: Number(p.tax_rate ?? 10),
                is_available: p.is_active ?? true,
                restaurant_id: p.tenant_id,
                category_id: p.category_id ?? null,
            })) as Product[];
        }
    }

    return (data ?? []).map((p: any) => ({
        ...p,
        // Supabase NUMERIC/REAL columns se serializan como string -> normalizar a number
        price: Number(p.price ?? 0),
        tax_rate: Number(p.tax_rate ?? 10),
        is_available: p.is_active ?? true,
        restaurant_id: p.tenant_id,
        category_id: p.category_id ?? null,
    })) as Product[];
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
