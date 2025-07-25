const express = require('express');
const fs = require('fs');
const path = require('path');
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

// ✅ إنشاء جلسة جديدة باستخدام رمز الاقتران
async function startSession(sessionId, res, phoneNumber) {
  try {
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      generateHighQualityLinkPreview: true,
      mobile: true, // ✅ تفعيل Mobile API لظهور إشعار إدخال رمز
      browser: ['Android', 'Chrome', '121.0.6167.178'] // ✅ تقليد جهاز رسمي
    });

    sessions[sessionId] = sock;
    sock.ev.on('creds.update', saveCreds);

    // ✅ إنشاء رمز الاقتران
    if (!sock.authState.creds.registered) {
      if (!phoneNumber) {
        return res.json({ error: 'يرجى إدخال رقم الهاتف مع رمز الدولة' });
      }

      const formattedPhone = phoneNumber.replace(/[^0-9]/g, '');
      console.log(`📱 جاري إنشاء رمز الاقتران للرقم: ${formattedPhone}`);

      const code = await sock.requestPairingCode(formattedPhone);
      console.log(`✅ رمز الاقتران: ${code}`);
      return res.json({ pairingCode: code });
    }

    // ✅ عند الاتصال
    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        console.log(`✅ الجلسة ${sessionId} متصلة الآن`);
        const selfId = sock.user.id.split(':')[0] + '@s.whatsapp.net';

        const caption = `✨ *مرحباً بك في بوت طرزان الواقدي* ✨

✅ *تم ربط الجلسة بنجاح!*  
🔑 *معرف الجلسة:* \`${sessionId}\`

⚡ *استمتع بالتجربة الآن!*`;

        await sock.sendMessage(selfId, {
          text: caption
        });
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
        if (shouldReconnect) startSession(sessionId);
        else delete sessions[sessionId];
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
  } catch (error) {
    console.error('❌ خطأ أثناء إنشاء الجلسة:', error);
    if (res) res.json({ error: 'فشل إنشاء الجلسة' });
  }
}

// ✅ API لإنشاء جلسة مع رمز الاقتران
app.post('/create-session', (req, res) => {
  const { sessionId, phoneNumber } = req.body;
  if (!sessionId || !phoneNumber) {
    return res.json({ error: 'أدخل اسم الجلسة ورقم الهاتف' });
  }
  if (sessions[sessionId]) return res.json({ message: 'الجلسة موجودة مسبقاً' });
  startSession(sessionId, res, phoneNumber);
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
