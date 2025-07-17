module.exports = async ({ text, reply }) => {
  if (text === 'menu') {
    await reply('📋 اختر من القائمة التالية:', [
      { id: 'اذكار', text: '📿 الأذكار' },
      { id: 'اللغة', text: '🌐 تغيير اللغة' },
      { id: 'مساعدة', text: '🛟 المساعدة' }
    ]);
  }

  if (text === 'اللغة') {
    await reply('🌍 اختر اللغة:', [
      { id: 'ar', text: '🇸🇦 العربية' },
      { id: 'en', text: '🇬🇧 English' }
    ]);
  }
};
