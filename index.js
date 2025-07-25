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

app.use(express.static('public'));
app.use(express.json());
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// تحميل الأوامر (لو عندك أوامر في مجلد commands)
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

async function startSession(sessionId, mode = 'qr', phoneNumber = null, res = null) {
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  // هنا نمرر mobile: true ليظهر إشعار الجهاز الجديد في واتساب
  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true,
    mobile: true  // <- هذه الخاصية مهمة جداً لإشعارات الاقتران!
  });

  sessions[sessionId] = sock;
  sock.ev.on('creds.update', saveCreds);

  // طلب رمز الاقتران
  if (mode === 'pairing' && !sock.authState.creds.registered) {
    if (!phoneNumber) {
      if (res) return res.json({ error: 'يرجى إدخال رقم الهاتف' });
      return;
    }
    try {
      let code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
      code = code?.match(/.{1,4}/g)?.join('-') || code;
      if (res) return res.json({ pairingCode: code, sessionId });
    } catch (err) {
      console.error('❌ خطأ في توليد رمز الاقتران:', err.message);
      if (res) return res.json({ error: 'تعذر توليد رمز الاقتران' });
    }
  }

  // تحديثات الاتصال
  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (mode === 'qr' && qr && res) {
      const qrData = await qrCode.toDataURL(qr);
      res.json({ qr: qrData });
      res = null;
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      console.log(`⚠️ اتصال مفقود للجلسة ${sessionId}, إعادة الاتصال: ${shouldReconnect}`);
      if (shouldReconnect) startSession(sessionId, mode, phoneNumber);
      else delete sessions[sessionId];
    }

    if (connection === 'open') {
      console.log(`✅ جلسة ${sessionId} متصلة`);

      // ترسل رسالة ترحيبية (اختياري)
      const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";
      const caption = `✨ *تم ربط الجلسة بنجاح!*  
🔑 *معرف الجلسة:* \`${sessionId}\``;

      await sock.sendMessage(selfId, {
        text: caption
      });
    }
  });

  // استماع للرسائل (مثال بسيط)
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

// API Endpoints
app.post('/create-session', (req, res) => {
  const { sessionId, mode, phone } = req.body;
  if (!sessionId) return res.json({ error: 'أدخل اسم الجلسة' });
  if (sessions[sessionId]) return res.json({ message: 'الجلسة موجودة مسبقاً' });
  if (mode === 'pairing') {
    startSession(sessionId, 'pairing', phone, res);
  } else {
    startSession(sessionId, 'qr', null, res);
  }
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
