// =====================================================================
// MOZONA TPV — catalog: conexión 100% DIRECTA a Supabase
// =====================================================================
// Sin IndexedDB, sin mocks, sin fallbacks estáticos.
// Lee en vivo de public.products y public.categories.
// =====================================================================

import { supabase } from "./supabase";
import { resolveRealTenantId } from "./waiters";

const FALLBACK_TENANT_ID = "58a8e6f5-3172-409c-8aa5-ae02be0b7e76";

export interface PosProduct {
    id:            string;
    name:          string;
    description:   string | null;
    price:         number;
    category_id:   string | null;
    category:      string | null;
    category_name: string | null;
    image_url:     string | null;
    is_active:     boolean;
    tenant_id:     string | null;
    tax_rate:      number;
}

export interface PosCategory {
    id:          string;
    name:        string;
    description: string | null;
    image_url:   string | null;
    sort_order:  number;
    is_active:   boolean;
    tenant_id:   string | null;
}

// =====================================================================
// CATÁLOGO DE PRODUCTOS
// =====================================================================

/**
 * Lee el catálogo en vivo desde Supabase. Sin IndexedDB ni fallbacks estáticos.
 *
 * @param tenantId Si se proporciona, filtra por tenant. Si no, lee TODOS los
 *                 productos activos de la BD.
 */
export async function fetchCatalog(tenantId?: string | null): Promise<PosProduct[]> {
    if (!supabase) {
        console.error("[fetchCatalog] ❌ Supabase no configurado");
        return [];
    }
    console.log("[fetchCatalog] 📡 Consultando Supabase EN VIVO... tenantId=", tenantId);

    // ★ v3.4.9: SIEMPRE filtrar por tenant_id (RLS se encarga de validar
    //   que el usuario tiene acceso al tenant).
    //   ELIMINADO el fallback que leía TODOS los productos de TODOS los tenants
    //   (cross-tenant contamination).
    const useTenant = tenantId && tenantId !== "vip-bypass" && tenantId !== "null" && tenantId !== "";
    if (!useTenant) {
        console.warn("[fetchCatalog] ⚠️ Sin tenant_id, no se puede consultar productos");
        return [];
    }

    const { data, error } = await supabase
        .from("products")
        .select("id, name, description, price, category_id, category, category_name, image_url, is_active, tenant_id, tax_rate")
        .eq("is_active", true)
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });

    if (error) {
        console.error("[fetchCatalog] ❌ Error Supabase:", error.code, error.message);
        return [];
    }

    console.log(`[fetchCatalog] ✓ Cargados ${data?.length ?? 0} productos del tenant ${tenantId}`);
    return (data ?? []).map(normalizeProduct);
}

function normalizeProduct(p: any): PosProduct {
    return {
        id:            p.id,
        name:          p.name ?? "—",
        description:   p.description ?? null,
        price:         Number(p.price ?? 0),
        category_id:   p.category_id ?? null,
        category:      p.category ?? p.category_name ?? null,
        category_name: p.category_name ?? p.category ?? null,
        image_url:     p.image_url ?? p.image ?? null,
        is_active:     p.is_active ?? true,
        tenant_id:     p.tenant_id ?? null,
        tax_rate:      Number(p.tax_rate ?? p.vat_rate ?? 10),
    };
}

// =====================================================================
// CATEGORÍAS
// =====================================================================

/**
 * Lee las categorías en vivo desde Supabase.
 */
export async function fetchCategories(tenantId?: string | null): Promise<PosCategory[]> {
    if (!supabase) {
        console.error("[fetchCategories] ❌ Supabase no configurado");
        return [];
    }
    console.log("[fetchCategories] 📡 Consultando Supabase EN VIVO... tenantId=", tenantId);

    // ★ v3.4.9: SIEMPRE filtrar por tenant_id (RLS valida acceso).
    //   ELIMINADO el fallback que leía TODAS las categorías.
    const useTenant = tenantId && tenantId !== "vip-bypass" && tenantId !== "null" && tenantId !== "";
    if (!useTenant) {
        console.warn("[fetchCategories] ⚠️ Sin tenant_id");
        return [];
    }

    const { data, error } = await supabase
        .from("categories")
        .select("id, name, sort_order, tenant_id")
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true });

    if (error) {
        console.error("[fetchCategories] ❌ Error:", error.message);
        return [];
    }

    // Ordenar por sort_order
    (data ?? []).sort((a: any, b: any) => {
        const sa = Number(a.sort_order ?? 0);
        const sb = Number(b.sort_order ?? 0);
        if (sa !== sb) return sa - sb;
        return String(a.name).localeCompare(String(b.name));
    });

    console.log(`[fetchCategories] ✓ Cargadas ${data?.length ?? 0} categorías del tenant ${tenantId}`);
    return (data ?? []).map(normalizeCategory);
}

function normalizeCategory(c: any): PosCategory {
    return {
        id:          c.id,
        name:        c.name ?? "—",
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
    category_id?: string | null;
    description?: string | null;
    image_url?:  string | null;
    is_active?:  boolean;
    tax_rate?:   number;
}

export async function saveProduct(input: ProductInput): Promise<{ ok: boolean; id?: string; error?: string }> {
    if (!supabase) return { ok: false, error: "Supabase no configurado" };
    // ★ v1.9.11: payload MINIMO solo con columnas que EXISTEN
    //   La tabla real NO tiene: created_at, updated_at, description, image_url, tax_rate
    const realTenantId = (await resolveRealTenantId(null)) || FALLBACK_TENANT_ID;
    const payload: any = {
        name:         String(input.name).trim(),
        price:        Number(input.price),
        category_id:  input.category_id ?? null,
        category:     input.category ?? null,
        is_active:    input.is_active ?? true,
        tenant_id:    realTenantId,
    };
    console.log("[saveProduct] payload:", payload);
    try {
        if (input.id) {
            const { data, error } = await supabase
                .from("products")
                .update(payload)
                .eq("id", input.id)
                .select();
            if (error) {
                console.error("[saveProduct] UPDATE error:", error.code, error.message);
                return { ok: false, error: error.message };
            }
            return { ok: true, id: (data as any)?.[0]?.id };
        } else {
            const { data, error } = await supabase
                .from("products")
                .insert([payload])
                .select();
            if (error) {
                console.error("[saveProduct] INSERT error:", error.code, error.message);
                return { ok: false, error: error.message };
            }
            return { ok: true, id: (data as any)?.[0]?.id };
        }
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}

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
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
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
    // ★ v1.9.4: resolver tenant_id SIEMPRE (es NOT NULL en la BD)
    const realTenantId = (await resolveRealTenantId(null)) || FALLBACK_TENANT_ID;
    // ★ v1.9.2: 'description' e 'is_active' no existen en tabla real
    const payload: any = {
        name:        input.name,
        sort_order:  Number(input.sort_order ?? 0),
        tenant_id:   realTenantId,
    };
    // Solo añadir image_url si viene definido
    if (input.image_url) {
        payload.image_url = input.image_url;
    }
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

// =====================================================================
// COMPATIBILIDAD (tipo antiguo)
// =====================================================================

/** @deprecated usar PosProduct */
export type CatalogProduct = PosProduct;
/** @deprecated usar fetchCatalog */
export const fetchCatalogLegacy = fetchCatalog;
