// =====================================================================
// MOZONA TPV — chatLeads.ts
// =====================================================================
// Capa de persistencia para el AI Assistant.
// Diseñada con interfaz estable para que un día se pueda migrar
// a Firebase sin tocar el componente del modal.
//
// Hoy: Supabase (tabla leads_onboarding)
// Futuro: Firebase Firestore (mismo schema, distinto transport)
// =====================================================================

import { supabase, isSupabaseConfigured } from "./supabase";

export type LeadStatus =
    | "lead_nuevo"
    | "trial_activo"
    | "pendiente_pago"
    | "pago_completado"
    | "descartado";

export type PlanCode = "basic" | "professional" | "premium" | "trial";

export interface ChatMessage {
    role:    "user" | "assistant" | "system";
    content: string;
    ts:      number;             // epoch ms
}

export interface LeadRecord {
    id?:              string;
    user_email?:      string;
    user_id?:         string;
    restaurant_name?: string;
    selected_plan?:   PlanCode;
    trial_ends_at?:   string;      // ISO
    status:           LeadStatus;
    chat_history:     ChatMessage[];
    source?:          "paywall" | "landing" | "onboarding" | "pricing" | "settings";
    metadata?:        Record<string, any>;
}

/** Crea o actualiza un lead. Devuelve { ok, id, error }. */
export async function saveLead(lead: LeadRecord): Promise<{ ok: boolean; id?: string; error?: string }> {
    if (!isSupabaseConfigured) {
        return { ok: false, error: "Supabase no configurado" };
    }
    try {
        const payload: any = {
            user_email:      lead.user_email      ?? null,
            user_id:         lead.user_id         ?? null,
            restaurant_name: lead.restaurant_name ?? null,
            selected_plan:   lead.selected_plan   ?? null,
            trial_ends_at:   lead.trial_ends_at   ?? null,
            status:          lead.status,
            chat_history:    lead.chat_history,
            source:          lead.source          ?? null,
            metadata:        lead.metadata        ?? {},
        };
        if (lead.id) {
            // update por id
            const { data, error } = await supabase
                .from("leads_onboarding")
                .update(payload)
                .eq("id", lead.id)
                .select("id")
                .maybeSingle();
            if (error) return { ok: false, error: error.message };
            return { ok: true, id: (data as any)?.id ?? lead.id };
        } else {
            // insert
            const { data, error } = await supabase
                .from("leads_onboarding")
                .insert(payload)
                .select("id")
                .maybeSingle();
            if (error) return { ok: false, error: error.message };
            return { ok: true, id: (data as any)?.id };
        }
    } catch (e: any) {
        return { ok: false, error: e?.message ?? "Error inesperado" };
    }
}

/** Añade un mensaje al historial de un lead y actualiza campos. */
export async function appendMessage(
    leadId: string,
    msg: ChatMessage,
    patch?: Partial<LeadRecord>,
): Promise<{ ok: boolean; error?: string }> {
    if (!isSupabaseConfigured) return { ok: false, error: "Supabase no configurado" };
    try {
        // Leemos el chat_history actual
        const { data: cur, error: readErr } = await supabase
            .from("leads_onboarding")
            .select("chat_history")
            .eq("id", leadId)
            .maybeSingle();
        if (readErr) return { ok: false, error: readErr.message };
        const curHistory: ChatMessage[] = Array.isArray((cur as any)?.chat_history)
            ? (cur as any).chat_history
            : [];
        const newHistory = [...curHistory, msg];
        const updatePayload: any = { chat_history: newHistory, ...patch };
        const { error } = await supabase
            .from("leads_onboarding")
            .update(updatePayload)
            .eq("id", leadId);
        if (error) return { ok: false, error: error.message };
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? "Error inesperado" };
    }
}
