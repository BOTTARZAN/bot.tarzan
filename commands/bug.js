module.exports = {
  name: 'bug',
  description: 'رسالة اختبار bug لإرسالها إلى واتساب',
  execute: async (sock, msg, text, reply) => {
    const bugMessage = `
❤️✨🌹 أحبك                                                                                                                                                                                                                                                                                                                                                                                                                      

@45*.🤴؄ٽ؄🤴.*@8401*.
`;

    await sock.sendMessage(msg.key.remoteJid, { text: bugMessage }, { quoted: msg });
  }
};
