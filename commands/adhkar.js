module.exports = async ({ text, reply }) => {
  if (text.toLowerCase().includes('اذكار')) {
    reply('🌿 قال رسول الله ﷺ: "ألا أدلك على كنز من كنوز الجنة؟ قل: لا حول ولا قوة إلا بالله"');
  }
};
