// ============================================================
// 🤖 SOZ BOYLIGI TELEGRAM BOT — Node.js (Polling)
// npm install node-fetch   yoki   node 18+ (built-in fetch)
// node bot.js  yoki  pm2 start bot.js --name soz-bot
// ============================================================

const BOT_TOKEN = '8623775032:AAFn3ESnMoWddva2kCecwuJx8TZRv7nceqs';
const SITE_URL  = 'https://soz-boyligi.zya.me';
const BOT_SECRET = 'sbsecret_sozboyligi2024';

const fs        = require('fs');
const path      = require('path');
const http      = require('https');   // tgApi uchun (Telegram API = https)
const httpsLib  = require('https');   // fetchPost uchun
const httpLib   = require('http');    // fetchPost + notification server uchun

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── HELPERS ──────────────────────────────────────────────────
function log(msg) {
    const line = new Date().toLocaleTimeString() + ' ' + msg + '\n';
    fs.appendFileSync(path.join(DATA_DIR, 'bot_log.txt'), line);
    console.log(line.trim());
}

function readJson(file) {
    try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); }
    catch { return null; }
}

function writeJson(file, data) {
    fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// ── TELEGRAM API ─────────────────────────────────────────────
async function tgApi(method, body) {
    const url  = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
    const data = JSON.stringify(body);
    return new Promise((resolve) => {
        const req = http.request(url, {
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

// HTTP POST to site API — uses built-in fetch (Node 18+)
async function fetchPost(url, body) {
    try {
        log(`fetchPost -> ${url} body=${JSON.stringify(body).slice(0,80)}`);
        const res = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
            signal:  AbortSignal.timeout(10000), // 10 second timeout
        });
        const text = await res.text();
        log(`fetchPost <- status=${res.status} body=${text.slice(0,120)}`);
        try { return JSON.parse(text); }
        catch(e) { log(`fetchPost parse error: ${e.message} raw: ${text.slice(0,100)}`); return null; }
    } catch(e) {
        log(`fetchPost ERROR: ${e.message}`);
        return null;
    }
}

async function sendMsg(chatId, text, keyboard = null) {
    const body = { chat_id: chatId, text, parse_mode: 'HTML' };
    if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
    const res = await tgApi('sendMessage', body);
    if (!res?.ok) log(`sendMsg ERROR: ${JSON.stringify(res)}`);
    return res;
}

// ── HASH (SHA-256) ───────────────────────────────────────────
const crypto = require('crypto');
function sha256(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
}
function todayStr(offsetDays = 0) {
    // PHP date('Y-m-d') server local time ishlatadi
    // Biz ham UTC+5 (O'zbekiston) deb hisoblaymiz
    const d = new Date();
    d.setTime(d.getTime() + offsetDays * 86400000);
    // UTC+5 offset qo'shamiz
    const offset = 5 * 60; // minutes
    const localTime = new Date(d.getTime() + offset * 60000);
    return localTime.toISOString().slice(0, 10);
}

// ── XABAR HANDLERLARI ────────────────────────────────────────
async function handleMessage(msg) {
    const chatId    = msg.chat.id;
    // Normalize: remove @botname suffix from commands (e.g. /link@soz_boyligibot -> /link)
    const rawText   = (msg.text || '').trim();
    const text      = rawText.replace(/^(\/[a-zA-Z_]+)@[a-zA-Z0-9_]+/, '$1');
    const firstName = msg.from?.first_name || 'Foydalanuvchi';
    const tgUser    = msg.from?.username || '';

    log(`MSG chatId=${chatId} rawText=${rawText} text=${text}`);

    // ── /start ────────────────────────────────────────────────
    if (text.startsWith('/start')) {
        const param = text.slice(7).trim();

        if (param && param.includes('_')) {
            const lu     = param.lastIndexOf('_');
            const userId = param.slice(0, lu);
            const token  = param.slice(lu + 1);
            const exp    = sha256(userId + BOT_SECRET + todayStr());

            log(`START uid=${userId} exp=${exp.slice(0,8)} got=${token.slice(0,8)}`);

            if (exp === token) {
                const users = readJson('users.json') || [];
                const siteUser = users.find(u => u.id === userId);

                if (siteUser) {
                    // TG chatId ni saqlaymiz
                    const updated = users.map(u => {
                        if (u.id === userId) {
                            return { ...u, tgChatId: String(chatId), tgUsername: tgUser };
                        }
                        return u;
                    });
                    writeJson('users.json', updated);

                    // tg_users.json
                    let tgUsers = readJson('tg_users.json') || [];
                    const idx   = tgUsers.findIndex(u => u.userId === userId || u.chatId == chatId);
                    const entry = { userId, username: siteUser.username, chatId: String(chatId) };
                    if (idx >= 0) tgUsers[idx] = entry;
                    else tgUsers.push(entry);
                    writeJson('tg_users.json', tgUsers);

                    const loginToken = sha256(userId + BOT_SECRET + todayStr());
                    const loginUrl   = `${SITE_URL}/student?tgtoken=${loginToken}&tguid=${encodeURIComponent(userId)}`;

                    log(`SUCCESS user=${siteUser.username}`);

                    await sendMsg(chatId,
                        `✅ <b>Muvaffaqiyatli ulandi!</b>\n\n` +
                        `👤 Salom, <b>${siteUser.username}</b>!\n` +
                        `🎓 ${siteUser.className || 'Sinfsiz'}\n\n` +
                        `Endi yangi so'zlar va testlar haqida bildirishnomalar keladi!`,
                        [[{ text: '🌐 Saytga Kirish', url: loginUrl }]]
                    );
                    return;
                }

                log('USER NOT FOUND');
                await sendMsg(chatId, '❌ Foydalanuvchi topilmadi.\n\nSaytga kiring va qayta ulanishga urining.');
                return;
            }

            log('TOKEN MISMATCH');
            await sendMsg(chatId, "❌ Havola muddati o'tgan.\n\nSaytga kiring va profildan qayta ulang.");
            return;
        }

        // Oddiy /start
        await sendMsg(chatId,
            `👋 Salom, <b>${firstName}</b>!\n\n` +
            `📚 <b>So'z Boyliklari</b> botiga xush kelibsiz!\n\n` +
            `📌 <b>Ulash uchun:</b>\n` +
            `1. Saytga kiring\n` +
            `2. Profil → Telegram kodini oling\n` +
            `3. Bu yerga <code>/link XXXXXX</code> yuboring`,
            [[{ text: '🌐 Saytga Kirish', url: `${SITE_URL}/student` }]]
        );
        return;
    }

    // ── /help ─────────────────────────────────────────────────
    if (text === '/help') {
        await sendMsg(chatId,
            '📌 <b>Buyruqlar:</b>\n' +
            '/start          — Botni ishga tushirish\n' +
            '/link XXXXXX    — 6 xonali kod bilan ulash\n' +
            '/me             — Mening profilim\n' +
            '/unlink         — Telegram dan uzish\n' +
            '/help           — Yordam\n\n' +
            '📌 Ulash uchun saytdagi profildan kodni oling va /link 123456 yuboring.'
        );
        return;
    }

    // ── /me ───────────────────────────────────────────────────
    if (text === '/me') {
        const users    = readJson('users.json') || [];
        const siteUser = users.find(u => String(u.tgChatId) === String(chatId));
        if (siteUser) {
            await sendMsg(chatId,
                `👤 <b>Profilingiz</b>\n\n` +
                `🏷️ Ism: <b>${siteUser.username}</b>\n` +
                `🎓 Sinf: ${siteUser.className || 'Sinfsiz'}\n` +
                `⭐ Ball: <b>${siteUser.gameScore || 0}</b>`
            );
        } else {
            await sendMsg(chatId, '❌ Siz saytga ulanmagan.\n\n/start orqali ulaning.');
        }
        return;
    }

    // ── /link CODE ────────────────────────────────────────────
    if (text.startsWith('/link')) {
        const code = text.slice(6).trim().replace(/\s+/g, '');
        if (!code || !/^\d{6}$/.test(code)) {
            await sendMsg(chatId,
                "❌ Noto\u02BBg\u02BBri format.\n\n" +
                'Foydalanish: <code>/link 123456</code>\n\n' +
                '📌 Saytdagi profilingizdan 6 xonali kodni oling.'
            );
            return;
        }

        // Verify code via API
        try {
            const apiUrl = SITE_URL + '/api.php';
            log(`/link sending to ${apiUrl} code=${code} chatId=${chatId}`);
            const resp = await fetchPost(apiUrl, {
                action:     'verifyTgCode',
                code,
                chatId:     String(chatId),
                tgUsername: tgUser,
                secret:     BOT_SECRET,
            });
            log(`/link response: ${JSON.stringify(resp)}`);

            if (resp && resp.success) {
                const loginToken = sha256(resp.userId + BOT_SECRET + todayStr());
                const loginUrl   = `${SITE_URL}/student?tgtoken=${loginToken}&tguid=${encodeURIComponent(resp.userId)}`;
                await sendMsg(chatId,
                    `✅ <b>Muvaffaqiyatli ulandi!</b>\n\n` +
                    `👤 Salom, <b>${resp.username}</b>!\n\n` +
                    `Endi yangi so'zlar va testlar haqida bildirishnomalar olasiz!`,
                    [[{ text: '🌐 Saytga Kirish', url: loginUrl }]]
                );
            } else {
                const errMsg = resp?.message || "Kod noto'g'ri";
                await sendMsg(chatId,
                    `❌ <b>${errMsg}</b>\n\n` +
                    `📌 Saytdan yangi kod oling va qayta urining.`
                );
            }
        } catch(e) {
            log(`/link error: ${e.message}`);
            log(`/link stack: ${e.stack}`);
            await sendMsg(chatId, '❌ Serverga ulanishda xato. Bot log ga qarang.');
        }
        return;
    }

    // ── /unlink ───────────────────────────────────────────────
    if (text === '/unlink') {
        let tgUsers = readJson('tg_users.json') || [];
        const before  = tgUsers.length;
        tgUsers = tgUsers.filter(u => String(u.chatId) !== String(chatId));
        writeJson('tg_users.json', tgUsers);

        const users   = readJson('users.json') || [];
        const updated = users.map(u => {
            if (String(u.tgChatId) === String(chatId)) {
                const { tgChatId, tgUsername, ...rest } = u;
                return rest;
            }
            return u;
        });
        writeJson('users.json', updated);

        const msg = tgUsers.length < before
            ? '✅ Muvaffaqiyatli uzildi.'
            : '⚠️ Siz ulangan emassiz.';
        await sendMsg(chatId, msg);
        return;
    }

    // Default - show menu
    await sendMsg(chatId,
        '📌 Buyruqlar:\n' +
        '/link XXXXXX — Saytga ulash\n' +
        '/me — Profilim\n' +
        '/unlink — Uzish\n' +
        '/help — Yordam'
    );
}

// ── NOTIFICATION FUNKSIYALARI (api.php dan chaqiriladi) ───────
// Bu funksiyalar faqat bot.js ichida ishlatiladi
// api.php internal endpoint o'rniga bu fayl orqali ishlaydi

// ── POLLING ──────────────────────────────────────────────────
let offset = 0;
let running = true;

async function poll() {
    while (running) {
        try {
            const res = await tgApi('getUpdates', {
                offset,
                timeout: 30,
                allowed_updates: ['message'],
            });

            if (res?.ok && res.result?.length) {
                for (const update of res.result) {
                    offset = update.update_id + 1;
                    if (update.message) {
                        await handleMessage(update.message).catch(e => log(`ERR: ${e.message}`));
                    }
                }
            }
        } catch (e) {
            log(`POLL ERROR: ${e.message}`);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

// ── NOTIFICATION SERVER (ixtiyoriy: local HTTP server) ────────
// api.php bu portga so'rov yuboradi
const NOTIFY_PORT = 3001;
// Notification HTTP server
httpLib.createServer(async (req, res) => {
    if (req.method !== 'GET') { res.end('{}'); return; }

    const url    = new URL(req.url, `http://localhost:${NOTIFY_PORT}`);
    const secret = url.searchParams.get('secret');
    const action = url.searchParams.get('action');

    if (secret !== BOT_SECRET) { res.end(JSON.stringify({ok: false})); return; }

    const tgUsers = readJson('tg_users.json') || [];
    let sent = 0;

    if (action === 'notify_words') {
        const count = url.searchParams.get('count') || 0;
        const words = decodeURIComponent(url.searchParams.get('words') || '');
        const text  = `📚 <b>Yangi so'zlar qo'shildi!</b>\n\n🔢 <b>${count} ta</b> yangi so'z\n📖 ${words}`;
        for (const u of tgUsers) {
            if (u.chatId) { await sendMsg(u.chatId, text, [[{text:"📚 Ko'rish", url:`${SITE_URL}/student`}]]); sent++; }
        }
    }

    if (action === 'notify_test') {
        const testName = decodeURIComponent(url.searchParams.get('testName') || 'Test');
        const qCount   = url.searchParams.get('qCount') || 0;
        const mins     = url.searchParams.get('mins') || 0;
        const text = `📝 <b>Yangi Test!</b>\n\n📌 <b>${testName}</b>\n📊 ${qCount} ta savol | ⏱ ${mins} daqiqa`;
        for (const u of tgUsers) {
            if (u.chatId) { await sendMsg(u.chatId, text, [[{text:'🚀 Testni Boshlash', url:`${SITE_URL}/student?tab=tests`}]]); sent++; }
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

    res.end(JSON.stringify({ok: true, sent}));
}).listen(NOTIFY_PORT, () => log(`Notification server: port ${NOTIFY_PORT}`));

// ── START ─────────────────────────────────────────────────────
log('Bot ishga tushdi (polling mode)...');

// Eski webhookni o'chiramiz (polling bilan to'qnashinmasin)
tgApi('deleteWebhook', {drop_pending_updates: true}).then(r => {
    log('Webhook deleted: ' + JSON.stringify(r?.ok));
    poll();
});

process.on('SIGINT',  () => { running = false; log('Bot to\'xtatildi.'); process.exit(0); });
process.on('SIGTERM', () => { running = false; log('Bot to\'xtatildi.'); process.exit(0); });
