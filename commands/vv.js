const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = async ({ sock, msg, text }) => {
  if (text !== 'vv') return;

  const senderJid = msg.key.participant || msg.key.remoteJid;
  const selfJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

  // ✅ التحقق من الصلاحية
  if (senderJid !== selfJid) {
    await sock.sendMessage(senderJid, { text: '🚫 ليس لديك صلاحية لتنفيذ هذا الأمر' }, { quoted: msg });
    return;
  }

  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted) {
    await sock.sendMessage(senderJid, { text: '⚠️ يرجى الرد على رسالة تحتوي على وسائط (عرض لمرة واحدة)' }, { quoted: msg });
    return;
  }

  const mediaType = Object.keys(quoted)[0]; // imageMessage or videoMessage
  const viewOnceMsg = quoted[mediaType];
  const isViewOnce = viewOnceMsg?.viewOnce === true;

  if (!isViewOnce || (mediaType !== 'imageMessage' && mediaType !== 'videoMessage')) {
    await sock.sendMessage(senderJid, { text: '⚠️ هذه الرسالة ليست وسائط عرض لمرة واحدة' }, { quoted: msg });
    return;
  }

  try {
    // ✅ تحميل الوسائط
    const mediaBuffer = await downloadMediaMessage(
      {
        key: msg.message.extendedTextMessage.contextInfo,
        message: quoted,
      },
      'buffer',
      {},
      { logger: console }
    );

    // ✅ إرسال النتيجة فقط للبوت نفسه
    if (mediaType === 'imageMessage') {
      await sock.sendMessage(selfJid, {
        image: mediaBuffer,
        caption: '✅ تم استعادة الصورة (عرض لمرة واحدة)',
      });
    } else if (mediaType === 'videoMessage') {
      await sock.sendMessage(selfJid, {
        video: mediaBuffer,
        caption: '✅ تم استعادة الفيديو (عرض لمرة واحدة)',
      });
    }

  } catch (err) {
    console.error('❌ خطأ في استعادة الوسائط:', err);
  }
};
