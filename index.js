const baileys = require('@whiskeysockets/baileys');
const makeWASocket = baileys.default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

const express = require('express');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static('public'));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// تحميل الأوامر من مجلد commands
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    fs.readdirSync(commandsPath).forEach(file => {
        if (file.endsWith('.js')) {
            const command = require(`./commands/${file}`);
            if (typeof command === 'function') commands.push(command);
        }
    });
}

// تخزين الجلسات
const sessions = new Map();

async function startSock(sessionId) {
    const authDir = path.join('auth_info', sessionId);
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true
    });

    sock.ev.on('creds.update', saveCreds);

    const msgStore = new Map();

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log(`📴 الجلسة ${sessionId} انقطعت. إعادة الاتصال:`, shouldReconnect);
            if (shouldReconnect) startSock(sessionId);
            else sessions.delete(sessionId);
        }

        if (connection === 'open') {
            console.log(`✅ الجلسة ${sessionId} متصلة`);

            const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";
            await sock.sendMessage(selfId, {
                image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' },
                caption: `✨ *مرحباً بك في بوت طرزان الواقدي* ✨

✅ *تم ربط الجلسة بنجاح!*  
🔑 *معرف الجلسة:* \`${sessionId}\`

🧠 *أوامر مقترحة:*  
━━━━━━━━━━━━━━━  
• *tarzan* ⬅️ لعرض جميع الأوامر  
━━━━━━━━━━━━━━━  

⚡ *استمتع بالتجربة الآن!*`,
                footer: "🤖 طرزان الواقدي ⚔️",
                buttons: [
                    { buttonId: "help", buttonText: { displayText: "📋 عرض الأوامر" }, type: 1 },
                    { buttonId: "menu", buttonText: { displayText: "📦 قائمة الميزات" }, type: 1 }
                ],
                headerType: 4
            });
        }
    });

    // منع حذف الرسائل
    sock.ev.on('messages.update', async updates => {
        for (const { key, update } of updates) {
            if (update?.message === null && key?.remoteJid && !key.fromMe) {
                try {
                    const stored = msgStore.get(`${key.remoteJid}_${key.id}`);
                    if (!stored?.message) return;

                    const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";
                    const senderJid = key.participant || stored.key?.participant || key.remoteJid;
                    const number = senderJid?.split('@')[0];
                    const name = stored.pushName || 'غير معروف';
                    const type = Object.keys(stored.message)[0];
                    const time = moment().tz("Asia/Riyadh").format("YYYY-MM-DD HH:mm:ss");

                    const infoMessage =
                        `🚫 *تم حذف رسالة!*\n👤 ${name}\n📱 wa.me/${number}\n🕒 ${time}\n📂 ${type}`;

                    await sock.sendMessage(selfId, { text: infoMessage });
                    await sock.sendMessage(selfId, { forward: stored });

                } catch (err) {
                    console.error('❌ خطأ منع الحذف:', err.message);
                }
            }
        }
    });

    // استقبال الأوامر
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg?.message) return;

        const from = msg.key.remoteJid;
        const msgId = msg.key.id;
        msgStore.set(`${from}_${msgId}`, msg);

        const text = msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.buttonsResponseMessage?.selectedButtonId;

        if (!text) return;

        const reply = async (message, buttons = null) => {
            if (buttons && Array.isArray(buttons)) {
                await sock.sendMessage(from, {
                    text: message,
                    buttons: buttons.map(b => ({ buttonId: b.id, buttonText: { displayText: b.text }, type: 1 })),
                    headerType: 1
                }, { quoted: msg });
            } else {
                await sock.sendMessage(from, { text: message }, { quoted: msg });
            }
        };

        for (const command of commands) {
            try {
                await command({ text, reply, sock, msg, from, sessionId });
            } catch (err) {
                console.error('❌ خطأ تنفيذ الأمر:', err);
            }
        }
    });

    sessions.set(sessionId, { sock, state, saveCreds, msgStore });
    return sock;
}

// إعادة تشغيل الجلسات السابقة عند تشغيل السيرفر
if (fs.existsSync('./auth_info')) {
    const dirs = fs.readdirSync('./auth_info');
    for (const dir of dirs) {
        startSock(dir).catch(console.error);
    }
}

// ✅ API طلب رمز الاقتران
app.post('/pair', async (req, res) => {
    try {
        const { number, sessionId } = req.body;
        if (!number || !sessionId) return res.status(400).json({ error: 'أدخل الرقم ومعرف الجلسة' });

        if (sessions.has(sessionId)) {
            const session = sessions.get(sessionId);
            if (session.sock.authState.creds.registered) {
                return res.status(400).json({ error: 'الجهاز مرتبط بالفعل' });
            }
            const code = await session.sock.requestPairingCode(number.trim(), 'server'); // ✅ إضافة المعامل server
            return res.json({ pairingCode: code });
        }

        await startSock(sessionId);
        const session = sessions.get(sessionId);
        if (!session) return res.status(500).json({ error: 'فشل إنشاء الجلسة' });

        const code = await session.sock.requestPairingCode(number.trim(), 'server'); // ✅ نفس الشيء هنا
        return res.json({ pairingCode: code });

    } catch (err) {
        console.error('❌ خطأ في توليد الرمز:', err);
        res.status(500).json({ error: 'فشل إنشاء الرمز' });
    }
});

// API لفحص الجلسات
app.get('/sessions', (req, res) => {
    const activeSessions = Array.from(sessions.keys()).map(id => ({
        id,
        connected: sessions.get(id)?.sock?.user ? true : false,
        lastActive: moment().tz("Asia/Riyadh").format("YYYY-MM-DD HH:mm:ss")
    }));
    res.json(activeSessions);
});

// حذف جلسة
app.post('/delete-session', async (req, res) => {
    try {
        const { password, sessionId } = req.body;
        if (password !== '12345') return res.status(403).json({ error: 'كلمة المرور غير صحيحة' });
        if (!sessionId) return res.status(400).json({ error: 'يجب تحديد معرف الجلسة' });

        if (sessions.has(sessionId)) {
            const session = sessions.get(sessionId);
            await session.sock.logout();
            sessions.delete(sessionId);

            const authDir = path.join('auth_info', sessionId);
            if (fs.existsSync(authDir)) {
                fs.rmSync(authDir, { recursive: true, force: true });
            }

            return res.json({ message: `✅ تم حذف الجلسة ${sessionId} بنجاح` });
        } else {
            return res.status(404).json({ error: 'الجلسة غير موجودة' });
        }
    } catch (err) {
        console.error('❌ خطأ حذف الجلسة:', err);
        res.status(500).json({ error: 'فشل الحذف' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});
