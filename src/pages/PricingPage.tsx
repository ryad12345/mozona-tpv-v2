// =====================================================================
// MOZONA TPV — PricingPage (/pricing)
// =====================================================================
// Paywall / Suscripciones.  Si el usuario es SuperAdmin, salta
// automáticamente.  Si tiene tenant activo, redirige a /app.
//
// Funcionalidades:
//   • Muestra planes Plus 30€ y Pro 50€
//   • Botón "Suscribirme" → crea Stripe Checkout Session
//     (modo demo si no hay Stripe key configurada)
//   • Formulario para canjear un token de invitación
// =====================================================================

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isSupabaseConfigured, isSuperAdmin, supabase, PUBLIC_URL } from "../lib/supabase";
import { IconCheck, IconSparkles, IconShield, IconArrowRight, IconLock } from "../components/icons";

const PLANS = [
    {
        id: "plus_30" as const,
        name: "Plus",
        price: 30,
        tag: "Recomendado",
        highlight: false,
        perks: [
            "TPV ilimitado en la nube",
            "Comanderos móviles en tiempo real",
            "Mesas, tickets e inventario",
            "VeriFactu AEAT + AES-256",
            "Soporte por email",
        ],
    },
    {
        id: "pro_50" as const,
        name: "Pro",
        price: 50,
        tag: "Para crecer",
        highlight: true,
        perks: [
            "Todo lo de Plus",
            "Soporte técnico prioritario",
            "Asistencia remota",
            "Copias de seguridad continuas",
            "Formación inicial",
        ],
    },
];

const STRIPE_PRICE_ID: Record<string, string> = {
    plus_30: import.meta.env.VITE_STRIPE_PRICE_PLUS ?? "",
    pro_50:  import.meta.env.VITE_STRIPE_PRICE_PRO  ?? "",
};

export function PricingPage() {
    const auth = useAuth();
    const nav  = useNavigate();
    const [params] = useSearchParams();
    const [busy,   setBusy]   = useState<string | null>(null);
    const [token,  setToken]  = useState(params.get("invite") ?? "");
    const [redeeming, setRedeeming] = useState(false);
    const [redeemMsg, setRedeemMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

    // Bypass SuperAdmin
    useEffect(() => {
        if (!auth.isReady) return;
        if (auth.isSuperAdmin) { nav("/admin/invites", { replace: true }); return; }
        if (auth.tenant && (auth.tenant.subscription_status === "active" || auth.tenant.subscription_status === "trialing")) {
            nav("/app", { replace: true });
        }
    }, [auth.isReady, auth.isSuperAdmin, auth.tenant, nav]);

    const subscribe = async (planId: "plus_30" | "pro_50") => {
        setBusy(planId);
        setRedeemMsg(null);
        if (!isSupabaseConfigured) {
            setRedeemMsg({ kind: "err", text: "Supabase no configurado" });
            setBusy(null);
            return;
        }
        const priceId = STRIPE_PRICE_ID[planId];
        // Modo demo: activa la suscripción directamente sin Stripe
        if (!priceId || priceId.startsWith("price_xxx")) {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { setBusy(null); return; }
            // Crear/actualizar tenant en demo
            let { data: tenant } = await supabase.from("tenants")
                .select("*").eq("owner_id", user.id).maybeSingle();
            if (!tenant) {
                const ins = await supabase.from("tenants").insert({
                    name: user.email?.split("@")[0] ?? "Mi Restaurante",
                    owner_id: user.id, plan: planId, subscription_status: "active",
                }).select().single();
                tenant = ins.data;
            } else {
                await supabase.from("tenants").update({
                    plan: planId, subscription_status: "active",
                }).eq("id", tenant!.id);
            }
            if (tenant) {
                // Vincular como owner si no lo está
                await supabase.from("tenant_users").upsert({
                    tenant_id: tenant.id, user_id: user.id, email: user.email ?? "",
                    role: "owner", pin_code: "1234",
                }, { onConflict: "tenant_id,user_id" });
            }
            setRedeemMsg({ kind: "ok", text: "Suscripción demo activada.  Redirigiendo…" });
            setTimeout(() => nav("/app"), 1200);
            setBusy(null);
            return;
        }
        // Stripe Checkout real
        try {
            const { data, error } = await supabase.functions.invoke("create-checkout", {
                body: {
                    priceId,
                    successUrl: `${PUBLIC_URL}/register?session_id={CHECKOUT_SESSION_ID}&plan=${planId}`,
                    cancelUrl:  `${PUBLIC_URL}/pricing`,
                },
            });
            if (error) throw error;
            if (data?.url) window.location.href = data.url;
        } catch (e) {
            setRedeemMsg({
                kind: "err",
                text: "No se pudo iniciar el pago.  Configura la Edge Function `create-checkout`.",
            });
        }
        setBusy(null);
    };

    const redeem = async () => {
        if (!token.trim()) return;
        setRedeeming(true);
        setRedeemMsg(null);
        const { error } = await (auth.redeemInvite ?? (async () => ({ error: "no provider" })))(token.trim());
        setRedeeming(false);
        if (error) {
            setRedeemMsg({ kind: "err", text: error });
            return;
        }
        setRedeemMsg({ kind: "ok", text: "Invitación canjeada.  Redirigiendo…" });
        setTimeout(() => nav("/app"), 1200);
    };

    return (
        <div className="min-h-dvh bg-gradient-to-b from-slate-50 to-white">
            <div className="max-w-5xl mx-auto px-5 py-12">
                {/* Header */}
                <div className="text-center mb-10">
                    <Link to="/" className="inline-flex items-center gap-2 mb-6">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700
                                        text-white flex items-center justify-center font-black text-sm">
                            M
                        </div>
                        <span className="text-[14px] font-black tracking-tight">MOZONA TPV</span>
                    </Link>
                    <h1 className="text-[34px] sm:text-[42px] font-black tracking-tight">
                        Elige tu plan
                    </h1>
                    <p className="mt-2 text-[14.5px] text-slate-600">
                        Sin permanencia.  Cancela cuando quieras.
                    </p>
                </div>

                {/* Planes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {PLANS.map(p => (
                        <div key={p.id}
                             className={
                                 "p-6 rounded-3xl border bg-white " +
                                 (p.highlight
                                     ? "border-blue-300 shadow-xl shadow-blue-600/10 ring-1 ring-blue-200/50"
                                     : "border-slate-200/80 shadow-sm")
                             }>
                            <div className="flex items-center justify-between">
                                <h3 className="text-[18px] font-black">{p.name}</h3>
                                {p.tag && (
                                    <span className="text-[10.5px] font-bold uppercase tracking-wider
                                                     px-2 py-0.5 rounded-full
                                                     bg-blue-50 text-blue-700">
                                        {p.tag}
                                    </span>
                                )}
                            </div>
                            <div className="mt-3 flex items-baseline gap-1">
                                <span className="text-[44px] font-black tabular-nums leading-none">
                                    {p.price}€
                                </span>
                                <span className="text-[13px] text-slate-500">/mes</span>
                            </div>
                            <ul className="mt-5 space-y-2">
                                {p.perks.map((perk, j) => (
                                    <li key={j} className="flex items-start gap-2 text-[13px] text-slate-700">
                                        <IconCheck size={16} strokeWidth={2.4}
                                                   className="text-emerald-500 mt-0.5 shrink-0" />
                                        {perk}
                                    </li>
                                ))}
                            </ul>
                            <button onClick={() => subscribe(p.id)}
                                    disabled={busy === p.id}
                                    className={
                                        "mt-6 w-full h-12 rounded-xl text-[14px] font-black " +
                                        "active:scale-95 transition disabled:opacity-50 " +
                                        (p.highlight
                                            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                                            : "bg-slate-900 text-white shadow-lg shadow-slate-900/20")
                                    }>
                                {busy === p.id ? "Procesando…" : `Suscribirme a ${p.name}`}
                            </button>
                        </div>
                    ))}
                </div>

                {/* Invitación gratuita */}
                <div className="mt-10 p-6 rounded-3xl bg-white border border-slate-200/80 shadow-sm">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700
                                        flex items-center justify-center shrink-0">
                            <IconSparkles size={18} strokeWidth={1.8} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-[15px] font-black text-slate-900">
                                ¿Tienes un código de invitación?
                            </h3>
                            <p className="mt-1 text-[12.5px] text-slate-600">
                                Canjéalo para activar tu plan sin coste.  Los planes lifetime_vip
                                no caducan nunca.
                            </p>
                            <div className="mt-4 flex gap-2">
                                <input type="text" value={token} onChange={e => setToken(e.target.value)}
                                       placeholder="Pega aquí tu token"
                                       className="input flex-1" />
                                <button onClick={redeem} disabled={!token.trim() || redeeming}
                                        className="h-11 px-5 rounded-xl bg-slate-900 text-white text-[13px] font-bold
                                                   active:scale-95 transition disabled:opacity-50
                                                   flex items-center gap-1.5 shrink-0">
                                    {redeeming ? "…" : "Canjear"}
                                    <IconArrowRight size={14} strokeWidth={2.4} />
                                </button>
                            </div>
                            {redeemMsg && (
                                <div className={
                                    "mt-3 p-3 rounded-xl text-[12px] " +
                                    (redeemMsg.kind === "ok"
                                        ? "bg-emerald-50 border border-emerald-200/80 text-emerald-800"
                                        : "bg-rose-50 border border-rose-200/80 text-rose-700")
                                }>
                                    {redeemMsg.text}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* SuperAdmin notice */}
                {isSuperAdmin(auth.user?.email) && (
                    <div className="mt-6 p-4 rounded-2xl bg-violet-50 border border-violet-200/80
                                    text-[12.5px] text-violet-800 flex items-start gap-2">
                        <IconShield size={16} strokeWidth={2.2} className="mt-0.5 shrink-0" />
                        <div>
                            <strong>SuperAdmin.</strong>  Acceso directo al panel de invitaciones.{" "}
                            <Link to="/admin/invites" className="font-bold underline">
                                Ir al panel →
                            </Link>
                        </div>
                    </div>
                )}

                <div className="mt-8 text-center text-[11.5px] text-slate-400 flex items-center justify-center gap-1.5">
                    <IconLock size={11} strokeWidth={2.2} />
                    Pago seguro procesado por Stripe.  No almacenamos tarjetas.
                </div>
            </div>
        </div>
    );
}
