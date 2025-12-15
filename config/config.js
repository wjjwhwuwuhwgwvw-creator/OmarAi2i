const config = {
    geminiApiKeys: process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY] : [],
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    
    developer: {
        phones: ['212718938088', '234905250308102', '212718643833'],
        instagramUrl: 'https://www.instagram.com/omarxarafp',
        channelUrl: 'https://www.instagram.com/omarxarafp',
        poweredBy: '\n\n> Omar AI',
        pluginBranding: `\n\n*تابعني على انستجرام*\nhttps://www.instagram.com/omarxarafp\n\n> Omar AI`
    },

    bot: {
        profileImageUrl: 'https://i.ibb.co/fYXc7sQx/Screenshot-2025-12-03-16-15-57-737-com-android-chrome-edit.jpg',
        vipPassword: 'Omar',
        presenceMode: 'unavailable',
        maxFileSize: 2 * 1024 * 1024 * 1024,
        zarchiverPackage: 'ru.zdevs.zarchiver'
    },

    limits: {
        spam: {
            fastMessages: 5,
            fastMessageWindow: 10000,
            messagesPerHour: 25,
            maxConcurrentDownloads: 3
        },
        downloads: {
            maxConcurrentDownloads: 3,
            downloadSpamThreshold: 10
        }
    },

    badWords: {
        enabled: true,
        words: [
            // كلمات عربية
            'سب', 'شتم', 'لعن', 'كلب', 'حمار', 'زنقة', 'قحبة', 'زامل', 'تفو',
            'انيك', 'نيك', 'زب', 'كس', 'شرموطة', 'عاهرة', 'منيوك', 'متناك',
            'ولد القحبة', 'ابن القحبة', 'تبا', 'خول', 'مخنث', 'لوطي',
            'احمق', 'غبي', 'حقير', 'وسخ', 'زبالة', 'خرا', 'تخرا',
            'ابن الشرموطة', 'ابن الكلب', 'ابن الحرام', 'عرص', 'معرص',
            'طيز', 'كسمك', 'كس امك', 'كس اختك', 'نيك امك', 'يلعن',
            'يلعن ابوك', 'يلعن امك', 'يلعن دينك', 'ملعون', 'لعنة',
            'زاني', 'زانية', 'فاجر', 'فاجرة', 'خنزير', 'خنزيرة',
            'حيوان', 'بهيمة', 'حشرة', 'جرثومة', 'قذر', 'قذرة',
            'منحط', 'منحطة', 'ساقط', 'ساقطة', 'وضيع', 'وضيعة',
            'تافه', 'تافهة', 'سافل', 'سافلة', 'نجس', 'نجسة',
            // دارجة مغربية
            'زمل', 'زملة', 'تقود', 'قواد', 'قوادة', 'مشاهير',
            'لحوالة', 'كحبة', 'ولد لكحبة', 'نعل', 'نعل بوك', 'نعل موك',
            'سير تقود', 'سيري تقودي', 'مول زب', 'بوزبال',
            'خرا عليك', 'تبون موك', 'زبي', 'زبك', 'كسك',
            'دير زبك', 'ديري زبك', 'سكت نتا', 'سكتي نتي',
            // كلمات إنجليزية
            'fuck', 'shit', 'bitch', 'ass', 'dick', 'pussy', 'bastard', 'whore',
            'nigga', 'nigger', 'faggot', 'cunt', 'slut', 'damn', 'hell',
            'asshole', 'motherfucker', 'bullshit', 'dumbass', 'retard',
            'idiot', 'moron', 'stupid', 'dumb', 'loser', 'sucker',
            'wtf', 'stfu', 'fk', 'fuk', 'fck', 'sht', 'btch',
            'dickhead', 'prick', 'wanker', 'twat', 'bloody',
            // فرنسية
            'merde', 'putain', 'connard', 'salope', 'enculer', 'foutre',
            'nique', 'nique ta mere', 'ntm', 'fdp', 'fils de pute',
            'con', 'conne', 'connasse', 'batard', 'batarde'
        ],
        warningThreshold: 1,
        blockOnExceed: true
    },

    developerNotifications: {
        enabled: true,
        notifyOnBlock: true,
        notifyOnBadWords: true,
        notifyOnCall: true,
        notifyOnError: true,
        notifyOnSpam: true
    },

    delays: {
        authenticated: {
            messageDelay: 0,
            maxConcurrentDownloads: 10,
            messagesPerHour: 50
        },
        unauthenticated: {
            messageDelay: 0,
            maxConcurrentDownloads: 3,
            messagesPerHour: 25
        }
    },

    connection: {
        maxReconnectAttempts: 5,
        baseReconnectDelay: 10000,
        keepAliveInterval: 55000,
        connectTimeout: 60000,
        queryTimeout: 120000
    },

    api: {
        baseUrl: process.env.API_URL || 'http://localhost:8000',
        headersTimeout: 600000,
        bodyTimeout: 600000,
        maxRetries: 3
    },

    search: {
        maxResults: 8,
        sources: {
            googlePlay: true,
            apkPure: true
        },
        preferGooglePlay: true
    },

    messages: {
        welcome: (userInfo, cfg) => `*بوت Omar AI المتعدد الوظائف*

مرحبا بيك آ ${userInfo.name}
النمرة ديالك: +${userInfo.phone}${userInfo.status ? `\nالحالة: ${userInfo.status}` : ''}

*وظائف البوت:*

*تحميل التطبيقات (APK/XAPK):*
◄ صيفط اسم التطبيق بالإنجليزية
◄ اختار من القائمة
◄ استقبل الملف مباشرة

*تحميل من المنصات:*
◄ *YouTube* - فيديوهات وقصيرة
◄ *Instagram* - صور وفيديوهات وريلز
◄ *Facebook* - فيديوهات وريلز
◄ *TikTok* - فيديوهات
◄ *Twitter/X* - فيديوهات وتغريدات
◄ *Pinterest* - صور وفيديوهات
◄ *Google Drive* - ملفات مباشرة
◄ *Mediafire* - روابط تحميل

*كيفاش تستعمل البوت:*

للتطبيقات:
1. صيفط اسم التطبيق (WhatsApp, Minecraft...)
2. اختار الرقم من اللائحة
3. استقبل الملف

للمنصات:
◄ صيفط الرابط مباشرة
◄ البوت يحمل ويرسل ليك تلقائياً

*أوامر مفيدة:*
/help - المساعدة
/commands - الأوامر
/history - سجل التحميلات
zarchiver - تنزيل مثبت XAPK

*قوانين الاستعمال:*
◄ ماكثرش من 25 ميساج فالساعة
◄ ماديرش كثر من 3 تحميلات متتابعة
◄ المكالمات = بلوك أوتوماتيكي
◄ السبيام = بلوك نهائي

*VIP Access:*
باش تحصل على تحميلات لامحدودة، تواصل مع المطور وخد كود VIP`,

        vipActivated: `*VIP تفعّل*

◄ تحميلات بلا حدود
◄ سرعة زوينة
◄ أولوية فالطلبات`,

        downloading: (appTitle) => `*كنحمّل ${appTitle}...*

تسنى شوية، غادي نرسل ليك الرابط`,

        downloadComplete: (appTitle, fileSize, fileType) => `*${appTitle}*

الحجم: ${fileSize}
النوع: ${fileType.toUpperCase()}`,

        searchResults: (query, count) => `*نتائج البحث: "${query}"*

لقيت ${count} تطبيق(ات)
ختار رقم التطبيق:`,

        noResults: (query) => `ما لقيتش "${query}"

نصائح:
• تأكد من الكتابة صحيحة
• جرّب اسم آخر
• كتب الاسم بالإنجليزية`,

        waitingDownload: `صبر شوية، غادي نرسل ليك التطبيق...`,

        spamWarning: `⚠️ *تحذير*

كتكتب بزاف ديال الميساجات بسرعة
صبر شوية باش نجاوبك`,

        blockedSpam: `⛔ *تحظرّت*

رسائل كثيرة فالساعة
الحد: 25 ميساج فالساعة

إذا بغيت توضح، تواصل مع المطور`,

        blockedDownloadSpam: `⛔ *تحظرّت*

تجاوزت الحد ديال التحميلات
الحد: 10 تحميلات متتابعة

نصيحة: صيفط الطلبات بشوية بشوية`,

        blockedCall: `⛔ *تحظرّت*

المكالمات ممنوعة

باش تتواصل مع المطور:`,

        blockedFastSpam: `⛔ *تحظرّت نهائياً*

رسائل سريعة بزاف
الحد: 5 رسائل ف10 ثواني

السبيام ممنوع!`,

        blockedBadWords: `⛔ *تحظرّت نهائياً*

استخدمت كلمات ممنوعة
السب والشتم ممنوع هنا

البوت ديالنا محترم، وماكنقبلوش هاد الكلام.
إلى بغيت توضح، تواصل مع المطور باحترام.`,

        badWordsWarning: `⚠️ *تحذير*

الكلمات لي كتبتي ممنوعة هنا!
احترم راسك واحترمنا، وإلا غادي تتبلوكى.

هادي آخر فرصة ليك.`,

        error: `❌ وقع مشكل. عاود المحاولة.`,

        fileTooLarge: (size) => `❌ الملف كبير بزاف: ${size}

واتساب ما كيقبلش ملفات أكبر من 2GB`,

        zarchiverDownloading: `⏳ كننزّل ZArchiver...`,

        zipObbTutorial: (fileName, packageId) => {
            const appName = fileName.replace(/\.(zip|xapk|apk)$/i, '');
            return `
*كيفاش تثبت ${appName}:*

*الطريقة 1 - مدير الملفات:*
1. فك ضغط ملف ZIP
2. ثبت ملف APK
3. انقل مجلد ${packageId} إلى:
   Android/obb/

*الطريقة 2 - ZArchiver:*
1. افتح ZIP ب ZArchiver
2. ثبت APK (ضغط مطول > Install)
3. انسخ مجلد OBB إلى Android/obb/

⚠️ *مهم:* لازم تنقل ملفات OBB قبل ما تفتح التطبيق!

ماعندكش تطبيق فك الضغط؟ كتب *zarchiver*`;
        }
    },

    cleanup: {
        maxFileAge: 30 * 60 * 1000,
        cleanupInterval: 10 * 60 * 1000
    },

    cache: {
        groupMetadataTimeout: 300000,
        messageStoreLimit: 1000
    }
};

export default config;
