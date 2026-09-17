// =====================================================================
// MOZONA TPV — AIStudioPage (v3.5.0)
// =====================================================================
// Centro de IA 100% LOCAL:
//   - Invoice Scanner  (Llama 3.2 Vision local)
//   - Voice Assistant  (Whisper local + LLM local)
//   - Smart Pricing    (SQL analysis + LLM local)
//
// CERO APIs externas. Todo corre en el servidor del cliente con
// Ollama, Whisper.cpp y modelos open-source.
// =====================================================================

import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isVipOrAdmin } from "../lib/vip";
import { IconShield, IconArrowLeft, IconCheck, IconSettings } from "../components/icons";

type Tab = "invoice" | "voice" | "pricing" | "suppliers" | "profit" | "config";

interface ApiResponse {
    ok: boolean;
    error?: string;
    data?: any;
    hint?: string;
    ai_powered?: boolean;
    latency?: number;
    model?: string;
}

export function AIStudioPage() {
    const navigate = useNavigate();
    const auth = useAuth();
    const [tab, setTab] = useState<Tab>("invoice");

    useEffect(() => {
        if (auth.isReady && !auth.user) {
            navigate("/auth", { replace: true });
        }
    }, [auth.isReady, auth.user, navigate]);

    if (!auth.isReady) return <div className="p-8 text-center text-slate-500">Cargando…</div>;
    if (!auth.user) return <div className="p-8 text-center text-slate-500">Redirigiendo…</div>;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-3 sm:p-5">
            <div className="max-w-7xl mx-auto space-y-3">
                {/* Cabecera */}
                <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 rounded-2xl shadow-xl p-4 text-white">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl">
                                🤖
                            </div>
                            <div>
                                <h1 className="text-xl font-black">AI Studio · Local</h1>
                                <p className="text-[11.5px] text-violet-100">
                                    Llama 3.2 Vision · Whisper · Llama 3.1 — todo on-premise · {auth.user.email}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => navigate("/app")}
                                className="h-9 px-3 rounded-lg bg-white/20 hover:bg-white/30 text-white text-[12px] font-bold flex items-center gap-1"
                            >
                                <IconArrowLeft size={12} /> Volver al TPV
                            </button>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="bg-white rounded-2xl shadow p-1.5 flex gap-1 overflow-x-auto">
                    {([
                        { id: "invoice", label: "📸 Facturas", desc: "Escáner de proveedores" },
                        { id: "voice", label: "🎙️ Voz", desc: "Asistente de camarero" },
                        { id: "suppliers", label: "🌌 Barista", desc: "Auto-pedidos IA" },
                        { id: "profit", label: "👥 Socio", desc: "Coach rentabilidad" },
                        { id: "pricing", label: "📈 Stock", desc: "Anti-mermas" },
                        { id: "config", label: "⚙️ Config", desc: "Setup local" },
                    ] as const).map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex-1 min-w-[120px] px-4 py-2.5 rounded-xl text-left transition ${
                                tab === t.id
                                    ? "bg-violet-600 text-white shadow"
                                    : "text-slate-600 hover:bg-slate-50"
                            }`}
                        >
                            <div className="text-[12.5px] font-bold">{t.label}</div>
                            <div className="text-[10.5px] opacity-80">{t.desc}</div>
                        </button>
                    ))}
                </div>

                {/* Contenido */}
                <div className="bg-white rounded-2xl shadow p-5 min-h-[500px]">
                    {tab === "invoice" && <InvoiceScanner tenantId={auth.tenant?.id} />}
                    {tab === "voice" && <VoiceAssistant tenantId={auth.tenant?.id} />}
                    {tab === "suppliers" && <BaristaGhost tenantId={auth.tenant?.id} />}
                    {tab === "profit" && <SocioOculto tenantId={auth.tenant?.id} />}
                    {tab === "pricing" && <SmartPricing tenantId={auth.tenant?.id} />}
                    {tab === "config" && <ConfigPanel />}
                </div>

                <div className="text-[10.5px] text-slate-500 text-center">
                    🔒 <strong>Cero APIs externas</strong>. Los datos (imágenes, audio, texto) NUNCA salen de tu servidor.
                    Ollama + Whisper corren en localhost.
                </div>
            </div>
        </div>
    );
}

// =====================================================================
// 📸 INVOICE SCANNER
// =====================================================================
function InvoiceScanner({ tenantId }: { tenantId?: string }) {
    const [imageBase64, setImageBase64] = useState<string | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [response, setResponse] = useState<ApiResponse | null>(null);
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const handleFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            setImageBase64(result);
            setPreview(result);
        };
        reader.readAsDataURL(file);
    };

    const onScan = async () => {
        if (!imageBase64) return;
        setBusy(true);
        setResponse(null);
        try {
            const r = await fetch("/api/ai-assistant", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-tenant-id": tenantId || "" },
                body: JSON.stringify({ action: "scan-invoice", imageBase64, tenantId }),
            });
            const json = await r.json();
            setResponse(json);
        } catch (e: any) { setResponse({ ok: false, error: e?.message }); }
        setBusy(false);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
                <h2 className="text-lg font-black mb-3">📸 Escanear factura de proveedor</h2>
                <p className="text-[13px] text-slate-600 mb-4">
                    Sube o fotografía la factura. La IA local extrae líneas, cantidades y precios.
                </p>
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                    }}
                    className="hidden"
                />
                <div
                    onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50/30 transition"
                >
                    {preview ? (
                        <img src={preview} alt="preview" className="max-h-72 mx-auto rounded-lg" />
                    ) : (
                        <>
                            <div className="text-5xl mb-3">📷</div>
                            <div className="text-[13px] font-semibold text-slate-700">Toca para subir foto</div>
                            <div className="text-[11px] text-slate-500 mt-1">JPG, PNG, HEIC, PDF (primera página)</div>
                        </>
                    )}
                </div>
                <button
                    onClick={onScan}
                    disabled={!imageBase64 || busy}
                    className="mt-4 w-full h-12 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white text-[14px] font-black"
                >
                    {busy ? "⏳ Analizando con Llama 3.2 Vision…" : "🤖 Extraer datos"}
                </button>
            </div>

            <div>
                <h2 className="text-lg font-black mb-3">Resultado</h2>
                {response === null && (
                    <div className="bg-slate-50 rounded-2xl p-8 text-center text-slate-500 text-[13px]">
                        La IA devolverá aquí los datos extraídos
                    </div>
                )}
                {response && !response.ok && (
                    <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4">
                        <div className="font-black text-rose-900 mb-1">⚠️ IA local no disponible</div>
                        <div className="text-[12px] text-rose-800">{response.error}</div>
                        {response.hint && (
                            <pre className="mt-2 text-[11px] bg-white rounded p-2 overflow-x-auto">{response.hint}</pre>
                        )}
                    </div>
                )}
                {response && response.ok && response.data && (
                    <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-black text-emerald-900">✅ Extraído por {response.model}</span>
                            {response.latency && <span className="text-[10.5px] text-emerald-700">{response.latency}ms</span>}
                        </div>
                        <div className="text-[12.5px] text-emerald-900 mb-2">
                            <strong>Proveedor:</strong> {response.data.vendor || "—"}
                        </div>
                        <pre className="bg-white rounded p-2 text-[10.5px] overflow-x-auto max-h-72 overflow-y-auto">
                            {JSON.stringify(response.data, null, 2)}
                        </pre>
                        <button className="mt-3 w-full h-10 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-black flex items-center justify-center gap-1.5">
                            <IconCheck size={12} /> Importar a stock
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// =====================================================================
// 🎙️ VOICE ASSISTANT
// =====================================================================
function VoiceAssistant({ tenantId }: { tenantId?: string }) {
    const [recording, setRecording] = useState(false);
    const [audioBase64, setAudioBase64] = useState<string | null>(null);
    const [response, setResponse] = useState<ApiResponse | null>(null);
    const [manualText, setManualText] = useState("");
    const [busy, setBusy] = useState(false);
    const [menuContext, setMenuContext] = useState("Carta del restaurante");
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
            chunksRef.current = [];
            rec.ondataavailable = e => chunksRef.current.push(e.data);
            rec.onstop = async () => {
                const blob = new Blob(chunksRef.current, { type: "audio/webm" });
                const reader = new FileReader();
                reader.onload = () => {
                    const b64 = reader.result as string;
                    setAudioBase64(b64);
                    stream.getTracks().forEach(t => t.stop());
                };
                reader.readAsDataURL(blob);
            };
            rec.start();
            recorderRef.current = rec;
            setRecording(true);
        } catch (e: any) {
            alert("No se pudo acceder al micrófono: " + e?.message);
        }
    };

    const stopRecording = () => {
        recorderRef.current?.stop();
        setRecording(false);
    };

    const onProcess = async () => {
        if (!audioBase64 && !manualText) return;
        setBusy(true);
        setResponse(null);
        try {
            const r = await fetch("/api/ai-assistant", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-tenant-id": tenantId || "" },
                body: JSON.stringify({
                    action: "voice-order",
                    audioBase64,
                    manualText: manualText || undefined,
                    menuContext,
                    tenantId,
                }),
            });
            const json = await r.json();
            setResponse(json);
        } catch (e: any) { setResponse({ ok: false, error: e?.message }); }
        setBusy(false);
    };

    return (
        <div>
            <h2 className="text-lg font-black mb-3">🎙️ Tomar comanda por voz</h2>
            <p className="text-[13px] text-slate-600 mb-4">
                El camarero habla. Whisper transcribe. Llama 3.1 extrae los items del menú.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                    <div className="flex items-center justify-center h-48 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 border-2 border-violet-200 mb-4">
                        {!recording && !audioBase64 && (
                            <button
                                onClick={startRecording}
                                className="w-24 h-24 rounded-full bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center shadow-lg"
                            >
                                <div className="text-3xl">🎙️</div>
                            </button>
                        )}
                        {recording && (
                            <button
                                onClick={stopRecording}
                                className="w-24 h-24 rounded-full bg-rose-600 animate-pulse text-white flex items-center justify-center shadow-lg"
                            >
                                <div className="text-3xl">⏹️</div>
                            </button>
                        )}
                        {audioBase64 && !recording && (
                            <div className="text-center">
                                <div className="text-5xl mb-2">✅</div>
                                <div className="text-[13px] font-semibold text-slate-700">Audio capturado</div>
                                <button onClick={() => setAudioBase64(null)} className="mt-2 text-[11px] text-violet-600 underline">Grabar de nuevo</button>
                            </div>
                        )}
                    </div>

                    <div className="mb-3">
                        <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-widest">
                            Texto manual (si no hay Whisper)
                        </label>
                        <textarea
                            value={manualText}
                            onChange={e => setManualText(e.target.value)}
                            placeholder='Ej: "Una ración de croquetas y dos cañas"'
                            rows={2}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-300 text-[12.5px]"
                        />
                    </div>

                    <div className="mb-3">
                        <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-widest">
                            Contexto del menú (para Llama)
                        </label>
                        <textarea
                            value={menuContext}
                            onChange={e => setMenuContext(e.target.value)}
                            rows={3}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-300 text-[12px]"
                        />
                    </div>

                    <button
                        onClick={onProcess}
                        disabled={(!audioBase64 && !manualText) || busy}
                        className="w-full h-12 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white text-[14px] font-black"
                    >
                        {busy ? "⏳ Whisper + Llama…" : "🎯 Procesar comanda"}
                    </button>
                </div>

                <div>
                    {response && !response.ok && (
                        <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4">
                            <div className="font-black text-rose-900 mb-1">⚠️ Whisper/Llama no disponible</div>
                            <div className="text-[12px] text-rose-800">{response.error}</div>
                            {response.hint && (
                                <pre className="mt-2 text-[11px] bg-white rounded p-2 overflow-x-auto">{response.hint}</pre>
                            )}
                        </div>
                    )}
                    {response && response.ok && response.data && (
                        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4">
                            <div className="font-black text-emerald-900 mb-2">✅ Transcripción</div>
                            <div className="text-[13px] italic text-emerald-800 mb-3">"{response.data.transcription}"</div>
                            <div className="font-black text-emerald-900 mb-2">Items extraídos</div>
                            <div className="space-y-1.5">
                                {(response.data.items || []).map((it: any, i: number) => (
                                    <div key={i} className="bg-white rounded-lg p-2 flex items-center justify-between text-[12px]">
                                        <span><strong>{it.quantity}x</strong> {it.product_name}</span>
                                        {it.notes && <span className="text-slate-500 text-[10.5px]">{it.notes}</span>}
                                    </div>
                                ))}
                            </div>
                            <button className="mt-3 w-full h-10 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-black flex items-center justify-center gap-1.5">
                                <IconCheck size={12} /> Enviar a cocina
                            </button>
                        </div>
                    )}
                    {!response && (
                        <div className="bg-slate-50 rounded-2xl p-8 text-center text-slate-500 text-[13px]">
                            Habla o escribe la comanda, pulsa "Procesar" y la IA la estructurará
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// =====================================================================
// 📈 SMART PRICING
// =====================================================================
function SmartPricing({ tenantId }: { tenantId?: string }) {
    const [response, setResponse] = useState<ApiResponse | null>(null);
    const [busy, setBusy] = useState(false);

    const onAnalyze = async () => {
        if (!tenantId) {
            setResponse({ ok: false, error: "Sin tenant_id" });
            return;
        }
        setBusy(true);
        setResponse(null);
        try {
            const r = await fetch("/api/ai-assistant", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
                body: JSON.stringify({ action: "predict-pricing", tenantId }),
            });
            const json = await r.json();
            setResponse(json);
        } catch (e: any) { setResponse({ ok: false, error: e?.message }); }
        setBusy(false);
    };

    useEffect(() => { onAnalyze(); }, [tenantId]);

    return (
        <div>
            <h2 className="text-lg font-black mb-3">📈 Pricing predictivo y anti-mermas</h2>
            <p className="text-[13px] text-slate-600 mb-4">
                Analiza ventas históricas, stock y propone descuentos automáticamente.
            </p>
            <button
                onClick={onAnalyze}
                disabled={busy}
                className="mb-4 h-10 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white text-[12.5px] font-black"
            >
                {busy ? "⏳ Analizando…" : "🔄 Re-analizar"}
            </button>

            {response && !response.ok && (
                <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4">
                    <div className="text-[12px] text-rose-800">{response.error}</div>
                </div>
            )}
            {response && response.ok && response.ai_powered && response.data?.suggestions && (
                <div className="space-y-2">
                    <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-3 text-[12.5px]">
                        <strong>Resumen IA:</strong> {response.data.summary}
                    </div>
                    {response.data.suggestions.map((s: any, i: number) => (
                        <div key={i} className="bg-white rounded-xl border-2 border-slate-200 p-3 flex items-start justify-between">
                            <div>
                                <div className="text-[10.5px] font-bold text-violet-600 uppercase">{s.type}</div>
                                <div className="text-[13px] text-slate-800">{s.reason}</div>
                            </div>
                            {s.value && <div className="text-[12px] font-mono bg-slate-100 px-2 py-1 rounded">{s.value}</div>}
                        </div>
                    ))}
                </div>
            )}
            {response && response.ok && !response.ai_powered && (
                <div className="space-y-3">
                    <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-3 text-[12px]">
                        ⚠️ Sin IA local — análisis SQL puro
                    </div>
                    {response.data?.low_stock?.length > 0 && (
                        <div>
                            <h3 className="text-[14px] font-black mb-2">Productos con stock bajo</h3>
                            <div className="space-y-1">
                                {response.data.low_stock.map((p: any) => (
                                    <div key={p.id} className="bg-rose-50 border border-rose-200 rounded-lg p-2 text-[12px]">
                                        <strong>{p.name}</strong> — Stock: {p.current_stock} / Mín: {p.min_stock}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// =====================================================================
// ⚙️ CONFIG PANEL
// =====================================================================
function ConfigPanel() {
    return (
        <div className="max-w-3xl">
            <h2 className="text-lg font-black mb-3 flex items-center gap-2">
                <IconSettings size={18} /> Configuración del servidor IA local
            </h2>
            <p className="text-[13px] text-slate-600 mb-4">
                Para usar las funciones de IA, necesitas instalar Ollama y opcionalmente Whisper en el servidor.
            </p>

            <div className="space-y-4">
                <div className="bg-slate-50 rounded-2xl p-4">
                    <h3 className="text-[14px] font-black mb-2">1️⃣ Instalar Ollama</h3>
                    <pre className="bg-slate-900 text-green-300 rounded-lg p-3 text-[11px] overflow-x-auto">
{`# Linux/Mac
curl -fsSL https://ollama.com/install.sh | sh
ollama serve

# Modelos necesarios
ollama pull llama3.2-vision    # Para facturas
ollama pull llama3.1:8b        # Para texto (Whisper → items, pricing)`}
                    </pre>
                </div>

                <div className="bg-slate-50 rounded-2xl p-4">
                    <h3 className="text-[14px] font-black mb-2">2️⃣ Instalar Whisper (opcional)</h3>
                    <pre className="bg-slate-900 text-green-300 rounded-lg p-3 text-[11px] overflow-x-auto">
{`# Opción A: whisper-server (recomendado)
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp && make
./build/bin/whisper-server -m models/ggml-base.bin --port 8080

# Opción B: faster-whisper (Python)
pip install faster-whisper
# Levantar con tu wrapper en puerto 8080`}
                    </pre>
                </div>

                <div className="bg-slate-50 rounded-2xl p-4">
                    <h3 className="text-[14px] font-black mb-2">3️⃣ Variables de entorno en Vercel</h3>
                    <pre className="bg-slate-900 text-green-300 rounded-lg p-3 text-[11px] overflow-x-auto">
{`OLLAMA_HOST=http://localhost:11434
OLLAMA_VISION_MODEL=llama3.2-vision
OLLAMA_LLM_MODEL=llama3.1:8b
WHISPER_HOST=http://localhost:8080`}
                    </pre>
                    <p className="text-[11.5px] text-slate-500 mt-2">
                        ⚠️ <strong>Importante</strong>: el backend (Vercel) no puede hablar con localhost directamente.
                        Usa un túnel ngrok / cloudflared para Ollama, o despliega este backend en tu propio VPS.
                    </p>
                </div>

                <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4">
                    <h3 className="text-[14px] font-black mb-2">✅ Estado del sistema</h3>
                    <div className="text-[12px] space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            Backend Vercel funcionando
                        </div>
                        <div className="flex items-center gap-2 text-slate-500">
                            <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                            Ollama: configura OLLAMA_HOST para activar
                        </div>
                        <div className="flex items-center gap-2 text-slate-500">
                            <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                            Whisper: configura WHISPER_HOST para activar
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// =====================================================================
// 🌌 BARISTA FANTASMA (Auto-pedidos a proveedores por WhatsApp)
// =====================================================================
function BaristaGhost({ tenantId }: { tenantId?: string }) {
    const [data, setData] = useState<ApiResponse | null>(null);
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState<Record<number, boolean>>({});

    const onAnalyze = async () => {
        if (!tenantId) return;
        setBusy(true);
        setData(null);
        try {
            const r = await fetch("/api/ai-assistant", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
                body: JSON.stringify({ action: "barista-ghost", tenantId }),
            });
            setData(await r.json());
        } catch (e: any) { setData({ ok: false, error: e?.message }); }
        setBusy(false);
    };

    useEffect(() => { onAnalyze(); }, [tenantId]);

    return (
        <div>
            <h2 className="text-lg font-black mb-1">🌌 Barista Fantasma</h2>
            <p className="text-[13px] text-slate-600 mb-4">
                Detectamos qué falta en tu cocina y preparamos pedidos a tus proveedores por WhatsApp.
                Un clic y se abre el chat listo para enviar.
            </p>
            <button
                onClick={onAnalyze}
                disabled={busy}
                className="mb-4 h-10 px-4 rounded-lg bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 disabled:bg-slate-300 text-white text-[12.5px] font-black"
            >
                {busy ? "⏳ Analizando stock y ventas…" : "🔄 Re-analizar ahora"}
            </button>

            {data && !data.ok && (
                <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4">
                    <div className="text-[12px] text-rose-800">{data.error}</div>
                </div>
            )}

            {data && data.ok && (
                <div className="space-y-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 text-[12.5px] text-blue-900">
                        {data.data.message}
                        {data.data.total_estimated_cost > 0 && (
                            <span className="ml-2 font-black">
                                · Coste estimado: €{data.data.total_estimated_cost.toFixed(2)}
                            </span>
                        )}
                    </div>

                    {data.data.orders?.length === 0 && (
                        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-6 text-center">
                            <div className="text-4xl mb-2">✅</div>
                            <div className="text-[14px] font-bold text-emerald-900">Todo en orden</div>
                            <div className="text-[12px] text-emerald-700">No hay productos por debajo del mínimo</div>
                        </div>
                    )}

                    {data.data.orders?.map((o: any, i: number) => (
                        <div key={i} className="bg-white border-2 border-slate-200 rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <div className="text-[15px] font-black">{o.supplier.name}</div>
                                    <div className="text-[11.5px] text-slate-500">{o.supplier.phone}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10.5px] text-slate-500">Subtotal</div>
                                    <div className="text-[18px] font-black text-violet-600">€{o.subtotal.toFixed(2)}</div>
                                </div>
                            </div>
                            <div className="space-y-1 mb-3 max-h-48 overflow-y-auto">
                                {o.lines.map((l: any, j: number) => (
                                    <div key={j} className="flex items-center justify-between text-[12px] bg-slate-50 rounded-lg p-2">
                                        <span><strong>{l.product_name}</strong></span>
                                        <span className="text-slate-600">
                                            {l.packs_to_order}× pack ({l.pack_size}u)
                                            · <span className="font-bold">€{l.subtotal.toFixed(2)}</span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <details className="mb-2">
                                <summary className="text-[11px] text-slate-500 cursor-pointer">Ver mensaje completo</summary>
                                <pre className="bg-slate-50 rounded p-2 text-[11px] whitespace-pre-wrap mt-1">{o.message_preview}</pre>
                            </details>
                            {sent[i] ? (
                                <div className="bg-emerald-100 text-emerald-800 rounded-lg p-2 text-center text-[12px] font-bold">
                                    ✅ Marcado como enviado
                                </div>
                            ) : (
                                <a
                                    href={o.whatsapp_url || "#"}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={() => setSent(prev => ({ ...prev, [i]: true }))}
                                    className={`block text-center w-full h-12 rounded-xl ${o.whatsapp_url ? "bg-emerald-500 hover:bg-emerald-600" : "bg-slate-300"} text-white font-black text-[14px] flex items-center justify-center gap-2`}
                                >
                                    💬 Abrir WhatsApp
                                </a>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// =====================================================================
// 👥 SOCIO OCULTO (Coach de rentabilidad)
// =====================================================================
function SocioOculto({ tenantId }: { tenantId?: string }) {
    const [data, setData] = useState<ApiResponse | null>(null);
    const [busy, setBusy] = useState(false);

    const onAnalyze = async () => {
        if (!tenantId) return;
        setBusy(true);
        setData(null);
        try {
            const r = await fetch("/api/ai-assistant", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
                body: JSON.stringify({ action: "profit-coach", tenantId }),
            });
            setData(await r.json());
        } catch (e: any) { setData({ ok: false, error: e?.message }); }
        setBusy(false);
    };

    useEffect(() => { onAnalyze(); }, [tenantId]);

    if (!data) {
        return <div className="text-center py-12 text-slate-500">⏳ Analizando tu cartera…</div>;
    }
    if (!data.ok) {
        return <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4">{data.error}</div>;
    }

    const d = data.data;
    return (
        <div>
            <h2 className="text-lg font-black mb-1">👥 Socio Oculto</h2>
            <p className="text-[13px] text-slate-600 mb-4">
                Te digo en lenguaje claro qué platos te están dejando más margen — y cuáles están sangrando dinero.
            </p>

            <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white rounded-2xl p-4 border border-slate-200">
                    <div className="text-[10.5px] text-slate-500 uppercase tracking-widest">Total productos</div>
                    <div className="text-2xl font-black mt-1">{d.total_products}</div>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-slate-200">
                    <div className="text-[10.5px] text-slate-500 uppercase tracking-widest">Con coste</div>
                    <div className="text-2xl font-black mt-1">{d.products_with_cost}</div>
                </div>
                <div className={`rounded-2xl p-4 border-2 ${Number(d.avg_margin_pct) > 60 ? "bg-emerald-50 border-emerald-200" : Number(d.avg_margin_pct) > 40 ? "bg-amber-50 border-amber-200" : "bg-rose-50 border-rose-200"}`}>
                    <div className="text-[10.5px] text-slate-500 uppercase tracking-widest">Margen medio</div>
                    <div className="text-2xl font-black mt-1">{d.avg_margin_pct}%</div>
                </div>
            </div>

            {d.insights.length === 0 ? (
                <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-6 text-center">
                    <div className="text-4xl mb-2">🎉</div>
                    <div className="text-[14px] font-bold text-emerald-900">Tu cartera está saneada</div>
                    <div className="text-[12px] text-emerald-700">
                        Todos tus productos cumplen el margen objetivo del {d.insights[0]?.target_margin || 65}%.
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    <h3 className="text-[14px] font-black mt-4 mb-2">⚠️ Platos que necesitan tu atención</h3>
                    {d.insights.map((ins: any, i: number) => (
                        <div
                            key={i}
                            className={`rounded-2xl p-3 border-l-4 ${
                                ins.severity === "critical" ? "bg-rose-50 border-rose-500"
                                : ins.severity === "warning" ? "bg-amber-50 border-amber-500"
                                : "bg-blue-50 border-blue-500"
                            }`}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="text-[14px] font-bold text-slate-900">
                                        {ins.product_name}
                                    </div>
                                    <div className="text-[12px] text-slate-600 mt-1">
                                        Precio actual <strong>€{ins.price.toFixed(2)}</strong> ·
                                        Coste €{ins.cost.toFixed(2)} ·
                                        Margen <span className={ins.severity === "critical" ? "text-rose-600 font-black" : "text-amber-700 font-bold"}>{ins.current_margin}%</span>
                                        (objetivo {ins.target_margin}%)
                                    </div>
                                    <div className="text-[12px] mt-2 text-slate-700">
                                        💡 {ins.suggestion}
                                    </div>
                                </div>
                                <div className="text-right ml-3">
                                    <div className="text-[10px] text-slate-500 uppercase">Ganancia</div>
                                    <div className="text-[15px] font-black text-emerald-600">
                                        +€{ins.potential_gain}
                                    </div>
                                    <div className="text-[10px] text-slate-500">/10 ventas</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <button
                onClick={onAnalyze}
                disabled={busy}
                className="mt-4 h-10 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white text-[12.5px] font-black"
            >
                {busy ? "⏳ …" : "🔄 Re-analizar"}
            </button>
        </div>
    );
}

export default AIStudioPage;
