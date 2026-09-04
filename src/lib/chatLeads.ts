// =====================================================================
// MOZONA TPV — chatLeads.ts
// =====================================================================
// Capa de persistencia EXCLUSIVA en Firebase Firestore para el AI
// Assistant "Riyad".
//
// v1.9.37: Eliminamos el fallback a Supabase. Los leads se guardan
//          única y exclusivamente en la colección `leads_onboarding`
//          de Firestore.
//
//  - Si Firebase NO está configurado -> error claro al usuario
//  - Si Firebase falla -> error y el modal lo muestra
//  - Sin Supabase, sin tablas duplicadas
//  - Webhook email se dispara en paralelo (no bloqueante)
//
// Esquema del documento (Firestore `leads_onboarding`):
//   {
//     restaurant_name: string,
//     user_email:      string,
//     selected_plan:   "basic" | "professional" | "premium" | "trial",
//     business_type:   "restaurante" | "bar" | "cafeteria" | "otro",
//     trial_ends_at:   ISO timestamp,
//     source:          "paywall" | "landing" | "onboarding" | "pricing" | "settings",
//     status:          "lead_nuevo" | "trial_activo" | "pendiente_pago" | "pago_completado" | "descartado",
//     assistant_name:  "Riyad",
//     chat_history:    ChatMessage[],
//     metadata:        object,
//     created_at:      <serverTimestamp>,
//     updated_at:      <serverTimestamp>
//   }
// =====================================================================

import { addDoc, collection, serverTimestamp, updateDoc, doc, getDoc } from "firebase/firestore";
import { db as firestore, FIREBASE_CONFIGURED, notifyNewLead } from "./firebase";

export type LeadStatus =
    | "lead_nuevo"
    | "trial_activo"
    | "pendiente_pago"
    | "pago_completado"
    | "descartado";

export type PlanCode = "basic" | "professional" | "premium" | "trial";

/** ★ v1.9.38 + v1.9.50: union único para todos los puntos de apertura del modal */
export type AssistantSource =
    | "paywall" | "landing" | "onboarding" | "pricing" | "settings" | "floating";

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
    source?:          AssistantSource;
    metadata?:        Record<string, any>;
}

export interface SaveResult {
    ok:     boolean;
    id?:    string;
    error?: string;
    /** "firebase" si OK, "none" si Firebase no está configurado */
    backend: "firebase" | "none";
}

const COLLECTION = "leads_onboarding";

/** ★ Nombre del asistente embebido en cada documento (auditoría) */
export const ASSISTANT_NAME = "Riyad";

/** Helper: payload canónico para Firestore */
function buildPayload(lead: LeadRecord) {
    return {
        user_email:      lead.user_email      ?? null,
        user_id:         lead.user_id         ?? null,
        restaurant_name: lead.restaurant_name ?? null,
        selected_plan:   lead.selected_plan   ?? null,
        trial_ends_at:   lead.trial_ends_at   ?? null,
        status:          lead.status,
        chat_history:    lead.chat_history,
        source:          lead.source          ?? null,
        assistant_name:  ASSISTANT_NAME,
        business_type:   (lead.metadata as any)?.business_type ?? null,
        metadata:        lead.metadata        ?? {},
    };
}

/** ★★★ FUNCIÓN PRINCIPAL ★★★
 *  Crea o actualiza un lead EXCLUSIVAMENTE en Firebase Firestore.
 *  Sin fallback a Supabase. */
export async function saveLead(lead: LeadRecord): Promise<SaveResult> {
    if (!FIREBASE_CONFIGURED || !firestore) {
        const msg = "Firebase no está configurado. Define VITE_FIREBASE_* en Vercel.";
        console.error("[chatLeads]", msg);
        return { ok: false, error: msg, backend: "none" };
    }

    const payload = buildPayload(lead);

    try {
        let id: string | undefined = lead.id;
        if (id) {
            await updateDoc(doc(firestore, COLLECTION, id), {
                ...payload,
                updated_at: serverTimestamp(),
            });
        } else {
            const ref = await addDoc(collection(firestore, COLLECTION), {
                ...payload,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp(),
            });
            id = ref.id;
        }
        // Webhook email en paralelo (no bloqueante)
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
        const msg = e?.message ?? "Error desconocido al guardar en Firestore";
        console.error("[chatLeads] Firestore error:", e);
        return { ok: false, error: msg, backend: "none" };
    }
}

/** Añade un mensaje al historial de un lead en Firestore. */
export async function appendMessage(
    leadId: string,
    msg: ChatMessage,
    patch?: Partial<LeadRecord>,
): Promise<{ ok: boolean; error?: string }> {
    if (!FIREBASE_CONFIGURED || !firestore) {
        return { ok: false, error: "Firebase no está configurado" };
    }
    try {
        const ref = doc(firestore, COLLECTION, leadId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            return { ok: false, error: "Lead no existe en Firestore" };
        }
        const cur = snap.data();
        const curHistory: ChatMessage[] = Array.isArray(cur.chat_history) ? cur.chat_history : [];
        const update: any = {
            chat_history: [...curHistory, msg],
            updated_at:   serverTimestamp(),
        };
        if (patch) {
            if (patch.status)          update.status          = patch.status;
            if (patch.selected_plan)   update.selected_plan   = patch.selected_plan;
            if (patch.trial_ends_at)   update.trial_ends_at   = patch.trial_ends_at;
            if (patch.user_email)      update.user_email      = patch.user_email;
            if (patch.restaurant_name) update.restaurant_name = patch.restaurant_name;
        }
        await updateDoc(ref, update);
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? "Error" };
    }
}
