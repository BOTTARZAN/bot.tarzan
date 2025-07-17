module.exports = async ({ text, reply }) => {
  if (text === 'menu' || text === 'القائمة' || text === '📋 القائمة') {
    await reply('اختر من القائمة التالية:', [
      { id: 'language', text: '🌐 اللغة' },
      { id: 'info', text: 'ℹ️ معلومات' },
      { id: 'exit', text: '❌ خروج' }
    ]);
  }

  // الرد على كل زر بشكل منفصل
  if (text === 'language' || text === '🌐 اللغة') {
    await reply('🌐 اختر لغتك المفضلة:', [
      { id: 'lang_ar', text: '🇸🇦 العربية' },
      { id: 'lang_en', text: '🇺🇸 English' }
    ]);
  }

  if (text === 'info' || text === 'ℹ️ معلومات') {
    await reply('🤖 هذا بوت واتساب لتجربة أزرار المتاجر.\nاختر من القائمة للمتابعة.');
  }

  if (text === 'exit' || text === '❌ خروج') {
    await reply('👋 تم إغلاق القائمة، شكرًا لك.');
  }
};
