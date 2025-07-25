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

async function startSession(sessionId, mode = 'qr', phoneNumber = null, res = null) {
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    mobile: true // ✅ هذا ما يجعل واتساب يظهر إشعار الاقتران
  });

  sessions[sessionId] = sock;
  sock.ev.on('creds.update', saveCreds);

  // ✅ طلب رمز الاقتران
  if (mode === 'pairing' && !sock.authState.creds.registered) {
    if (!phoneNumber) return res.json({ error: 'أدخل رقم الهاتف' });

    try {
      let code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
      code = code?.match(/.{1,4}/g)?.join('-') || code;
      return res.json({ pairingCode: code, sessionId });
    } catch (err) {
      console.error('❌ خطأ في توليد الرمز:', err.message);
      return res.json({ error: 'تعذر توليد الرمز' });
    }
  }

  // ✅ عند فتح الاتصال
  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      if (shouldReconnect) startSession(sessionId, mode, phoneNumber);
      else delete sessions[sessionId];
    }

    if (connection === 'open') {
      console.log(`✅ الجلسة ${sessionId} متصلة`);
    }
  });
}

// ✅ API لطلب رمز الاقتران
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

app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});
