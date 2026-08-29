// =====================================================================
// MOZONA TPV — usePosData: hook de datos del terminal
// =====================================================================
// Fuente de datos en orden de prioridad:
//   1. Si hay tenant Supabase activo → lee de Supabase (modo SaaS)
//   2. Si el servidor LAN local responde → lee de /api/*  (modo Tauri)
//   3. Mock data de ejemplo (modo demo sin backend)
//
// El TPV (este WebView) consume la misma API que los móviles camareros,
// simplificando el modelo y permitiendo que la UI se renderice idéntica
// en escritorio y tablet.
// =====================================================================

import { useEffect, useState, useCallback } from "react";
import {
    isSupabaseConfigured, supabase,
} from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { putCategories, putProducts, putTables, getAllCategories, getAllProducts, getAllTables, getMeta } from "../lib/offlineStorage";
import type {
    Restaurant, Category, Product, RestaurantTable, ConnectionStatus,
} from "../lib/types";

// ---------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------

const LAN_BASE = "http://localhost:7421";            // El TPV habla consigo mismo
let API_KEY = "mock-key";

// ---------------------------------------------------------------------
// Hook principal
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
    source:      "supabase" | "lan" | "mock";
}

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
    const [source,  setSource]  = useState<"supabase" | "lan" | "mock">("mock");

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            // 1) SaaS: Supabase + tenant activo
            if (isSupabaseConfigured && auth.tenant) {
                try {
                    await loadFromSupabase(auth.tenant.id, {
                        setRestaurant, setCategories, setProducts, setTables, setConnection,
                    });
                    setSource("supabase");
                    setError(null);
                    return;
                } catch (e) {
                    // Caer a caché offline
                    console.warn("[usePosData] Supabase falló, usando caché:", e);
                    setError("Sin conexión con Supabase.  Mostrando datos en caché.");
                }
            }
            // 2) LAN: Tauri agent
            try {
                const headers: HeadersInit = { "X-Mozona-Key": API_KEY };
                const [r, m, t] = await Promise.all([
                    fetch(`${LAN_BASE}/api/restaurant`, { headers }).then(x => x.json()),
                    fetch(`${LAN_BASE}/api/menu`,       { headers }).then(x => x.json()),
                    fetch(`${LAN_BASE}/api/tables`,     { headers }).then(x => x.json()),
                ]);
                setRestaurant(r);
                setCategories(m.categories ?? []);
                setProducts(flattenProducts(m.categories ?? []));
                setTables(t.tables ?? []);
                setConnection({ printer: true, network: true, supabase: isSupabaseConfigured });
                setSource("lan");
                setError(null);
                return;
            } catch {
                // 3) Fallback: caché offline (IndexedDB) — contiene el menú real cacheado
            }
            const [cachedCats, cachedProds, cachedTables, cachedRestaurant] = await Promise.all([
                getAllCategories().catch(() => []),
                getAllProducts().catch(() => []),
                getAllTables().catch(() => []),
                getMeta<Restaurant>("mozona.current_restaurant").catch(() => null as Restaurant | null),
            ]);
            const hasCache = cachedProds.length > 0 || cachedCats.length > 0;
            if (hasCache) {
                setRestaurant(cachedRestaurant ?? null);
                setCategories(cachedCats);
                setProducts(cachedProds);
                setTables(cachedTables);
                setConnection({ printer: false, network: false, supabase: isSupabaseConfigured });
                setSource("mock");
                setError(null);
                return;
            }
            // 4) Sin caché: si hay sesión Supabase, mostrar UI vacía + error
            // (NO cargar mock, evitar confusión con "Casa Manolo")
            if (auth.tenant) {
                setRestaurant(cachedRestaurant ?? null);
                setCategories([]);
                setProducts([]);
                setTables([]);
                setConnection({ printer: false, network: false, supabase: true });
                setSource("mock");
                setError("No se pudo conectar con Supabase y no hay caché local.  Reintentando...");
                return;
            }
            // 5) Modo demo local: solo si NO hay sesión
            await mockLoad();
            setRestaurant(MOCK_RESTAURANT);
            setCategories(MOCK_CATEGORIES);
            setProducts(MOCK_PRODUCTS);
            setTables(MOCK_TABLES);
            setConnection({ printer: false, network: false, supabase: isSupabaseConfigured });
            setSource("mock");
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [auth.tenant?.id]);

    useEffect(() => { void refresh(); }, [refresh]);

    return { restaurant, categories, products, tables, connection, loading, error, refresh, source };
}

// ---------------------------------------------------------------------
// Load from Supabase (SaaS multi-tenant)
// ---------------------------------------------------------------------

interface LoadSetters {
    setRestaurant: (r: Restaurant | null) => void;
    setCategories: (c: Category[]) => void;
    setProducts:   (p: Product[]) => void;
    setTables:     (t: RestaurantTable[]) => void;
    setConnection: (c: ConnectionStatus) => void;
}

async function loadFromSupabase(tenantId: string, s: LoadSetters): Promise<void> {
    // 1) Restaurant = tenant
    const { data: tenant, error: tErr } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", tenantId)
        .maybeSingle();
    if (tErr) throw tErr;
    if (tenant) {
        s.setRestaurant({
            id:               tenant.id,
            slug:             tenant.id.slice(0, 8),
            business_name:    tenant.name,
            cif_nif:          tenant.cif_nif      ?? "",
            address:          tenant.address      ?? "",
            phone:            tenant.phone        ?? null,
            primary_color:    "#2563EB",
            ticket_footer_msg: "¡Gracias por su visita!",
            created_at:       tenant.created_at,
        });
    }
    // 2) Categorías
    const { data: cats, error: cErr } = await supabase
        .from("categories")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true });
    if (cErr) throw cErr;
    const categories: Category[] = (cats ?? []).map(c => ({
        id:            c.id,
        restaurant_id: c.tenant_id,
        name:          c.name,
        sort_order:    c.sort_order ?? 0,
    }));
    s.setCategories(categories);
    // 3) Productos
    const { data: prods, error: pErr } = await supabase
        .from("products")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
    if (pErr) throw pErr;
    const products: Product[] = (prods ?? []).map(p => ({
        id:            p.id,
        restaurant_id: p.tenant_id,
        category_id:   p.category_id,
        name:          p.name,
        description:   p.description,
        price:         Number(p.price),
        tax_rate:      Number(p.tax_rate),
        is_available:  p.is_active,
        image_url:     p.image_url ?? null,
    }));
    s.setProducts(products);
    // Persistir en IndexedDB para modo offline (imágenes incluidas)
    try {
        await Promise.all([
            putCategories(categories),
            putProducts(products),
        ]);
    } catch (e) {
        console.warn("[usePosData] cache offline:", e);
    }
    // 4) Mesas
    const { data: tbls, error: tbErr } = await supabase
        .from("dining_tables")
        .select("*")
        .eq("tenant_id", tenantId);
    if (tbErr) throw tbErr;
    const tables: RestaurantTable[] = (tbls ?? []).map(t => ({
        id:            t.id,
        restaurant_id: t.tenant_id,
        zone_id:       null,
        zone:          t.zone,
        table_number:  t.name,
        status:        mapTableStatus(t.status),
    }));
    s.setTables(tables);
    s.setConnection({ printer: false, network: true, supabase: true });
    // Persistir mesas también en IndexedDB
    try {
        await putTables(tables);
    } catch (e) {
        console.warn("[usePosData] cache tables:", e);
    }
}

function mapTableStatus(s: string): "FREE" | "OCCUPIED" | "BILL_REQUESTED" | "RESERVED" | "DIRTY" {
    if (s === "occupied")    return "OCCUPIED";
    if (s === "billed")      return "BILL_REQUESTED";
    if (s === "reserved")    return "RESERVED";
    if (s === "dirty")       return "DIRTY";
    return "FREE";
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function flattenProducts(cats: Array<{ id: string; products: Product[] }>): Product[] {
    return cats.flatMap(c => c.products ?? []);
}

async function mockLoad(): Promise<void> {
    await new Promise(r => setTimeout(r, 300));
}

// ---------------------------------------------------------------------
// Mock data (sólo dev)
// ---------------------------------------------------------------------

const MOCK_RESTAURANT: Restaurant = {
    id: "rest-1", slug: "casa-manolo",
    business_name: "Casa Manolo",
    cif_nif: "B12345678",
    address: "Calle Mayor 12, 28013 Madrid",
    phone: "+34 910 000 000",
    primary_color: "#2563EB",
    ticket_footer_msg: "¡Gracias por su visita!",
    created_at: "2025-01-01T10:00:00Z",
};

const MOCK_CATEGORIES: Category[] = [
    { id: "c-1", restaurant_id: "rest-1", name: "Arroces",   sort_order: 1 },
    { id: "c-2", restaurant_id: "rest-1", name: "Carnes",    sort_order: 2 },
    { id: "c-3", restaurant_id: "rest-1", name: "Pescados",  sort_order: 3 },
    { id: "c-4", restaurant_id: "rest-1", name: "Tapas",     sort_order: 4 },
    { id: "c-5", restaurant_id: "rest-1", name: "Postres",   sort_order: 5 },
    { id: "c-6", restaurant_id: "rest-1", name: "Bebidas",   sort_order: 6 },
    { id: "c-7", restaurant_id: "rest-1", name: "Vinos",     sort_order: 7 },
    { id: "c-8", restaurant_id: "rest-1", name: "Cafés",     sort_order: 8 },
];

const MOCK_PRODUCTS: Product[] = [
    { id: "p-1", restaurant_id: "rest-1", category_id: "c-1", name: "Paella Valenciana",  description: "Arroz, pollo, conejo, judía, garrofón", price: 14.50, tax_rate: 10, is_available: true, image_url: "https://images.unsplash.com/photo-1534080564586-69fc57d6f66d?w=600&auto=format&fit=crop&q=80" },
    { id: "p-2", restaurant_id: "rest-1", category_id: "c-1", name: "Arroz Negro",        description: "Tinta de calamar, alioli",            price: 15.00, tax_rate: 10, is_available: true, image_url: "https://images.unsplash.com/photo-1567604130959-7ea7ab2a7c52?w=600&auto=format&fit=crop&q=80" },
    { id: "p-3", restaurant_id: "rest-1", category_id: "c-1", name: "Arroz del Señorito", description: "Marisco, pescado, caldo",              price: 16.50, tax_rate: 10, is_available: true, image_url: "https://images.unsplash.com/photo-1583032015879-e5022cb87c3b?w=600&auto=format&fit=crop&q=80" },
    { id: "p-4", restaurant_id: "rest-1", category_id: "c-2", name: "Solomillo de Ternera", description: "Pimienta verde, patatas",            price: 19.90, tax_rate: 10, is_available: true, image_url: "https://images.unsplash.com/photo-1546964124-0cce460f38ef?w=600&auto=format&fit=crop&q=80" },
    { id: "p-5", restaurant_id: "rest-1", category_id: "c-2", name: "Chuletón de Buey",     description: "1kg, maduración 30 días",            price: 38.00, tax_rate: 10, is_available: true, image_url: "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80" },
    { id: "p-6", restaurant_id: "rest-1", category_id: "c-2", name: "Presa Ibérica",       description: "Parrilla, sal Maldon",               price: 16.50, tax_rate: 10, is_available: true, image_url: "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=600&auto=format&fit=crop&q=80" },
    { id: "p-7", restaurant_id: "rest-1", category_id: "c-3", name: "Lubina a la Espalda", description: "A la espalda, refrito",              price: 18.50, tax_rate: 10, is_available: true, image_url: "https://images.unsplash.com/photo-1519708227418-c8fd939a50ef?w=600&auto=format&fit=crop&q=80" },
    { id: "p-8", restaurant_id: "rest-1", category_id: "c-3", name: "Bacalao al Pil-Pil",  description: "Pil-pil tradicional",                 price: 17.00, tax_rate: 10, is_available: true, image_url: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=600&auto=format&fit=crop&q=80" },
    { id: "p-9",  restaurant_id: "rest-1", category_id: "c-4", name: "Patatas Bravas",        price: 6.50,  tax_rate: 10, is_available: true, description: null, image_url: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80" },
    { id: "p-10", restaurant_id: "rest-1", category_id: "c-4", name: "Croquetas de Jamón",    price: 7.50,  tax_rate: 10, is_available: true, description: null, image_url: "https://images.unsplash.com/photo-1626200419199-391ae4a45b97?w=600&auto=format&fit=crop&q=80" },
    { id: "p-11", restaurant_id: "rest-1", category_id: "c-4", name: "Tortilla Española",     price: 6.00,  tax_rate: 10, is_available: true, description: null, image_url: "https://images.unsplash.com/photo-1585481161463-1b2cb3b48e4c?w=600&auto=format&fit=crop&q=80" },
    { id: "p-12", restaurant_id: "rest-1", category_id: "c-4", name: "Gazpacho Andaluz",      price: 5.50,  tax_rate: 10, is_available: true, description: null, image_url: "https://images.unsplash.com/photo-1602080858428-57174f9431cf?w=600&auto=format&fit=crop&q=80" },
    { id: "p-13", restaurant_id: "rest-1", category_id: "c-5", name: "Tarta de Queso",        price: 5.50, tax_rate: 10, is_available: true, description: null, image_url: "https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?w=600&auto=format&fit=crop&q=80" },
    { id: "p-14", restaurant_id: "rest-1", category_id: "c-5", name: "Coulant de Chocolate",  price: 6.00, tax_rate: 10, is_available: true, description: null, image_url: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80" },
    { id: "p-15", restaurant_id: "rest-1", category_id: "c-5", name: "Helado Artesano",       price: 4.50, tax_rate: 10, is_available: true, description: null, image_url: "https://images.unsplash.com/photo-1560008581-09826d1de69e?w=600&auto=format&fit=crop&q=80" },
    { id: "p-16", restaurant_id: "rest-1", category_id: "c-6", name: "Cerveza Mahou",         price: 2.50, tax_rate: 21, is_available: true, description: null, image_url: "https://images.unsplash.com/photo-1608270586620-248524c67de1?w=600&auto=format&fit=crop&q=80" },
    { id: "p-17", restaurant_id: "rest-1", category_id: "c-6", name: "Cerveza 1906",         price: 3.20, tax_rate: 21, is_available: true, description: null, image_url: "https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=600&auto=format&fit=crop&q=80" },
    { id: "p-18", restaurant_id: "rest-1", category_id: "c-6", name: "Agua Mineral",          price: 1.80, tax_rate: 10, is_available: true, description: null, image_url: "https://images.unsplash.com/photo-1564419320461-6870880221ad?w=600&auto=format&fit=crop&q=80" },
    { id: "p-19", restaurant_id: "rest-1", category_id: "c-6", name: "Refresco",              price: 2.50, tax_rate: 10, is_available: true, description: null, image_url: "https://images.unsplash.com/photo-1581636625402-29b2a704ef20?w=600&auto=format&fit=crop&q=80" },
    { id: "p-20", restaurant_id: "rest-1", category_id: "c-7", name: "Vino Tinto (copa)",     price: 3.50, tax_rate: 21, is_available: true, description: null, image_url: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600&auto=format&fit=crop&q=80" },
    { id: "p-21", restaurant_id: "rest-1", category_id: "c-7", name: "Vino Blanco (copa)",    price: 3.50, tax_rate: 21, is_available: true, description: null, image_url: "https://images.unsplash.com/photo-1547595628-c61a29f496f0?w=600&auto=format&fit=crop&q=80" },
    { id: "p-22", restaurant_id: "rest-1", category_id: "c-8", name: "Café Solo",              price: 1.50, tax_rate: 10, is_available: true, description: null, image_url: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&auto=format&fit=crop&q=80" },
    { id: "p-23", restaurant_id: "rest-1", category_id: "c-8", name: "Café con Leche",         price: 1.80, tax_rate: 10, is_available: true, description: null, image_url: "https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=600&auto=format&fit=crop&q=80" },
    { id: "p-24", restaurant_id: "rest-1", category_id: "c-8", name: "Cortado",                price: 1.60, tax_rate: 10, is_available: true, description: null, image_url: "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=600&auto=format&fit=crop&q=80" },
];

const MOCK_TABLES: RestaurantTable[] = [
    { id: "t-1", restaurant_id: "rest-1", zone_id: null, zone: "Sala",   table_number: "1",  status: "FREE" },
    { id: "t-2", restaurant_id: "rest-1", zone_id: null, zone: "Sala",   table_number: "2",  status: "OCCUPIED" },
    { id: "t-3", restaurant_id: "rest-1", zone_id: null, zone: "Sala",   table_number: "3",  status: "FREE" },
    { id: "t-4", restaurant_id: "rest-1", zone_id: null, zone: "Sala",   table_number: "4",  status: "DIRTY" },
    { id: "t-5", restaurant_id: "rest-1", zone_id: null, zone: "Terraza", table_number: "T-1", status: "FREE" },
    { id: "t-6", restaurant_id: "rest-1", zone_id: null, zone: "Terraza", table_number: "T-2", status: "OCCUPIED" },
    { id: "t-7", restaurant_id: "rest-1", zone_id: null, zone: "Barra",  table_number: "B-1", status: "BILL_REQUESTED" },
    { id: "t-8", restaurant_id: "rest-1", zone_id: null, zone: "Barra",  table_number: "B-2", status: "FREE" },
];
