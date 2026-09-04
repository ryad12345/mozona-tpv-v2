// =====================================================================
// MOZONA TPV — chatLeads.ts
// =====================================================================
// Capa de persistencia para el AI Assistant.
//
// ORDEN DE ESCRITURA (v1.9.35):
//   1) Firebase Firestore  (colección leads_onboarding)  ← PRIMARIO
//   2) Supabase            (tabla leads_onboarding)      ← FALLBACK si Firebase no está
//   3) Webhook email      (Resend / Zapier / n8n)        ← NOTIFICACIÓN
//
// Si Firebase está configurado:
//   - Se intenta Firebase PRIMERO
//   - Si Firebase falla, se cae a Supabase
//   - En paralelo, se envía el webhook de email
//
// Si Firebase NO está configurado:
//   - Se usa Supabase directamente
//   - Webhook opcional
// =====================================================================

import { addDoc, collection, serverTimestamp, updateDoc, doc, getDoc } from "firebase/firestore";
import { db as firestore, FIREBASE_CONFIGURED, notifyNewLead } from "./firebase";
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
    ts:      number;
}

export interface LeadRecord {
    id?:              string;
    user_email?:      string;
    user_id?:         string;
    restaurant_name?: string;
    selected_plan?:   PlanCode;
    trial_ends_at?:   string;
    status:           LeadStatus;
    chat_history:     ChatMessage[];
    source?:          "paywall" | "landing" | "onboarding" | "pricing" | "settings";
    metadata?:        Record<string, any>;
}

export interface SaveResult {
    ok:     boolean;
    id?:    string;
    error?: string;
    /** Backend que se usó: "firebase" | "supabase" | "none" */
    backend: "firebase" | "supabase" | "none";
}

const COLLECTION = "leads_onboarding";

/** ★ v1.9.36: nombre del asistente embebido en el documento
 *  para auditoría de qué agente hizo la captura. */
export const ASSISTANT_NAME = "Riyad";

/** ★★★ FUNCIÓN PRINCIPAL ★★★
 *  Crea o actualiza un lead.
 *  Intenta Firebase primero; si falla o no está configurado, cae a Supabase.
 *  Envía webhook de notificación en paralelo. */
export async function saveLead(lead: LeadRecord): Promise<SaveResult> {
    const payload = {
        user_email:      lead.user_email      ?? null,
        user_id:         lead.user_id         ?? null,
        restaurant_name: lead.restaurant_name ?? null,
        selected_plan:   lead.selected_plan   ?? null,
        trial_ends_at:   lead.trial_ends_at   ?? null,
        status:          lead.status,
        chat_history:    lead.chat_history,
        source:          lead.source          ?? null,
        assistant_name:  ASSISTANT_NAME,                 // ★ v1.9.36
        business_type:   (lead.metadata as any)?.business_type ?? null,  // ★ v1.9.36
        metadata:        lead.metadata        ?? {},
    };

    // 1) Intentar Firebase PRIMARIO
    if (FIREBASE_CONFIGURED && firestore) {
        try {
            let id = lead.id;
            if (id) {
                // update
                await updateDoc(doc(firestore, COLLECTION, id), {
                    ...payload,
                    updated_at: serverTimestamp(),
                });
            } else {
                // create
                const ref = await addDoc(collection(firestore, COLLECTION), {
                    ...payload,
                    created_at: serverTimestamp(),
                    updated_at: serverTimestamp(),
                });
                id = ref.id;
            }
            // Webhook en paralelo (no bloqueante)
            void notifyNewLead({
                leadId:         id ?? "",
                restaurantName: lead.restaurant_name ?? "",
                userEmail:      lead.user_email      ?? "",
                selectedPlan:   lead.selected_plan   ?? "",
                trialEndsAt:    lead.trial_ends_at   ?? "",
                source:         lead.source          ?? "",
            });
            return { ok: true, id, backend: "firebase" };
        } catch (e: any) {
            console.warn("[chatLeads] Firebase falló, intentando Supabase:", e?.message ?? e);
            // Continúa al fallback
        }
    }

    // 2) Fallback: Supabase
    if (isSupabaseConfigured) {
        try {
            const insertPayload: any = { ...payload };
            let id: string | undefined;
            if (lead.id) {
                const { data, error } = await supabase
                    .from(COLLECTION)
                    .update(insertPayload)
                    .eq("id", lead.id)
                    .select("id")
                    .maybeSingle();
                if (error) return { ok: false, error: error.message, backend: "supabase" };
                id = (data as any)?.id;
            } else {
                const { data, error } = await supabase
                    .from(COLLECTION)
                    .insert(insertPayload)
                    .select("id")
                    .maybeSingle();
                if (error) return { ok: false, error: error.message, backend: "supabase" };
                id = (data as any)?.id;
            }
            // Webhook
            void notifyNewLead({
                leadId:         id ?? "",
                restaurantName: lead.restaurant_name ?? "",
                userEmail:      lead.user_email      ?? "",
                selectedPlan:   lead.selected_plan   ?? "",
                trialEndsAt:    lead.trial_ends_at   ?? "",
                source:         lead.source          ?? "",
            });
            return { ok: true, id, backend: "supabase" };
        } catch (e: any) {
            return { ok: false, error: e?.message ?? "Error", backend: "supabase" };
        }
    }

    return { ok: false, error: "Ni Firebase ni Supabase configurados", backend: "none" };
}

/** Añade un mensaje al historial de un lead. */
export async function appendMessage(
    leadId: string,
    msg: ChatMessage,
    patch?: Partial<LeadRecord>,
): Promise<{ ok: boolean; error?: string }> {
    // 1) Firebase
    if (FIREBASE_CONFIGURED && firestore) {
        try {
            const ref = doc(firestore, COLLECTION, leadId);
            const snap = await getDoc(ref);
            if (!snap.exists()) return { ok: false, error: "Lead no existe en Firebase" };
            const cur = snap.data();
            const curHistory: ChatMessage[] = Array.isArray(cur.chat_history) ? cur.chat_history : [];
            const update: any = { chat_history: [...curHistory, msg], updated_at: serverTimestamp() };
            if (patch) {
                if (patch.status) update.status = patch.status;
                if (patch.selected_plan) update.selected_plan = patch.selected_plan;
                if (patch.trial_ends_at) update.trial_ends_at = patch.trial_ends_at;
                if (patch.user_email) update.user_email = patch.user_email;
                if (patch.restaurant_name) update.restaurant_name = patch.restaurant_name;
            }
            await updateDoc(ref, update);
            return { ok: true };
        } catch (e: any) {
            console.warn("[chatLeads] append Firebase falló, intentando Supabase:", e?.message ?? e);
        }
    }

    // 2) Supabase
    if (isSupabaseConfigured) {
        try {
            const { data: cur, error: readErr } = await supabase
                .from(COLLECTION)
                .select("chat_history")
                .eq("id", leadId)
                .maybeSingle();
            if (readErr) return { ok: false, error: readErr.message };
            const curHistory: ChatMessage[] = Array.isArray((cur as any)?.chat_history)
                ? (cur as any).chat_history : [];
            const newHistory = [...curHistory, msg];
            const updatePayload: any = { chat_history: newHistory, ...patch };
            const { error } = await supabase
                .from(COLLECTION)
                .update(updatePayload)
                .eq("id", leadId);
            if (error) return { ok: false, error: error.message };
            return { ok: true };
        } catch (e: any) {
            return { ok: false, error: e?.message ?? "Error" };
        }
    }
    return { ok: false, error: "Ni Firebase ni Supabase" };
}
