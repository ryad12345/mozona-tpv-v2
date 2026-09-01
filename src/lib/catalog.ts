// =====================================================================
// MOZONA TPV — catalog: carga universal del catálogo
// =====================================================================

import { supabase } from "./supabase";
import { getActiveTenantId, ZERO_UUID } from "./tenantResolver";

export interface CatalogProduct {
    id: string;
    name: string;
    description: string | null;
    price: number;
    category: string | null;
    image_url: string | null;
    is_active: boolean;
    tax_rate: number;
    tenant_id: string | null;
}

/**
 * Carga el catálogo de productos activos. Usado por:
 *   - Caja (/app) vía usePosData
 *   - Camarero (/waiter)
 *   - ItemsPanel (/settings/products)
 *
 * Estrategia:
 *   1) SELECT con tenant_id del usuario actual
 *   2) FALLBACK: SELECT con is_active=true (todos los tenants)
 *   3) FALLBACK: SELECT sin filtros
 */
export async function fetchCatalog(): Promise<CatalogProduct[]> {
    if (!supabase) return [];
    console.log("[fetchCatalog] ★★ INICIO ★*");

    const tenantId = await getActiveTenantId();
    console.log("[fetchCatalog] tenantId resuelto:", tenantId);

    // 1) Con tenant
    if (tenantId && tenantId !== ZERO_UUID) {
        const { data, error } = await supabase
            .from("products")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("is_active", true)
            .order("name", { ascending: true });
        if (error) {
            console.warn("[fetchCatalog] error con tenant:", error.message);
        } else if (data && data.length > 0) {
            console.log("[fetchCatalog] ✓", data.length, "productos con tenant", tenantId);
            return data.map(normalize);
        }
    }

    // 2) Sin filtro de tenant, solo is_active
    console.warn("[fetchCatalog] 0 con tenant, buscando en todos...");
    const { data: allData, error: allErr } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(1000);
    if (allErr) {
        console.error("[fetchCatalog] error sin filtro:", allErr.message);
        return [];
    }
    if (!allData || allData.length === 0) {
        console.warn("[fetchCatalog] 0 productos en la BD");
        return [];
    }

    // 3) Usar el tenant DOMINANTE
    const byTenant: Record<string, number> = {};
    for (const p of allData) {
        const k = String(p.tenant_id ?? "null");
        byTenant[k] = (byTenant[k] ?? 0) + 1;
    }
    const dominant = Object.entries(byTenant).sort(([, a], [, b]) => b - a)[0]?.[0];
    if (dominant && dominant !== "null") {
        const prods = allData
            .filter(p => String(p.tenant_id) === dominant)
            .map(normalize);
        console.log("[fetchCatalog] ✓ tenant dominante:", dominant, "→", prods.length);
        return prods;
    }
    return allData.map(normalize);
}

function normalize(p: any): CatalogProduct {
    return {
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        price: Number(p.price ?? 0),
        // ★ Mapear category_id / category / category_name
        category: p.category ?? p.category_name ?? p.categoryName ?? null,
        image_url: p.image_url ?? p.image ?? p.imageUrl ?? null,
        is_active: p.is_active ?? true,
        tax_rate: Number(p.tax_rate ?? p.vat_rate ?? 10),
        tenant_id: p.tenant_id ?? null,
    };
}

// =====================================================================
// CATEGORIES
// =====================================================================

export interface CatalogCategory {
    id: string;
    name: string;
    description?: string | null;
    image_url?: string | null;
    sort_order?: number;
    is_active: boolean;
    tenant_id: string | null;
}

/** Carga categorías con fallback multi-tenant */
export async function fetchCategories(): Promise<CatalogCategory[]> {
    if (!supabase) return [];
    console.log("[fetchCategories] ★★ INICIO ★*");
    const tenantId = await getActiveTenantId();

    // 1) Con tenant
    if (tenantId && tenantId !== ZERO_UUID) {
        const { data, error } = await supabase
            .from("categories")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("is_active", true)
            .order("name", { ascending: true });
        if (error) {
            console.warn("[fetchCategories] error con tenant:", error.message);
        } else if (data && data.length > 0) {
            console.log("[fetchCategories] ✓", data.length, "con tenant");
            return data.map(normalizeCategory);
        }
    }

    // 2) Sin filtro
    const { data: allData, error: allErr } = await supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(500);
    if (allErr) {
        console.error("[fetchCategories] error sin filtro:", allErr.message);
        return [];
    }
    if (!allData || allData.length === 0) {
        console.warn("[fetchCategories] 0 categorías");
        return [];
    }
    // Tenant dominante
    const byTenant: Record<string, number> = {};
    for (const c of allData) {
        byTenant[String(c.tenant_id ?? "null")] = (byTenant[String(c.tenant_id ?? "null")] ?? 0) + 1;
    }
    const dominant = Object.entries(byTenant).sort(([, a], [, b]) => b - a)[0]?.[0];
    if (dominant && dominant !== "null") {
        return allData
            .filter(c => String(c.tenant_id) === dominant)
            .map(normalizeCategory);
    }
    return allData.map(normalizeCategory);
}

function normalizeCategory(c: any): CatalogCategory {
    return {
        id:          c.id,
        name:        c.name,
        description: c.description ?? null,
        image_url:   c.image_url ?? c.image ?? null,
        sort_order:  Number(c.sort_order ?? 0),
        is_active:   c.is_active ?? true,
        tenant_id:   c.tenant_id ?? null,
    };
}

// =====================================================================
// CRUD PRODUCTOS
// =====================================================================

export interface ProductInput {
    id?:          string;
    name:        string;
    price:       number;
    category?:   string | null;
    description?: string | null;
    image_url?:  string | null;
    is_active?:  boolean;
    tax_rate?:   number;
}

/** INSERT / UPDATE producto en Supabase */
export async function saveProduct(input: ProductInput): Promise<{ ok: boolean; id?: string; error?: string }> {
    if (!supabase) return { ok: false, error: "Supabase no configurado" };
    const tenantId = await getActiveTenantId();
    const payload: any = {
        name:        input.name,
        price:       Number(input.price),
        category:    input.category ?? null,
        description: input.description ?? null,
        image_url:   input.image_url ?? null,
        is_active:   input.is_active ?? true,
        tax_rate:    Number(input.tax_rate ?? 10),
        tenant_id:   tenantId === ZERO_UUID ? null : tenantId,
    };
    try {
        if (input.id) {
            const { data, error } = await supabase
                .from("products")
                .update(payload)
                .eq("id", input.id)
                .select()
                .single();
            if (error) {
                console.error("[saveProduct] UPDATE error:", error.message);
                return { ok: false, error: error.message };
            }
            return { ok: true, id: (data as any)?.id };
        } else {
            const { data, error } = await supabase
                .from("products")
                .insert([payload])
                .select()
                .single();
            if (error) {
                console.error("[saveProduct] INSERT error:", error.message);
                return { ok: false, error: error.message };
            }
            return { ok: true, id: (data as any)?.id };
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: msg };
    }
}

/** Soft-delete (is_active=false) o hard delete */
export async function deleteProduct(id: string, hard = false): Promise<{ ok: boolean; error?: string }> {
    if (!supabase) return { ok: false, error: "Supabase no configurado" };
    try {
        if (hard) {
            const { error } = await supabase.from("products").delete().eq("id", id);
            if (error) return { ok: false, error: error.message };
        } else {
            const { error } = await supabase.from("products").update({ is_active: false }).eq("id", id);
            if (error) return { ok: false, error: error.message };
        }
        return { ok: true };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: msg };
    }
}

// =====================================================================
// CRUD CATEGORÍAS
// =====================================================================

export interface CategoryInput {
    id?:         string;
    name:        string;
    description?: string | null;
    image_url?:  string | null;
    sort_order?: number;
    is_active?:  boolean;
}

export async function saveCategory(input: CategoryInput): Promise<{ ok: boolean; id?: string; error?: string }> {
    if (!supabase) return { ok: false, error: "Supabase no configurado" };
    const tenantId = await getActiveTenantId();
    const payload: any = {
        name:        input.name,
        description: input.description ?? null,
        image_url:   input.image_url ?? null,
        sort_order:  Number(input.sort_order ?? 0),
        is_active:   input.is_active ?? true,
        tenant_id:   tenantId === ZERO_UUID ? null : tenantId,
    };
    try {
        if (input.id) {
            const { data, error } = await supabase
                .from("categories")
                .update(payload)
                .eq("id", input.id)
                .select()
                .single();
            if (error) return { ok: false, error: error.message };
            return { ok: true, id: (data as any)?.id };
        } else {
            const { data, error } = await supabase
                .from("categories")
                .insert([payload])
                .select()
                .single();
            if (error) return { ok: false, error: error.message };
            return { ok: true, id: (data as any)?.id };
        }
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}

export async function deleteCategory(id: string, hard = false): Promise<{ ok: boolean; error?: string }> {
    if (!supabase) return { ok: false, error: "Supabase no configurado" };
    try {
        if (hard) {
            const { error } = await supabase.from("categories").delete().eq("id", id);
            if (error) return { ok: false, error: error.message };
        } else {
            const { error } = await supabase.from("categories").update({ is_active: false }).eq("id", id);
            if (error) return { ok: false, error: error.message };
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}
