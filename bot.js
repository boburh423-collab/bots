// ============================================================
// bot.js — Node.js Telegram Bot (Polling)
// Ishga tushirish: node bot.js
// Railway.app yoki Render.com da bepul hosting
// ============================================================

const https  = require('https');
const crypto = require('crypto');

const TOKEN   = '8623775032:AAFn3ESnMoWddva2kCecwuJx8TZRv7nceqs';
const SITE    = 'https://soz-boyligi.zya.me';
const API_KEY = 'sbsecret_sozboyligi2024'; // api.php da SECRET bilan bir xil

// ── TELEGRAM API ─────────────────────────────────────────────
function tgApi(method, body) {
    return new Promise((resolve) => {
        const data = JSON.stringify(body);
        const req  = https.request({
            hostname: 'api.telegram.org',
            path:     `/bot${TOKEN}/${method}`,
            method:   'POST',
            headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        }, (res) => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
        });
        req.on('error', () => resolve(null));
        req.write(data);
        req.end();
    });
}

function sendMsg(chatId, text, keyboard) {
    const body = { chat_id: chatId, text, parse_mode: 'HTML' };
    if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
    return tgApi('sendMessage', body);
}

// ── SAYTGA API SO'ROV ─────────────────────────────────────────
function siteApi(action, params) {
    return new Promise((resolve) => {
        const data = JSON.stringify({ action, ...params });
        const url  = new URL(`${SITE}/api.php`);
        const req  = https.request({
            hostname: url.hostname,
            path:     url.pathname,
            method:   'POST',
            headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        }, (res) => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
        });
        req.on('error', () => resolve(null));
        req.write(data);
        req.end();
    });
}

// ── XABAR HANDLERLARI ────────────────────────────────────────
async function handleMessage(msg) {
    const chatId = msg.chat.id;
    const text   = (msg.text || '').trim();
    const fn     = msg.from?.first_name || 'Salom';
    const tgUser = msg.from?.username || '';

    console.log(`MSG chat=${chatId} text=${text}`);

    // /start
    if (text.startsWith('/start')) {
        const param = text.slice(7).trim();

        // /start 256813 — 6 raqamli kod
        if (/^\d{6}$/.test(param)) {
            const res = await siteApi('verifyTgCode', { code: param, chatId: String(chatId), tgUsername: tgUser });
            console.log('verifyTgCode:', res);
            if (res?.success) {
                const loginToken = crypto.createHash('sha256').update(res.userId + API_KEY + new Date().toISOString().slice(0,10)).digest('hex');
                const loginUrl   = `${SITE}/student?tgtoken=${loginToken}&tguid=${encodeURIComponent(res.userId)}`;
                await sendMsg(chatId,
                    `✅ <b>Ulandi!</b>\n\n👤 Salom, <b>${res.username}</b>!\n🎓 ${res.className || 'Sinfsiz'}\n\nYangi so'zlar va testlar haqida xabarlar keladi!`,
                    [[{ text: '🌐 Saytga Kirish', url: loginUrl }]]
                );
            } else {
                await sendMsg(chatId,
                    "❌ Kod topilmadi yoki muddati tugadi.\n\nSaytdan yangi kod oling.",
                    [[{ text: '🌐 Sayt', url: `${SITE}/student` }]]
                );
            }
            return;
        }

        // Oddiy /start
        await sendMsg(chatId,
            `👋 Salom, <b>${fn}</b>!\n\n📚 <b>So'z Boyliklari</b> botiga xush kelibsiz!\n\nSaytga kiring → Profil → "Telegram" tugmasini bosing → 6 raqamli kod oling → /start KOD yuboring.`,
            [[{ text: '🌐 Saytga Kirish', url: `${SITE}/student` }]]
        );
        return;
    }

    // /help
    if (text === '/help') {
        await sendMsg(chatId, '📌 <b>Buyruqlar:</b>\n/start — Boshlash\n/help — Yordam\n/unlink — Uzish');
        return;
    }

    // /unlink
    if (text === '/unlink') {
        await siteApi('unlinkTelegram', { chatId: String(chatId) });
        await sendMsg(chatId, '✅ Saytdan uzildi.');
        return;
    }

    await sendMsg(chatId, '👋 /start yuboring.', [[{ text: '🌐 Sayt', url: `${SITE}/student` }]]);
}

// ── POLLING ──────────────────────────────────────────────────
let offset = 0;

async function poll() {
    // Webhookni o'chiramiz
    await tgApi('deleteWebhook', { drop_pending_updates: true });
    console.log('Bot ishga tushdi (polling)...');

    while (true) {
        try {
            const res = await tgApi('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
            if (res?.ok && res.result?.length) {
                for (const update of res.result) {
                    offset = update.update_id + 1;
                    if (update.message) await handleMessage(update.message).catch(e => console.error(e));
                }
            }
        } catch (e) {
            console.error('Poll error:', e.message);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

poll();
