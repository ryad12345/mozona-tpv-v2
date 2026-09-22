// =====================================================================
// MOZONA TPV — secureRpc (v4.0.7-definer-rpc)
// =====================================================================
// Cliente para funciones SECURITY DEFINER de Supabase.
// - NO requiere Edge Function desplegada
// - NO expone service_role_key al cliente
// - Validacion de tenant_id dentro de cada funcion (PostgreSQL)
// - Auditoria automatica via edge_function_logs (trigger)
// =====================================================================

import { supabase, isSupabaseConfigured } from "./supabase";
import { getCurrentTenantId } from "./bidirectionalSync";

// ═══════════════════════════════════════════════════════════════════════
// RPC CLIENT
// ═══════════════════════════════════════════════════════════════════════

interface RpcResult<T = any> {
    ok: boolean;
    data?: T;
    error?: string;
}

async function callRpc<T = any>(functionName: string, params: Record<string, any>): Promise<RpcResult<T>> {
    if (!supabase) {
        return { ok: false, error: "Supabase no configurado" };
    }
    try {
        const { data, error } = await supabase.rpc(functionName, params);
        if (error) {
            console.warn(`[secureRpc] ${functionName} error:`, error.message);
            return { ok: false, error: error.message };
        }
        // Las funciones SECURITY DEFINER devuelven JSONB
        const result = data as any;
        if (result && typeof result === "object" && "ok" in result) {
            return result as RpcResult<T>;
        }
        return { ok: true, data: result };
    } catch (e: any) {
        console.warn(`[secureRpc] ${functionName} exception:`, e?.message);
        return { ok: false, error: e?.message || "Error desconocido" };
    }
}

// ═══════════════════════════════════════════════════════════════════════
// TENANT SETTINGS
// ═══════════════════════════════════════════════════════════════════════

export async function rpcSaveTenantSettings(settings: Record<string, any>): Promise<RpcResult> {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) return { ok: false, error: "Sin tenant activo" };
    return callRpc("rpc_save_tenant_settings", {
        p_tenant_id: tenantId,
        p_settings: settings,
    });
}

export async function rpcLoadTenantSettings(): Promise<RpcResult<any>> {
    // SELECT via supabase normal (funciona con anon)
    if (!supabase) return { ok: false, error: "Supabase no configurado" };
    const tenantId = await getCurrentTenantId();
    if (!tenantId) return { ok: false, error: "Sin tenant activo" };

    try {
        const { data, error } = await supabase
            .from("tenant_settings")
            .select("*")
            .eq("tenant_id", tenantId)
            .maybeSingle();
        if (error) {
            // Si falla por RLS (anon), intentar via Edge Function o RPC
            return { ok: false, error: error.message };
        }
        return { ok: true, data };
    } catch (e: any) {
        return { ok: false, error: e?.message };
    }
}

// ═══════════════════════════════════════════════════════════════════════
// TENANT CORE (para onboarding wizard)
// ═══════════════════════════════════════════════════════════════════════

export async function rpcSaveTenantFull(patch: Record<string, any>): Promise<RpcResult> {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) return { ok: false, error: "Sin tenant activo" };
    if (!supabase) return { ok: false, error: "Supabase no configurado" };
    try {
        const { data, error } = await supabase.rpc("rpc_save_tenant_full", {
            p_tenant_id: tenantId,
            p_patch: patch,
        });
        if (error) return { ok: false, error: error.message };
        const result = data as any;
        if (result && "ok" in result) return result as RpcResult;
        return { ok: true, data: result };
    } catch (e: any) {
        return { ok: false, error: e?.message };
    }
}

// ═══════════════════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════════════════

export async function rpcSaveProduct(product: Record<string, any>): Promise<RpcResult> {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) return { ok: false, error: "Sin tenant activo" };
    return callRpc("rpc_save_product", {
        p_tenant_id: tenantId,
        p_product: product,
    });
}

export async function rpcDeleteProduct(productId: string): Promise<RpcResult> {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) return { ok: false, error: "Sin tenant activo" };
    return callRpc("rpc_delete_product", {
        p_tenant_id: tenantId,
        p_product_id: productId,
    });
}

// ═══════════════════════════════════════════════════════════════════════
// TABLES (mesas)
// ═══════════════════════════════════════════════════════════════════════

export async function rpcSaveTable(table: Record<string, any>): Promise<RpcResult> {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) return { ok: false, error: "Sin tenant activo" };
    if (!supabase) return { ok: false, error: "Supabase no configurado" };
    try {
        const { data, error } = await supabase.rpc("rpc_save_table", {
            p_tenant_id: tenantId,
            p_table: table,
        });
        if (error) return { ok: false, error: error.message };
        const result = data as any;
        if (result && "ok" in result) return result as RpcResult;
        return { ok: true, data: result };
    } catch (e: any) {
        return { ok: false, error: e?.message };
    }
}

export async function rpcDeleteTable(tableId: string): Promise<RpcResult> {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) return { ok: false, error: "Sin tenant activo" };
    if (!supabase) return { ok: false, error: "Supabase no configurado" };
    try {
        const { data, error } = await supabase.rpc("rpc_delete_table", {
            p_tenant_id: tenantId,
            p_table_id: tableId,
        });
        if (error) return { ok: false, error: error.message };
        const result = data as any;
        if (result && "ok" in result) return result as RpcResult;
        return { ok: true, data: result };
    } catch (e: any) {
        return { ok: false, error: e?.message };
    }
}

// ═══════════════════════════════════════════════════════════════════════
// AI STUDIO
// ═══════════════════════════════════════════════════════════════════════

export async function rpcAiTopProducts(limit = 5, days = 30): Promise<RpcResult<any[]>> {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) return { ok: false, error: "Sin tenant activo" };
    return callRpc("rpc_ai_top_products", {
        p_tenant_id: tenantId,
        p_limit: limit,
        p_days: days,
    });
}

export async function rpcAiSalesSummary(days = 7): Promise<RpcResult<any>> {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) return { ok: false, error: "Sin tenant activo" };
    return callRpc("rpc_ai_sales_summary", {
        p_tenant_id: tenantId,
        p_days: days,
    });
}

export async function rpcAiLowStock(): Promise<RpcResult<any[]>> {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) return { ok: false, error: "Sin tenant activo" };
    return callRpc("rpc_ai_low_stock", {
        p_tenant_id: tenantId,
    });
}

export async function rpcAiPricingSuggestions(): Promise<RpcResult<any[]>> {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) return { ok: false, error: "Sin tenant activo" };
    return callRpc("rpc_ai_pricing_suggestions", {
        p_tenant_id: tenantId,
    });
}

export async function rpcAiProfitInsights(days = 30): Promise<RpcResult<any>> {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) return { ok: false, error: "Sin tenant activo" };
    return callRpc("rpc_ai_profit_insights", {
        p_tenant_id: tenantId,
        p_days: days,
    });
}

export async function rpcAiSaveInvoice(invoice: Record<string, any>): Promise<RpcResult> {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) return { ok: false, error: "Sin tenant activo" };
    return callRpc("rpc_ai_save_invoice", {
        p_tenant_id: tenantId,
        p_invoice: invoice,
    });
}

export async function rpcAiSaveVoiceOrder(order: Record<string, any>): Promise<RpcResult> {
    const tenantId = await getCurrentTenantId();
    if (!tenantId) return { ok: false, error: "Sin tenant activo" };
    return callRpc("rpc_ai_save_voice_order", {
        p_tenant_id: tenantId,
        p_order: order,
    });
}

// ═══════════════════════════════════════════════════════════════════════
// EMAIL VERIFICATION
// ═══════════════════════════════════════════════════════════════════════

export interface EmailCodeResult {
    ok: boolean;
    id?: string;
    expires_at?: string;
    error?: string;
    // ★ v4.0.7-no-mockups: 'code' ELIMINADO del response.
    //   El codigo solo se envia al email real, nunca al cliente.
}

export async function rpcGenerateEmailCode(
    email: string,
    purpose: "signup" | "login" | "reset" = "signup"
): Promise<EmailCodeResult> {
    if (!supabase) return { ok: false, error: "Supabase no configurado" };
    try {
        const { data, error } = await supabase.rpc("rpc_generate_email_code", {
            p_email: email,
            p_purpose: purpose,
        });
        if (error) return { ok: false, error: error.message };
        return data as EmailCodeResult;
    } catch (e: any) {
        return { ok: false, error: e?.message };
    }
}

export interface VerifyResult {
    ok: boolean;
    verified?: boolean;
    error?: string;
}

export async function rpcVerifyEmailCode(
    email: string,
    code: string,
    purpose: "signup" | "login" | "reset" = "signup"
): Promise<VerifyResult> {
    if (!supabase) return { ok: false, error: "Supabase no configurado" };
    try {
        const { data, error } = await supabase.rpc("rpc_verify_email_code", {
            p_email: email,
            p_code: code,
            p_purpose: purpose,
        });
        if (error) return { ok: false, error: error.message };
        return data as VerifyResult;
    } catch (e: any) {
        return { ok: false, error: e?.message };
    }
}
