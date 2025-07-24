const gplay = require('google-play-scraper');
const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async ({ sock, msg, text, reply, from }) => {
    if (!text.toLowerCase().startsWith('apk')) return;

    const parts = text.trim().split(' ');
    const appName = parts.slice(1).join(' ');
    if (!appName) {
        return reply('❌ اكتب اسم التطبيق.\nمثال: apk واتساب');
    }

    try {
        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

        // ✅ البحث في Google Play
        const results = await gplay.search({ term: appName, num: 1 });
        if (!results || results.length === 0) {
            return reply('❌ لم أجد التطبيق. جرب اسمًا آخر.');
        }

        const app = results[0];

        // ✅ تفاصيل التطبيق
        const appDetails = `📦 *${app.title}*\n\n` +
            `📝 الوصف: ${app.summary || 'غير متوفر'}\n` +
            `⭐ التقييم: ${app.scoreText || 'غير متوفر'}\n` +
            `📥 التحميل: ${app.installs || 'غير متوفر'}\n` +
            `🔗 الرابط: ${app.url}\n\n` +
            `⏳ جاري البحث عن رابط التحميل...`;

        await sock.sendMessage(from, {
            image: { url: app.icon },
            caption: appDetails
        }, { quoted: msg });

        // ✅ البحث عن التطبيق في APKPure
        const searchUrl = `https://apkpure.com/search?q=${encodeURIComponent(app.title)}`;
        const searchResponse = await axios.get(searchUrl);
        const $ = cheerio.load(searchResponse.data);
        const firstLink = $('.search-title > a').attr('href');

        if (!firstLink) {
            return reply('❌ لم أتمكن من العثور على ملف APK في APKPure.');
        }

        // ✅ صفحة التحميل
        const apkPage = `https://apkpure.com${firstLink}/download?from=details`;
        const downloadPage = await axios.get(apkPage);
        const $$ = cheerio.load(downloadPage.data);
        let downloadLink = $$('a[data-dt-event="download_start"]').attr('href');

        if (!downloadLink) {
            const scriptContent = downloadPage.data.match(/https:\/\/download\.apkpure\.com\/b\/.*?"/);
            if (scriptContent) {
                downloadLink = scriptContent[0].replace(/"/g, '');
            }
        }

        if (!downloadLink) {
            return reply('❌ لم أتمكن من العثور على رابط التحميل.');
        }

        // ✅ تحقق من الحجم قبل التنزيل
        const headRes = await axios.head(downloadLink);
        const fileSize = headRes.headers['content-length'] || 0;
        const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);

        if (sizeMB > 64) {
            await reply(`⚠️ حجم الملف كبير (${sizeMB}MB). لا يمكن إرساله عبر واتساب.\n\n📥 رابط التحميل:\n${downloadLink}`);
        } else {
            const apkResponse = await axios.get(downloadLink, { responseType: 'arraybuffer' });
            const apkBuffer = Buffer.from(apkResponse.data);

            await sock.sendMessage(from, {
                document: apkBuffer,
                mimetype: 'application/vnd.android.package-archive',
                fileName: `${app.title}.apk`,
                caption: `✅ تم تحميل التطبيق: ${app.title}\nالحجم: ${sizeMB}MB`
            }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('❌ خطأ في أمر apk:', err.message);
        await reply('❌ حدث خطأ أثناء البحث أو التحميل.');
    }
};
