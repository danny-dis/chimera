// Minimal Telegram bot — forwards messages to Modal API, returns LLM replies.
const TOKEN = '8623418280:AAHyCjaivU_6aJ9tllg9cc2yqKbYc3tB_qI';
const MODAL_URL = 'https://api.us-west-2.modal.direct/v1/chat/completions';
const MODAL_KEY = 'modalresearch_s1Olz64Ofe3Jd49mGfMdodXvq07ygZvOY03wZbBxl80';
const MODEL = 'zai-org/GLM-5.1-FP8';

const BASE = `https://api.telegram.org/bot${TOKEN}`;
let offset = 0;
let busy = false;

async function callLLM(text) {
  const res = await fetch(MODAL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MODAL_KEY}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: text }], max_tokens: 1024 }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Modal ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? 'No response';
}

async function sendMsg(chatId, text) {
  await fetch(`${BASE}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(15000),
  });
}

async function poll() {
  if (busy) return;
  busy = true;
  try {
    const res = await fetch(`${BASE}/getUpdates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offset, timeout: 30 }),
      signal: AbortSignal.timeout(45000),
    });
    const data = await res.json();
    for (const upd of data.result ?? []) {
      offset = upd.update_id + 1;
      const msg = upd.message;
      if (!msg?.text) continue;
      console.log(`[${msg.from?.id}] ${msg.text}`);
      try {
        const reply = await callLLM(msg.text);
        await sendMsg(msg.chat.id, reply);
      } catch (e) {
        console.error('LLM error:', e.message);
        await sendMsg(msg.chat.id, 'Error: ' + e.message).catch(() => {});
      }
    }
  } catch (e) {
    console.error('Poll error:', e.message);
  } finally {
    busy = false;
  }
}

console.log('Bot polling...');
setInterval(() => poll().catch(console.error), 1000);
