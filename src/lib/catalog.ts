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
        category: p.category ?? null,
        image_url: p.image_url ?? null,
        is_active: p.is_active ?? true,
        tax_rate: Number(p.tax_rate ?? 10),
        tenant_id: p.tenant_id ?? null,
    };
}
