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
        if (!user) return null;

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

        return null;
    } catch (e) {
        console.warn("[restaurantData] getMyTenant error:", e);
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
    const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name");
    if (error) {
        console.warn("[restaurantData] loadProducts error:", error.message);
        return [];
    }
    return (data ?? []).map((p: any) => ({
        ...p,
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
    return (data ?? []).map((t: any) => ({
        id: t.id,
        restaurant_id: t.tenant_id,
        zone_id: null,
        zone: t.zone,
        table_number: t.name,
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

        return { restaurant: tenant, categories, products, tables, source: "supabase", error: null };
    } catch (e) {
        return {
            restaurant: null, categories: [], products: [], tables: [],
            source: "empty", error: e instanceof Error ? e.message : String(e),
        };
    }
}
