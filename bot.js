// ═══════════════════════════════════════════════════
// SOZ BOYLIGI — TELEGRAM BOT (Polling mode)
// Render.com da ishlaydi: node bot.js
// ═══════════════════════════════════════════════════

const BOT_TOKEN  = '8623775032:AAFn3ESnMoWddva2kCecwuJx8TZRv7nceqs';
const SITE_URL   = 'https://soz-boyligi.zya.me';
const BOT_SECRET = 'sbsecret_sozboyligi2024';

const fs     = require('fs');
const path   = require('path');
const https  = require('https');
const http   = require('http');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── LOG ─────────────────────────────────────────────
function log(msg) {
    const line = new Date().toLocaleTimeString() + ' ' + msg;
    console.log(line);
    fs.appendFileSync(path.join(DATA_DIR, 'bot_log.txt'), line + '\n');
}

// ── HASH ────────────────────────────────────────────
function sha256(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
}

function todayStr() {
    // UTC+5 (O'zbekiston)
    const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
}

// ── TELEGRAM API ─────────────────────────────────────
async function tgApi(method, body) {
    const url  = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
    const data = JSON.stringify(body);
    return new Promise((resolve) => {
        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type':   'application/json',
                'Content-Length': Buffer.byteLength(data),
            }
        }, (res) => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.write(data);
        req.end();
    });
}

async function sendMsg(chatId, text, keyboard = null) {
    const body = { chat_id: chatId, text, parse_mode: 'HTML' };
    if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
    const res = await tgApi('sendMessage', body);
    if (!res?.ok) log(`sendMsg ERROR: ${JSON.stringify(res)}`);
    return res;
}

// ── SITE API — bot.php orqali (DDoS himoyadan o'tadi) ──
// bot.php sayt serverida, unga murojaat Telegram serveridan kelgandek ko'rinadi
// Internal endpoint: bot.php?internal=1&secret=...&action=...
async function siteApi(action, params = {}) {
    const qs = new URLSearchParams({
        internal: '1',
        secret:   BOT_SECRET,
        action,
        ...params,
    });
    const url = `${SITE_URL}/bot.php?${qs.toString()}`;
    log(`siteApi -> ${action} ${url.slice(0, 100)}`);

    return new Promise((resolve) => {
        const lib    = url.startsWith('https') ? https : http;
        const urlObj = new URL(url);
        const req    = lib.request({
            hostname: urlObj.hostname,
            port:     urlObj.port || 443,
            path:     urlObj.pathname + urlObj.search,
            method:   'GET',
            headers:  { 'User-Agent': 'TelegramBot/1.0' },
        }, (res) => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                log(`siteApi <- status=${res.statusCode} body=${raw.slice(0, 100)}`);
                try { resolve(JSON.parse(raw)); }
                catch(e) {
                    log(`siteApi parse error: ${e.message} raw: ${raw.slice(0, 80)}`);
                    resolve(null);
                }
            });
        });
        req.on('error', (e) => { log(`siteApi ERROR: ${e.message}`); resolve(null); });
        req.setTimeout(10000, () => { log('siteApi TIMEOUT'); req.destroy(); resolve(null); });
        req.end();
    });
}

// ── XABAR HANDLER ───────────────────────────────────
async function handleMessage(msg) {
    const chatId    = msg.chat.id;
    const rawText   = (msg.text || '').trim();
    // /command@botname → /command
    const text      = rawText.replace(/^(\/[a-zA-Z_]+)@\S+/, '$1');
    const firstName = msg.from?.first_name || 'Foydalanuvchi';
    const tgUser    = msg.from?.username   || '';

    log(`MSG chatId=${chatId} text=${text}`);

    // ── /start ────────────────────────────────────────
    if (text.startsWith('/start')) {
        const param = text.slice(7).trim();

        if (param && param.includes('_')) {
            const lu     = param.lastIndexOf('_');
            const userId = param.slice(0, lu);
            const token  = param.slice(lu + 1);
            const exp    = sha256(userId + BOT_SECRET + todayStr());

            if (exp === token) {
                const d = await siteApi('verifyStartLink', { userId, chatId: String(chatId), tgUsername: tgUser });
                if (d && d.ok) {
                    const loginToken = sha256(d.userId + BOT_SECRET + todayStr());
                    const loginUrl   = `${SITE_URL}/student?tgtoken=${loginToken}&tguid=${encodeURIComponent(d.userId)}`;
                    await sendMsg(chatId,
                        `✅ <b>Muvaffaqiyatli ulandi!</b>\n\n👤 Salom, <b>${d.username}</b>!\n\nEndi yangi so'zlar va testlar haqida bildirishnomalar olasiz!`,
                        [[{ text: '🌐 Saytga Kirish', url: loginUrl }]]
                    );
                    return;
                }
                await sendMsg(chatId, '❌ Foydalanuvchi topilmadi. Saytga qayta kiring.');
                return;
            }
            await sendMsg(chatId, "❌ Havola muddati o'tgan. Saytga kiring va qayta ulang.");
            return;
        }

        await sendMsg(chatId,
            `👋 Salom, <b>${firstName}</b>!\n\n` +
            `📚 <b>So'z Boyliklari</b> botiga xush kelibsiz!\n\n` +
            `📌 Saytga ulash uchun:\n` +
            `1. Saytga kiring → Profil\n` +
            `2. Telegram kodini oling (6 raqam)\n` +
            `3. Bu yerga /link XXXXXX yuboring`,
            [[{ text: '🌐 Saytga Kirish', url: `${SITE_URL}/student` }]]
        );
        return;
    }

    // ── /link XXXXXX ──────────────────────────────────
    if (text.startsWith('/link')) {
        const parts = text.trim().split(/\s+/);
        const code  = (parts[1] || '').trim();

        if (!code || !/^\d{6}$/.test(code)) {
            await sendMsg(chatId,
                "❌ Format xato.\n\n" +
                "To'g'ri format: /link 123456\n\n" +
                "📌 Saytga kiring → Profil → Telegram kodini oling."
            );
            return;
        }

        await sendMsg(chatId, '⏳ Tekshirilmoqda...');

        const d = await siteApi('verifyTgCode', {
            code,
            chatId:     String(chatId),
            tgUsername: tgUser,
        });

        if (d && d.ok) {
            const loginToken = sha256(d.userId + BOT_SECRET + todayStr());
            const loginUrl   = `${SITE_URL}/student?tgtoken=${loginToken}&tguid=${encodeURIComponent(d.userId)}`;
            await sendMsg(chatId,
                `✅ <b>Muvaffaqiyatli ulandi!</b>\n\n👤 Salom, <b>${d.username}</b>!\n\nEndi yangi so'zlar va testlar haqida bildirishnomalar olasiz!`,
                [[{ text: '🌐 Saytga Kirish', url: loginUrl }]]
            );
        } else {
            const err = d?.error || "Kod xato yoki topilmadi";
            await sendMsg(chatId,
                `❌ <b>${err}</b>\n\n📌 Saytdan yangi kod oling va qayta urining.`
            );
        }
        return;
    }

    // ── /me ───────────────────────────────────────────
    if (text === '/me') {
        const d = await siteApi('getTgUserInfo', { chatId: String(chatId) });
        if (d && d.ok && d.username) {
            await sendMsg(chatId,
                `👤 <b>Profilingiz</b>\n\n` +
                `🏷️ Ism: <b>${d.username}</b>\n` +
                `🎓 Sinf: ${d.className || 'Sinfsiz'}\n` +
                `⭐ Ball: <b>${d.score || 0}</b>`
            );
        } else {
            await sendMsg(chatId, '❌ Siz saytga ulanmagan.\n\n/link XXXXXX orqali ulaning.');
        }
        return;
    }

    // ── /unlink ───────────────────────────────────────
    if (text === '/unlink') {
        const d = await siteApi('unlinkTgUser', { chatId: String(chatId) });
        const msg = (d && d.ok) ? '✅ Muvaffaqiyatli uzildi.' : '⚠️ Siz ulangan emassiz.';
        await sendMsg(chatId, msg);
        return;
    }

    // ── /help ─────────────────────────────────────────
    if (text === '/help') {
        await sendMsg(chatId,
            '📌 <b>Buyruqlar:</b>\n\n' +
            '/link 123456 — Saytga ulash\n' +
            '/me          — Mening profilim\n' +
            '/unlink      — Telegram dan uzish\n' +
            '/help        — Yordam\n\n' +
            '📌 Ulash: Sayt → Profil → Kodni oling → /link XXXXXX yuboring'
        );
        return;
    }

    // ── Default ───────────────────────────────────────
    await sendMsg(chatId,
        '📌 Buyruqlar:\n' +
        '/link 123456 — Saytga ulash\n' +
        '/me — Profilim\n' +
        '/unlink — Uzish\n' +
        '/help — Yordam'
    );
}

// ── POLLING ──────────────────────────────────────────
let offset  = 0;
let running = true;

async function poll() {
    log('Bot ishga tushdi (polling mode)...');
    // Eski webhook ni o'chirish (polling bilan ziddiyat qilmasin)
    await tgApi('deleteWebhook', { drop_pending_updates: true });
    log('Webhook deleted, polling boshlandi');

    while (running) {
        try {
            const res = await tgApi('getUpdates', {
                offset,
                timeout:          25,
                allowed_updates:  ['message'],
            });

            if (res?.ok && res.result?.length) {
                for (const update of res.result) {
                    offset = update.update_id + 1;
                    if (update.message) {
                        await handleMessage(update.message).catch(e => log(`ERR: ${e.message}`));
                    }
                }
            }
        } catch(e) {
            log(`POLL ERROR: ${e.message}`);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

// ── NOTIFICATION SERVER (port 3001) ──────────────────
// api.php bu portga so'rov yuboradi (127.0.0.1:3001)
http.createServer(async (req, res) => {
    if (req.method !== 'GET') { res.end('{}'); return; }
    const url    = new URL(req.url, `http://localhost:3001`);
    const secret = url.searchParams.get('secret');
    const action = url.searchParams.get('action');
    if (secret !== BOT_SECRET) { res.end(JSON.stringify({ ok: false })); return; }

    // Read tg_users from DATA_DIR (bot.js data folder)
    let tgUsers = [];
    try {
        const f = path.join(DATA_DIR, 'tg_users.json');
        if (fs.existsSync(f)) tgUsers = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {}

    let sent = 0;

    if (action === 'notify_words') {
        const count = url.searchParams.get('count') || 0;
        const words = decodeURIComponent(url.searchParams.get('words') || '');
        const text  = `📚 <b>Yangi so'zlar qo'shildi!</b>\n\n🔢 <b>${count} ta</b> yangi so'z\n📖 ${words}`;
        for (const u of tgUsers) {
            if (u.chatId) { await sendMsg(u.chatId, text, [[{ text: "📚 Ko'rish", url: `${SITE_URL}/student` }]]); sent++; }
        }
    }

    if (action === 'notify_test') {
        const testName = decodeURIComponent(url.searchParams.get('testName') || 'Test');
        const qCount   = url.searchParams.get('qCount') || 0;
        const mins     = url.searchParams.get('mins') || 0;
        const text = `📝 <b>Yangi Test!</b>\n\n📌 <b>${testName}</b>\n📊 ${qCount} ta savol | ⏱ ${mins} daqiqa`;
        for (const u of tgUsers) {
            if (u.chatId) { await sendMsg(u.chatId, text, [[{ text: '🚀 Testni Boshlash', url: `${SITE_URL}/student?tab=tests` }]]); sent++; }
        }
    }

    if (action === 'broadcast') {
        const text = decodeURIComponent(url.searchParams.get('msg') || '');
        if (text) {
            for (const u of tgUsers) {
                if (u.chatId) { await sendMsg(u.chatId, text); sent++; }
            }
        }
    }

    res.end(JSON.stringify({ ok: true, sent }));
}).listen(3001, () => log('Notification server: port 3001'));

// ── START ─────────────────────────────────────────────
poll();

process.on('SIGINT',  () => { running = false; log('Bot to\'xtatildi.'); process.exit(0); });
process.on('SIGTERM', () => { running = false; log('Bot to\'xtatildi.'); process.exit(0); });
