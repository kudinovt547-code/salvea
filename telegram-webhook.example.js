/**
 * Salvea — релей заявок в Telegram (Cloudflare Worker)
 * ====================================================
 * Зачем: лендинг отправляет заявки POST-запросом сюда, а этот воркер
 * пересылает их в Telegram. Токен бота живёт в секретах воркера и
 * НИКОГДА не попадает в код страницы.
 *
 * Деплой (бесплатно, ~5 минут):
 *   1. npm i -g wrangler && wrangler login
 *   2. wrangler init salvea-relay   (вставьте этот файл в src/index.js)
 *   3. Создайте бота у @BotFather, получите токен.
 *      Узнайте chat_id: напишите боту, откройте
 *      https://api.telegram.org/bot<ТОКЕН>/getUpdates — там будет chat.id.
 *      Для канала/группы — добавьте бота админом, chat_id вида -100...
 *   4. wrangler secret put BOT_TOKEN     (вставьте токен)
 *   5. wrangler secret put CHAT_ID       (вставьте chat_id)
 *   6. wrangler deploy
 *   7. Вставьте полученный URL в WEBHOOK_URL в index.html
 *
 * Альтернатива на вашем стеке (FastAPI/aiogram) — POST-эндпоинт,
 * который шлёт sendMessage через Bot API; логика идентична.
 */

// при желании ограничьте источник своим доменом
const ALLOWED_ORIGIN = "*"; // напр. "https://salvea.ru"

const cors = (origin) => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN === "*" ? "*" : ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});

function esc(s = "") {
  return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
}

function formatMessage(d) {
  if (d.type === "survey") {
    const a = d.answers || {};
    const lines = Object.keys(a).map((k) => `• <b>${esc(k)}</b>: ${esc(a[k])}`).join("\n");
    return (
      `📋 <b>Salvea — ответы опроса</b>\n` +
      `${d.email ? `✉️ ${esc(d.email)}\n` : ""}` +
      `${d.telegram ? `💬 ${esc(d.telegram)}\n` : ""}` +
      `\n${lines || "—"}`
    );
  }
  // лид по умолчанию
  return (
    `🌿 <b>Salvea — новая заявка</b>\n` +
    `✉️ <b>E-mail:</b> ${esc(d.email)}\n` +
    `💬 <b>Telegram:</b> ${esc(d.telegram)}\n` +
    `📍 <b>Источник:</b> ${esc(d.source || "site")}`
  );
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors(origin) });
    }
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: cors(origin) });
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "bad json" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors(origin) },
      });
    }

    const tgRes = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.CHAT_ID,
        text: formatMessage(data),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    const ok = tgRes.ok;
    return new Response(JSON.stringify({ ok }), {
      status: ok ? 200 : 502,
      headers: { "Content-Type": "application/json", ...cors(origin) },
    });
  },
};
