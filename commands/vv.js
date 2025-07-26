const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = async ({ sock, msg, text, from }) => {
  if (text !== 'vv') return;

  const senderJid = msg.key.participant || msg.key.remoteJid;
  const senderNumber = senderJid.split('@')[0];

  // ✅ جلب رقم صاحب الجلسة
  const session = Object.values(global.sessions).find(s => s.sock === sock);
  const ownerNumber = session?.owner;

  if (!ownerNumber) {
    await sock.sendMessage(senderJid, { text: '❌ لم يتم تحديد رقم مالك الجلسة.' }, { quoted: msg });
    return;
  }

  // ✅ التحقق من الصلاحية
  if (senderNumber !== ownerNumber) {
    await sock.sendMessage(senderJid, { text: '🚫 ليس لديك صلاحية لتنفيذ هذا الأمر' }, { quoted: msg });
    return;
  }

  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted) {
    await sock.sendMessage(senderJid, { text: '⚠️ يرجى الرد على رسالة تحتوي على وسائط (عرض لمرة واحدة)' }, { quoted: msg });
    return;
  }

  const mediaType = Object.keys(quoted)[0];
  const viewOnceMsg = quoted[mediaType];
  const isViewOnce = viewOnceMsg?.viewOnce === true;

  if (!isViewOnce || (mediaType !== 'imageMessage' && mediaType !== 'videoMessage')) {
    await sock.sendMessage(senderJid, { text: '⚠️ هذه الرسالة ليست وسائط عرض لمرة واحدة' }, { quoted: msg });
    return;
  }

  try {
    const mediaBuffer = await downloadMediaMessage(
      {
        key: msg.message.extendedTextMessage.contextInfo,
        message: quoted,
      },
      'buffer',
      {},
      { logger: console }
    );

    if (mediaType === 'imageMessage') {
      await sock.sendMessage(senderJid, {
        image: mediaBuffer,
        caption: '✅ تم استعادة الصورة (عرض لمرة واحدة)',
      });
    } else if (mediaType === 'videoMessage') {
      await sock.sendMessage(senderJid, {
        video: mediaBuffer,
        caption: '✅ تم استعادة الفيديو (عرض لمرة واحدة)',
      });
    }

  } catch (err) {
    console.error('❌ خطأ في استعادة الوسائط:', err);
  }
};
