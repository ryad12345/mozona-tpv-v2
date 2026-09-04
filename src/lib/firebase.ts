// =====================================================================
// MOZONA TPV — firebase.ts
// =====================================================================
// Inicialización CONDICIONAL de Firebase.
//
// Si las variables VITE_FIREBASE_* están configuradas, se inicializa
// y se exporta `db` (Firestore) y `notifier` (webhook helper).
// Si NO están, ambos son null y los saves se hacen en Supabase (fallback).
//
// VARIABLES DE ENTORNO REQUERIDAS (en .env.production / Vercel)
//   VITE_FIREBASE_API_KEY
//   VITE_FIREBASE_AUTH_DOMAIN
//   VITE_FIREBASE_PROJECT_ID
//   VITE_FIREBASE_STORAGE_BUCKET
//   VITE_FIREBASE_MESSAGING_SENDER_ID
//   VITE_FIREBASE_APP_ID
//   VITE_FIREBASE_MEASUREMENT_ID     (opcional, Analytics)
//
// VARIABLES DE WEBHOOK PARA NOTIFICACIONES
//   VITE_NOTIFY_WEBHOOK_URL          (Resend API endpoint, Zapier, n8n, etc.)
//   VITE_NOTIFY_TO_EMAIL             (a quién llega la alerta)
// =====================================================================

import { initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

export const FIREBASE_CONFIGURED: boolean = !!(import.meta.env.VITE_FIREBASE_API_KEY
    && import.meta.env.VITE_FIREBASE_PROJECT_ID);

let app: FirebaseApp | null = null;
let db:  Firestore   | null = null;

if (FIREBASE_CONFIGURED) {
    try {
        const config = {
            apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
            authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
            projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
            storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
            appId:             import.meta.env.VITE_FIREBASE_APP_ID,
            measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
        };
        app = initializeApp(config);
        db  = getFirestore(app);
        console.log("[firebase] inicializado OK · project:", config.projectId);
    } catch (e) {
        console.error("[firebase] error al inicializar, fallback a Supabase:", e);
        app = null;
        db  = null;
    }
} else {
    console.log("[firebase] NO configurado, los leads iran a Supabase (leads_onboarding)");
}

export { app, db };

/** ★ Webhook de notificación de nuevo lead.
 *  Si VITE_NOTIFY_WEBHOOK_URL está definida, hace POST con los datos.
 *  Si no, no-op silencioso. */
export interface NewLeadNotification {
    leadId:         string;
    restaurantName: string;
    userEmail:      string;
    selectedPlan:   string;
    trialEndsAt:    string;
    source:         string;
}

export async function notifyNewLead(lead: NewLeadNotification): Promise<{ ok: boolean; error?: string }> {
    const url = import.meta.env.VITE_NOTIFY_WEBHOOK_URL as string | undefined;
    if (!url) {
        // Silencioso: no hay webhook configurado
        return { ok: true };
    }
    try {
        const to = import.meta.env.VITE_NOTIFY_TO_EMAIL as string | undefined;
        const subject = `Nuevo lead MOZONA TPV: ${lead.restaurantName || "(sin nombre)"}`;
        const html = `
            <h2>Nuevo lead desde el AI Assistant</h2>
            <table style="border-collapse:collapse;font-family:sans-serif">
                <tr><td><b>Restaurante</b></td><td>${escapeHtml(lead.restaurantName || "—")}</td></tr>
                <tr><td><b>Email</b></td><td>${escapeHtml(lead.userEmail || "—")}</td></tr>
                <tr><td><b>Plan</b></td><td>${escapeHtml(lead.selectedPlan || "—")}</td></tr>
                <tr><td><b>Trial hasta</b></td><td>${escapeHtml(lead.trialEndsAt || "—")}</td></tr>
                <tr><td><b>Origen</b></td><td>${escapeHtml(lead.source || "—")}</td></tr>
                <tr><td><b>Lead ID</b></td><td>${escapeHtml(lead.leadId || "—")}</td></tr>
            </table>
        `;
        const text = `Nuevo lead MOZONA TPV\n`
                   + `Restaurante: ${lead.restaurantName}\n`
                   + `Email: ${lead.userEmail}\n`
                   + `Plan: ${lead.selectedPlan}\n`
                   + `Trial hasta: ${lead.trialEndsAt}\n`
                   + `Origen: ${lead.source}\n`
                   + `Lead ID: ${lead.leadId}`;

        // Soporta Resend API y cualquier webhook genérico con JSON {to, subject, html/text}
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                to, subject, html, text,
                from: "MOZONA TPV <noreply@mozona.online>",
                lead,
            }),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            console.warn("[notify] webhook status", res.status, body.slice(0, 200));
            return { ok: false, error: `HTTP ${res.status}` };
        }
        console.log("[notify] webhook OK");
        return { ok: true };
    } catch (e: any) {
        console.warn("[notify] error:", e?.message ?? e);
        return { ok: false, error: e?.message ?? "Error" };
    }
}

function escapeHtml(s: string): string {
    return String(s).replace(/[<>&"']/g, c =>
        ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] ?? c)
    );
}
