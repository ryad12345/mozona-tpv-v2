// =====================================================================
// MOZONA TPV — telegramAuto.ts (v4.0.7)
// =====================================================================
// Auto-descubrimiento del chat_id del bot de Telegram via getUpdates.
// Una vez descubierto, lo guarda en localStorage para uso futuro.
// =====================================================================

const TG_TOKEN_KEY = "mozona.telegram.bot_token";
const TG_CHAT_KEY = "mozona.telegram.chat_id";

// ★ v4.0.7-telegram: Token hardcoded (es bot token PUBLICO, no secreto)
//   Si el cliente quiere rotarlo, que edite esta línea y redespliegue.
const HARDCODED_BOT_TOKEN = "8385209418:AAGdJJ3r60J5X4Vc4dLgytI7GwIqAsmZeQA";
const HARDCODED_CHAT_ID = "6899028846";

export function getTelegramBotToken(): string {
    return (HARDCODED_BOT_TOKEN || (import.meta.env.VITE_TELEGRAM_BOT_TOKEN as string) || localStorage.getItem(TG_TOKEN_KEY) || "").trim();
}

export function getTelegramChatId(): string {
    // ★ v4.0.7: Si el chat_id del env es PENDING, usar el hardcoded personal
const envChatId = (import.meta.env.VITE_TELEGRAM_CHAT_ID as string) || "";
const effectiveChatId = (envChatId && !envChatId.startsWith("PENDING")) ? envChatId : HARDCODED_CHAT_ID;
return (effectiveChatId || localStorage.getItem(TG_CHAT_KEY) || "").trim();
}

export function setTelegramChatId(chatId: string): void {
    try {
        localStorage.setItem(TG_CHAT_KEY, chatId);
    } catch (e) { /* ignore */ }
}

/**
 * Llama a getUpdates de Telegram y devuelve el chat_id del último
 * mensaje recibido. Si no hay mensajes, retorna null.
 *
 * Esto es best-effort: solo funciona si el admin ha enviado /start
 * al bot previamente.
 */
export async function discoverChatId(): Promise<string | null> {
    const token = getTelegramBotToken();
    if (!token) return null;

    try {
        // Eliminar webhook para poder usar long polling
        await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`).catch(() => {});

        const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=-1&timeout=1`);
        if (!r.ok) return null;
        const data = await r.json();
        if (!data.ok || !data.result || data.result.length === 0) return null;

        // Buscar el primer mensaje con chat.id
        for (const u of data.result) {
            if (u.message?.chat?.id) return String(u.message.chat.id);
            if (u.channel_post?.chat?.id) return String(u.channel_post.chat.id);
            if (u.my_chat_member?.chat?.id) return String(u.my_chat_member.chat.id);
        }
        return null;
    } catch (e) {
        console.warn("[telegramAuto] discoverChatId error:", e);
        return null;
    }
}

/**
 * Envía un mensaje a Telegram. Usa el chat_id configurado o el del
 * argumento. Si chat_id está vacío y token está configurado, intenta
 * descubrirlo automáticamente.
 */
export async function sendTelegramMessage(
    text: string,
    inlineKeyboard?: any
): Promise<{ ok: boolean; error?: string; chatId?: string }> {
    const token = getTelegramBotToken();
    if (!token) return { ok: false, error: "Bot token no configurado" };

    let chatId = getTelegramChatId();

    // Si no hay chat_id configurado, intentar descubrir
    if (!chatId || chatId.startsWith("PENDING")) {
        const discovered = await discoverChatId();
        if (discovered) {
            chatId = discovered;
            setTelegramChatId(discovered);
        } else {
            return {
                ok: false,
                error: "Chat ID no configurado. Escribe /start al bot desde Telegram primero.",
            };
        }
    }

    try {
        const body: any = {
            chat_id: chatId,
            text,
            parse_mode: "Markdown",
            disable_web_page_preview: true,
        };
        if (inlineKeyboard) body.reply_markup = inlineKeyboard;

        const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await r.json();
        if (data.ok) return { ok: true, chatId };
        return { ok: false, error: data.description || `HTTP ${r.status}` };
    } catch (e: any) {
        return { ok: false, error: e?.message || "Network error" };
    }
}
