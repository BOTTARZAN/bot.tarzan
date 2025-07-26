const express = require('express');
const fs = require('fs');
const path = require('path');
const qrCode = require('qrcode');
const moment = require('moment-timezone');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 10000;
const PASSWORD = 'tarzanbot';
const sessions = {};
const msgStore = new Map();

// ✅ واجهة المستخدم
app.use(express.static('public'));
app.use(express.json());
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ✅ تحميل الأوامر
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
fs.readdirSync(commandsPath).forEach(file => {
  if (file.endsWith('.js')) {
    const command = require(`./commands/${file}`);
    if (typeof command === 'function') commands.push(command);
  }
});

// ✅ دالة تشغيل الجلسة
async function startSession(sessionId, res) {
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true
  });

  sessions[sessionId] = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr && res) {
      const qrData = await qrCode.toDataURL(qr);
      res.json({ qr: qrData });
      res = null;
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      if (shouldReconnect) startSession(sessionId);
      else delete sessions[sessionId];
    }

    if (connection === 'open') {
      console.log(`✅ جلسة ${sessionId} متصلة`);
      const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";

      const caption = `✨ *مرحباً بك في بوت طرزان الواقدي* ✨

✅ *تم ربط الجلسة بنجاح!*  
🔑 *معرف الجلسة:* \`${sessionId}\`

🧠 *أوامر مقترحة:*  
━━━━━━━━━━━━━━━  
• *tarzan* ⬅️ لعرض جميع الأوامر الجاهزة  
━━━━━━━━━━━━━━━  

⚡ *استمتع بالتجربة الآن!*`;

      await sock.sendMessage(selfId, {
        image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' },
        caption: caption,
        footer: "🤖 طرزان الواقدي - بوت الذكاء الاصطناعي ⚔️",
        buttons: [
          { buttonId: "help", buttonText: { displayText: "📋 عرض الأوامر" }, type: 1 },
          { buttonId: "menu", buttonText: { displayText: "📦 قائمة الميزات" }, type: 1 }
        ],
        headerType: 4
      });
    }
  });

  // ✅ منع الحذف
  sock.ev.on('messages.update', async updates => {
    for (const { key, update } of updates) {
      if (update?.message === null && key?.remoteJid && !key.fromMe) {
        try {
          const stored = msgStore.get(`${key.remoteJid}_${key.id}`);
          if (!stored?.message) return;

          const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";
          const senderJid = key.participant || stored.key?.participant || key.remoteJid;
          const number = senderJid?.split('@')[0] || 'مجهول';
          const name = stored.pushName || 'غير معروف';
          const type = Object.keys(stored.message)[0];
          const time = moment().tz("Asia/Riyadh").format("YYYY-MM-DD HH:mm:ss");

          await sock.sendMessage(selfId, { text: `🚫 *تم حذف رسالة!*\n👤 *الاسم:* ${name}\n📱 *الرقم:* wa.me/${number}\n🕒 *الوقت:* ${time}\n📂 *نوع الرسالة:* ${type}` });
          await sock.sendMessage(selfId, { forward: stored });
        } catch (err) {
          console.error('❌ خطأ في منع الحذف:', err.message);
        }
      }
    }
  });

  // ✅ استقبال الأوامر
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
        await command({ text, reply, sock, msg, from });
      } catch (err) {
        console.error('❌ خطأ أثناء تنفيذ الأمر:', err);
      }
    }
  });
}

// ✅ API Endpoints
app.post('/create-session', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.json({ error: 'أدخل اسم الجلسة' });
  if (sessions[sessionId]) return res.json({ message: 'الجلسة موجودة مسبقاً' });
  startSession(sessionId, res);
});

app.get('/sessions', (req, res) => {
  res.json(Object.keys(sessions));
});

app.post('/delete-session', (req, res) => {
  const { sessionId, password } = req.body;
  if (password !== PASSWORD) return res.json({ error: 'كلمة المرور غير صحيحة' });
  if (!sessions[sessionId]) return res.json({ error: 'الجلسة غير موجودة' });

  delete sessions[sessionId];
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.rmSync(sessionPath, { recursive: true, force: true });

  res.json({ message: `تم حذف الجلسة ${sessionId} بنجاح` });
});

app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});
