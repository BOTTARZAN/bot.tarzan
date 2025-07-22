const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidDecode } = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const path = require('path');
const qrCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static('public'));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// تحميل الأوامر من مجلد commands
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
fs.readdirSync(commandsPath).forEach(file => {
  if (file.endsWith('.js')) {
    const command = require(`./commands/${file}`);
    if (typeof command === 'function') commands.push(command);
  }
});

const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      await qrCode.toFile('./public/qr.png', qr).catch(err => console.error('QR Error:', err));
      console.log('✅ تم حفظ رمز QR في ./public/qr.png');
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      console.log('📴 تم قطع الاتصال. إعادة الاتصال:', shouldReconnect);
      if (shouldReconnect) startSock();
    }

    if (connection === 'open') {
      console.log('✅ تم الاتصال بواتساب بنجاح');

      const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";
      await sock.sendMessage(selfId, {
        image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' },
        caption: `✨ *مرحباً بك في بوت طرزان الواقدي* ✨

✅ تم ربط الرقم بنجاح.

🧠 *أوامر مقترحة:*
• *video* لتحميل الفيديوهات
• *mp3* لتحويل الصوتيات
• *insta* لتحميل من انستجرام
• *help* لعرض جميع الأوامر

⚡ استمتع بالتجربة!`,
        footer: "🤖 طرزان الواقدي - بوت الذكاء الاصطناعي ⚔️",
        buttons: [
          { buttonId: "help", buttonText: { displayText: "📋 عرض الأوامر" }, type: 1 },
          { buttonId: "menu", buttonText: { displayText: "📦 قائمة الميزات" }, type: 1 }
        ],
        headerType: 4
      });

      console.log("📩 تم إرسال رسالة ترحيب فخمة للرقم المرتبط.");
    }
  });

  // ✅ ميزة منع حذف الرسائل
  sock.ev.on('messages.update', async updates => {
    for (const { key, update } of updates) {
      if (update?.message === null && key?.remoteJid && key?.fromMe === false) {
        try {
          const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";
          const chat = await sock.loadMessage(key.remoteJid, key.id);
          if (!chat?.message) return;

          await sock.sendMessage(selfId, {
            forward: chat,
            text: `🚫 *تم حذف رسالة من*: ${key.participant.split('@')[0]}`
          });
        } catch (err) {
          console.error('❌ خطأ في منع الحذف:', err.message);
        }
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message) return;

    const from = msg.key.remoteJid;
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
};

startSock();
app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});
