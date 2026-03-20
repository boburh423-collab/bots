// ═══════════════════════════════════════════════════
// SOZ BOYLIGI — NOTIFICATION SERVER (Render.com)
// Bu fayl faqat bildirishnomalar uchun
// Xabarlar esa bot.php (webhook) orqali ishlanadi
// ═══════════════════════════════════════════════════

const BOT_TOKEN  = '8623775032:AAFn3ESnMoWddva2kCecwuJx8TZRv7nceqs';
const SITE_URL   = 'https://soz-boyligi.zya.me';
const BOT_SECRET = 'sbsecret_sozboyligi2024';

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function log(msg) {
    const line = new Date().toLocaleTimeString() + ' ' + msg;
    console.log(line);
    fs.appendFileSync(path.join(DATA_DIR, 'notify_log.txt'), line + '\n');
}

// ── TELEGRAM XABAR YUBORISH ──────────────────────────
async function sendMsg(chatId, text, keyboard = null) {
    const body = { chat_id: chatId, text, parse_mode: 'HTML' };
    if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
    const data = JSON.stringify(body);
    const url  = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

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

// ── NOTIFICATION SERVER (port 3001) ──────────────────
// api.php bu portga 127.0.0.1:3001 ga so'rov yuboradi
http.createServer(async (req, res) => {
    if (req.method !== 'GET') { res.end('{}'); return; }

    const url    = new URL(req.url, `http://localhost:3001`);
    const secret = url.searchParams.get('secret');
    const action = url.searchParams.get('action');

    if (secret !== BOT_SECRET) {
        res.end(JSON.stringify({ ok: false, error: 'Ruxsat yoq' }));
        return;
    }

    // tg_users.json dan o'qish
    let tgUsers = [];
    try {
        const f = path.join(DATA_DIR, 'tg_users.json');
        if (fs.existsSync(f)) tgUsers = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch(e) { log('tg_users read error: ' + e.message); }

    let sent = 0;

    if (action === 'notify_words') {
        const count = url.searchParams.get('count') || 0;
        const words = decodeURIComponent(url.searchParams.get('words') || '');
        const text  = `📚 <b>Yangi so'zlar qo'shildi!</b>\n\n🔢 <b>${count} ta</b> yangi so'z\n📖 ${words}`;
        const kb    = [[{ text: "📚 Ko'rish", url: `${SITE_URL}/student` }]];
        for (const u of tgUsers) {
            if (u.chatId) { await sendMsg(u.chatId, text, kb); sent++; }
        }
        log(`notify_words sent=${sent}`);
    }

    if (action === 'notify_test') {
        const testName = decodeURIComponent(url.searchParams.get('testName') || 'Test');
        const qCount   = url.searchParams.get('qCount') || 0;
        const mins     = url.searchParams.get('mins') || 0;
        const text = `📝 <b>Yangi Test!</b>\n\n📌 <b>${testName}</b>\n📊 ${qCount} ta savol | ⏱ ${mins} daqiqa`;
        const kb   = [[{ text: '🚀 Testni Boshlash', url: `${SITE_URL}/student?tab=tests` }]];
        for (const u of tgUsers) {
            if (u.chatId) { await sendMsg(u.chatId, text, kb); sent++; }
        }
        log(`notify_test sent=${sent}`);
    }

    if (action === 'broadcast') {
        const text = decodeURIComponent(url.searchParams.get('msg') || '');
        if (text) {
            for (const u of tgUsers) {
                if (u.chatId) { await sendMsg(u.chatId, text); sent++; }
            }
            log(`broadcast sent=${sent}`);
        }
    }

    res.end(JSON.stringify({ ok: true, sent }));

}).listen(3001, () => log('Notification server ishga tushdi: port 3001'));

// ── HEALTH CHECK (Render uchun) ───────────────────────
// Render web service uchun HTTP server kerak
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('SOZ BOT NOTIFICATION SERVER - OK');
}).listen(process.env.PORT || 10000, () => {
    log('Health check server: port ' + (process.env.PORT || 10000));
});

log('Notification server ishga tushdi');
log('Xabarlar bot.php (webhook) orqali ishlanadi');
