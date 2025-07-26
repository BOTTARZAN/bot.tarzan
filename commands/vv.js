const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = async ({ text, sock, msg, from, reply, sessionOwners, sessionId }) => {
  if (text !== 'vv') return;

  const ownerJid = sessionOwners[sessionId];
  const senderJid = msg.key.participant || msg.key.remoteJid;

  if (senderJid !== ownerJid) {
    return reply('🚫 ليس لديك صلاحية لتنفيذ هذا الأمر');
  }

  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted) return reply('⚠️ أرسل الرد على الوسائط (عرض لمرة واحدة) مع الأمر "vv"');

  const mediaType = Object.keys(quoted)[0];
  const viewOnceMsg = quoted[mediaType];
  const isViewOnce = viewOnceMsg?.viewOnce === true;

  if (!isViewOnce || (mediaType !== 'imageMessage' && mediaType !== 'videoMessage')) {
    return reply('⚠️ هذه ليست وسائط عرض لمرة واحدة');
  }

  try {
    const mediaBuffer = await downloadMediaMessage(
      { key: msg.message.extendedTextMessage.contextInfo, message: quoted },
      'buffer',
      {},
      { logger: console }
    );

    if (mediaType === 'imageMessage') {
      await sock.sendMessage(ownerJid, {
        image: mediaBuffer,
        caption: '✅ تم استعادة الصورة (عرض لمرة واحدة)'
      });
    } else if (mediaType === 'videoMessage') {
      await sock.sendMessage(ownerJid, {
        video: mediaBuffer,
        caption: '✅ تم استعادة الفيديو (عرض لمرة واحدة)'
      });
    }
  } catch (err) {
    console.error('❌ خطأ في استعادة الوسائط:', err);
    reply('❌ حدث خطأ أثناء استعادة الوسائط');
  }
};
