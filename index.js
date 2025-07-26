const express = require('express');
const path = require('path');
const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 10000;
const sessions = {};

app.use(express.json());
app.use(express.static('public'));

// إنشاء جلسة مع توليد رمز الاقتران
async function startSession(sessionId, phone, res) {
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        mobile: true, // ✅ لتفعيل إشعار الاقتران في واتساب
        printQRInTerminal: false
    });

    sessions[sessionId] = sock;
    sock.ev.on('creds.update', saveCreds);

    try {
        let code = await sock.requestPairingCode(phone.replace(/[^0-9]/g, ''));
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        return res.json({ pairingCode: code });
    } catch (err) {
        console.error('❌ خطأ:', err.message);
        return res.json({ error: 'تعذر إنشاء الرمز' });
    }
}

app.post('/create-session', (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.json({ error: 'يرجى إدخال رقم الهاتف' });

    startSession('tarzan-session', phone, res);
});

app.listen(PORT, () => console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`));
