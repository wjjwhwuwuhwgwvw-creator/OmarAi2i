import 'dotenv/config';
import { GoogleGenerativeAI } from "@google/generative-ai";
import geminiScraper from './gemini-scraper.js';
import config from '../../config/config.js';
import fs from 'fs';
import path from 'path';

const API_KEYS = config.geminiApiKeys || [config.geminiApiKey];
let currentKeyIndex = 0;
let keyUsageCount = new Map();
let keyLastUsed = new Map();

function getNextApiKey() {
    let minUsage = Infinity;
    let bestKeyIndex = 0;
    
    for (let i = 0; i < API_KEYS.length; i++) {
        const usage = keyUsageCount.get(i) || 0;
        const lastUsed = keyLastUsed.get(i) || 0;
        const timeSinceLastUse = Date.now() - lastUsed;
        
        if (timeSinceLastUse > 60000) {
            keyUsageCount.set(i, 0);
        }
        
        if (usage < minUsage) {
            minUsage = usage;
            bestKeyIndex = i;
        }
    }
    
    currentKeyIndex = bestKeyIndex;
    keyUsageCount.set(currentKeyIndex, (keyUsageCount.get(currentKeyIndex) || 0) + 1);
    keyLastUsed.set(currentKeyIndex, Date.now());
    
    console.log(`🔑 استخدام مفتاح API رقم ${currentKeyIndex + 1}/${API_KEYS.length}`);
    return API_KEYS[currentKeyIndex];
}

function createGenAI() {
    const key = getNextApiKey();
    if (key) {
        return new GoogleGenerativeAI(key);
    }
    return null;
}

const API_KEY = API_KEYS[0] || '';
let genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

const CONVERSATIONS_DIR = './conversations';

if (!fs.existsSync(CONVERSATIONS_DIR)) {
    fs.mkdirSync(CONVERSATIONS_DIR, { recursive: true });
    console.log('📁 تم إنشاء مجلد المحادثات');
}

const conversationHistory = new Map();
const scraperSessions = new Map();

function saveConversationToFile(userId, history) {
    try {
        const filePath = path.join(CONVERSATIONS_DIR, `${userId}.json`);
        const data = {
            userId: userId,
            lastUpdated: new Date().toISOString(),
            messages: history
        };
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('❌ خطأ في حفظ المحادثة:', error.message);
    }
}

function loadConversationFromFile(userId) {
    try {
        const filePath = path.join(CONVERSATIONS_DIR, `${userId}.json`);
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            console.log(`📖 تم تحميل محادثة ${userId} من الملف (${data.messages?.length || 0} رسالة)`);
            return data.messages || [];
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل المحادثة:', error.message);
    }
    return [];
}

function getConversationHistory(userId) {
    if (conversationHistory.has(userId)) {
        return conversationHistory.get(userId);
    }
    const history = loadConversationFromFile(userId);
    if (history.length > 0) {
        conversationHistory.set(userId, history);
    }
    return history;
}

function addToHistory(userId, role, text) {
    if (!conversationHistory.has(userId)) {
        const loaded = loadConversationFromFile(userId);
        conversationHistory.set(userId, loaded);
    }
    const history = conversationHistory.get(userId);
    history.push({ role, text, timestamp: new Date().toISOString() });
    
    if (history.length > 100) {
        conversationHistory.set(userId, history.slice(-100));
    }
    
    saveConversationToFile(userId, conversationHistory.get(userId));
}

const SYSTEM_PROMPT = `أنت مساعد ذكي ودود للبوت ديال واتساب. اسمك "عُمر" وكتهضر بالدارجة المغربية.

معلومات المطور:
- اسم المطور: عُمر (Omar)
- انستجرام المطور: @omarxarafp أو https://www.instagram.com/omarxarafp
- هذا البوت من تطوير Omar AI

شخصيتك:
- كن ودود ومساعد دايماً
- ما تكونش عصبي أو متوتر أبداً
- لا تستخدم الإيموجي نهائياً في ردودك (ممنوع!)
- كن مساعد حقيقي، ماشي بوت جامد
- ردودك تكون مختصرة ومباشرة

مصطلحات الدارجة المهمة:
- "لول" = الأول (رقم 1)، ماشي LOL
- "التاني" = الثاني (رقم 2)
- "التالت" = الثالث (رقم 3)
- "الربع" = الرابع (رقم 4)
- "بحالو/بحالهم" = مثله/مثلهم
- "واخا" = حسنا/موافق
- "زوين" = جميل/ممتاز
- "خايب" = سيء
- "صافي" = انتهى/كفى

إدارة السياق والذاكرة - مهم جداً:
- **تذكر دائماً ما قلته للمستخدم**: إذا عرضت قائمة تطبيقات، تذكرها!
- **إذا قال المستخدم رقم (1، 2، 3...) أو "لول"، "التاني"**: استخدم download_app مع appId من القائمة الأخيرة
- **لا تكرر نفسك**: إذا أرسلت قائمة، لا ترسلها مرة أخرى
- **تابع موضوع المحادثة**: لا تغير الموضوع فجأة
- **لا تقل "أرسلت لك القائمة اختر"**: نفذ طلبه مباشرة

⚡ عند اختيار من القائمة:
- إذا عرضت قائمة وقال المستخدم رقم → استخدم download_app مباشرة
- لا تسأله "واش بغيتي نزلها" - نزلها مباشرة!

🎯 الوظائف ديالك:
1. البحث عن التطبيقات فـ Google Play وتنزيلها
2. تحميل الفيديوهات من السوشيال ميديا
3. الإجابة على الأسئلة وحل الواجبات
4. قراءة الصور وتحليلها
5. المساعدة العامة والمحادثة
6. توصية التطبيقات بناءً على وصف المستخدم

📋 القواعد المهمة:
- خدم بالدارجة المغربية دايماً
- كن ودود ومساعد دايماً
- **إذا سألك المستخدم عن المطور أو شكون صاوبك أو التواصل، قل له: المطور هو عُمر، تقدر تتابعه على انستجرام @omarxarafp**
- **استخدم "reply" للرسائل العادية**
- **استخدم "search_app" فقط إذا المستخدم طلب تطبيق صراحةً**
- **استخدم "recommend_app" لمّا يوصف شنو بغا بلا ما يسمّي تطبيق**

🔧 الأوامر المتاحة (ترجعهم ك JSON):
- {"action": "reply", "message": "الرد"} - للرد العادي والمحادثة
- {"action": "search_app", "query": "اسم التطبيق"} - لطلب تطبيق بشكل واضح
- {"action": "recommend_app", "message": "الرسالة", "apps": [...]} - لتوصية تطبيقات
- {"action": "download_app", "appId": "com.example.app"} - لتنزيل تطبيق معين
- {"action": "download_media", "url": "الرابط", "platform": "..."} - لتحميل فيديو

⚠️ مهم جداً:
- رجّع JSON فقط بدون أي نص إضافي
- **افتراضياً استخدم "reply" للمحادثة العادية**

أمثلة:
- "هاي" → {"action": "reply", "message": "أهلاً! كيفاش نقدر نعاونك؟"}
- "شنو سميتك" → {"action": "reply", "message": "سميتي عُمر، المساعد الذكي ديالك. شنو بغيتي؟"}
- "شكون المطور" → {"action": "reply", "message": "المطور هو عُمر، تقدر تتابعه على انستجرام @omarxarafp"}
- "بغيت واتساب" → {"action": "search_app", "query": "WhatsApp"}
- "1" (بعد قائمة) → {"action": "download_app", "appId": "الـappId ديال التطبيق رقم 1 من القائمة"}
- "شكرا" → {"action": "reply", "message": "العفو! إذا احتجتي شي حاجة أخرى، أنا هنا"}`;

function detectSocialMediaUrl(text) {
    const patterns = {
        facebook: [/facebook\.com\/.*\/videos\//i, /facebook\.com\/watch/i, /facebook\.com\/share/i, /facebook\.com\/reel/i, /fb\.watch/i, /fb\.com/i],
        instagram: [/instagram\.com\/p\//i, /instagram\.com\/reel/i, /instagram\.com\/stories/i, /instagram\.com\/tv/i],
        tiktok: [/tiktok\.com\/@[\w.-]+\/video/i, /vm\.tiktok\.com/i, /vt\.tiktok\.com/i],
        youtube: [/youtube\.com\/watch/i, /youtu\.be\//i, /youtube\.com\/shorts/i],
        twitter: [/twitter\.com\/\w+\/status/i, /x\.com\/\w+\/status/i],
        pinterest: [/pinterest\.com\/pin/i, /pin\.it\//i]
    };

    const urlMatch = text.match(/(https?:\/\/[^\s]+)/gi);
    if (!urlMatch) return null;

    const url = urlMatch[0];
    for (const [platform, platformPatterns] of Object.entries(patterns)) {
        for (const pattern of platformPatterns) {
            if (pattern.test(url)) {
                return { platform, url };
            }
        }
    }
    return null;
}

function detectStarConversion(text) {
    const lowerText = text.toLowerCase().trim();
    const patterns = [
        /تحويل\s*[\*\#]?\s*6\s*(الى|إلى|ل|to)\s*[\*\#]?\s*3/i,
        /نجمة\s*6\s*(الى|إلى|ل|to)\s*(نجمة\s*)?3/i,
        /\*6\s*(الى|إلى|ل|to)\s*\*3/i,
        /[\*\#]6\s*(الى|إلى|ل|to)\s*[\*\#]3/i,
        /star\s*6\s*to\s*star\s*3/i,
        /6\s*(الى|إلى|ل|to)\s*3.*تحويل/i,
        /تحويل.*6.*3/i,
        /بغيت.*نحول.*6.*3/i,
        /كيفاش.*نحول.*6.*3/i
    ];
    
    for (const pattern of patterns) {
        if (pattern.test(text)) {
            return true;
        }
    }
    return false;
}

function detectAppRequest(text) {
    const lowerText = text.toLowerCase().trim();
    
    if (detectStarConversion(text)) {
        return { searchQuery: "تحويل *6 الى *3" };
    }
    
    const downloadPatterns = [
        /^(نزل|حمل|download|بغيت|عطيني|جيب)\s+(.+)/i,
        /^(.+)\s+(نزلها|حملها|نزلو|حملو)$/i,
        /(نزل|حمل|بغيت|عطيني)\s+(لي|ليا)?\s*(تطبيق|لعبة|برنامج|app|game)\s+(.+)/i,
        /^(ابحث|بحث)\s+(على|عن)?\s*(تطبيق|لعبة|برنامج)?\s*(.+)/i,
    ];
    
    for (const pattern of downloadPatterns) {
        if (pattern.test(lowerText)) {
            return { searchQuery: text };
        }
    }
    
    const knownApps = ["whatsapp", "facebook", "instagram", "tiktok", "youtube", "telegram", 
                       "snapchat", "pubg", "free fire", "minecraft", "roblox", "clash",
                       "vpn", "zarchiver", "chrome", "firefox"];
    
    const words = lowerText.split(/\s+/);
    if (words.length <= 3) {
        for (const app of knownApps) {
            if (lowerText.includes(app)) {
                return { searchQuery: text };
            }
        }
    }
    
    const englishAppPattern = /^[a-zA-Z][a-zA-Z0-9\s\-\_\.]+$/;
    if (englishAppPattern.test(text.trim()) && words.length <= 3 && text.trim().length >= 3 && text.trim().length <= 30) {
        return { searchQuery: text };
    }
    
    return null;
}

async function askWithScraper(userId, prompt, userMessage) {
    try {
        const previousId = scraperSessions.get(userId) || null;
        
        const history = getConversationHistory(userId);
        let contextPrompt = prompt;
        
        if (history.length > 0) {
            const recentHistory = history.slice(-15);
            let historyText = "\n\n📜 تاريخ المحادثة الأخيرة:\n";
            recentHistory.forEach(h => {
                if (h.role === 'user') {
                    historyText += `المستخدم: ${h.text}\n`;
                } else {
                    historyText += `أنت: ${h.text}\n`;
                }
            });
            contextPrompt = prompt + historyText;
        }
        
        const result = await geminiScraper.ask(contextPrompt, previousId);
        scraperSessions.set(userId, result.id);
        
        addToHistory(userId, "user", userMessage);
        addToHistory(userId, "model", result.text);
        
        return result.text;
    } catch (error) {
        console.error('Scraper Error:', error.message);
        throw error;
    }
}

async function askWithAPI(userId, text, imageData = null) {
    const currentGenAI = imageData ? createGenAI() : genAI;
    
    if (!currentGenAI) {
        throw new Error('API key not configured');
    }

    const history = getConversationHistory(userId);
    if (!conversationHistory.has(userId)) {
        conversationHistory.set(userId, history);
    }

    const modelName = imageData ? "gemini-2.0-flash" : "gemini-2.5-flash";
    const model = currentGenAI.getGenerativeModel({ model: modelName });
    console.log(`🤖 استخدام نموذج: ${modelName}`);

    let prompt = text;
    let parts = [];

    if (imageData) {
        console.log(`📸 معالجة صورة في Gemini API: ${imageData.mimeType}, حجم: ${imageData.base64.length} bytes`);
        parts.push({
            inlineData: {
                mimeType: imageData.mimeType,
                data: imageData.base64
            }
        });
        
        const searchKeywords = ["ابحث", "بحث", "نزل", "حمل", "بغيت", "search", "download", "find"];
        const isSearchRequest = searchKeywords.some(keyword => (text || "").toLowerCase().includes(keyword));
        
        if (isSearchRequest) {
            prompt = `انظر إلى هذه الصورة بدقة وحلل محتواها:

1. إذا كانت الصورة تحتوي على تطبيق أو لعبة (أيقونة، شعار، لقطة شاشة):
   - حدد اسم التطبيق/اللعبة بالإنجليزية
   - أرجع: {"action": "search_app", "query": "اسم التطبيق"}

2. إذا كانت صورة عادية (شخص، منظر، شيء):
   - صف الصورة بالدارجة المغربية
   - أرجع: {"action": "reply", "message": "وصف الصورة"}

أمثلة للتطبيقات والألعاب:
- صورة Free Fire أو FF → {"action": "search_app", "query": "Free Fire"}
- صورة PUBG → {"action": "search_app", "query": "PUBG Mobile"}
- صورة WhatsApp → {"action": "search_app", "query": "WhatsApp"}
- صورة Minecraft → {"action": "search_app", "query": "Minecraft"}
- صورة TikTok → {"action": "search_app", "query": "TikTok"}

طلب المستخدم: ${text || "ابحث عن هذا في الصورة"}

أرجع JSON فقط بدون أي نص إضافي.`;
        } else {
            prompt = `${text || "شنو هادي الصورة؟ وصفها ليا بالتفصيل بالدارجة المغربية"}

ملاحظة: إذا كانت الصورة تحتوي على نص، اقرأه وترجمه. إذا كانت صورة لتطبيق أو لعبة، اذكر اسمها.

أجب بالدارجة المغربية بشكل طبيعي ومفصل.`;
        }
        
        parts.push({ text: prompt });
        
        try {
            const result = await model.generateContent(parts);
            const responseText = result.response.text();
            console.log(`✅ تم تحليل الصورة: ${responseText.substring(0, 100)}...`);
            
            addToHistory(userId, "user", text || "[صورة]");
            addToHistory(userId, "model", responseText);

            return responseText;
        } catch (imageError) {
            console.error('❌ خطأ في تحليل الصورة:', imageError.message);
            throw imageError;
        }
    } else {
        const chatHistory = history.map(h => ({
            role: h.role,
            parts: [{ text: h.text }]
        }));

        parts.push({ text: `${SYSTEM_PROMPT}\n\nالرسالة: ${prompt}` });

        const chat = model.startChat({
            history: chatHistory.slice(-15),
        });

        const result = await chat.sendMessage(parts);
        const responseText = result.response.text();

        addToHistory(userId, "user", text);
        addToHistory(userId, "model", responseText);

        return responseText;
    }
}

export async function processMessage(userId, text, imageData = null) {
    try {
        const socialMedia = detectSocialMediaUrl(text);
        if (socialMedia) {
            return {
                action: "download_media",
                url: socialMedia.url,
                platform: socialMedia.platform
            };
        }

        if (imageData) {
            console.log('🖼️ معالجة صورة...');
            
            const searchKeywords = ["ابحث", "بحث", "نزل", "حمل", "بغيت", "search", "download", "find"];
            const isSearchRequest = searchKeywords.some(keyword => (text || "").toLowerCase().includes(keyword));
            
            let imagePrompt;
            if (isSearchRequest) {
                imagePrompt = `انظر إلى هذه الصورة وحدد اسم التطبيق أو اللعبة الموجودة فيها.
إذا كانت الصورة لتطبيق أو لعبة معروفة، أرجع JSON بهذا الشكل:
{"action": "search_app", "query": "اسم التطبيق أو اللعبة بالإنجليزية"}
أرجع JSON فقط بدون أي نص إضافي.
طلب المستخدم: ${text || "ابحث عن هذا"}`;
            } else {
                imagePrompt = text || "شنو هادي الصورة؟ وصفها ليا بالتفصيل بالدارجة المغربية";
            }
            
            let responseText = null;
            
            // المحاولة الأولى: Google API key (gemini-2.5-flash)
            if (genAI) {
                console.log('🔑 جاري استخدام Gemini 2.5 Flash API...');
                try {
                    responseText = await askWithAPI(userId, text, imageData);
                    if (responseText) {
                        console.log('✅ تم تحليل الصورة بواسطة Gemini 2.5 Flash');
                    }
                } catch (apiError) {
                    console.log('⚠️ فشل API:', apiError.message);
                }
            }
            
            // المحاولة الثانية: Gemini Scraper
            if (!responseText) {
                console.log('🌐 جاري استخدام Gemini Scraper...');
                try {
                    const scraperResult = await geminiScraper.ask(imagePrompt, null, {
                        buffer: Buffer.from(imageData.base64, 'base64'),
                        mimeType: imageData.mimeType
                    });
                    if (scraperResult && scraperResult.answer) {
                        responseText = scraperResult.answer;
                        console.log('✅ تم تحليل الصورة بواسطة Scraper');
                    }
                } catch (scraperError) {
                    console.log('⚠️ فشل Scraper:', scraperError.message);
                }
            }
            
            if (!responseText) {
                return {
                    action: "reply",
                    message: "عذراً، مقديتش نحلل الصورة دابا. جرب مرة أخرى."
                };
            }
            
            try {
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.action) {
                        return parsed;
                    }
                }
            } catch (e) {
            }
            
            let cleanedText = responseText
                .replace(/```json[\s\S]*```/g, '')
                .replace(/\{[\s\S]*\}/g, '')
                .replace(/\$\$\\text\{([^}]+)\}\$\$/g, '$1')
                .replace(/\\\*/g, '*')
                .replace(/\\#/g, '#')
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2')
                .trim();
            
            return {
                action: "reply",
                message: cleanedText || responseText
            };
        }

        const appRequest = detectAppRequest(text);
        if (appRequest && appRequest.searchQuery) {
            return {
                action: "search_app",
                query: appRequest.searchQuery
            };
        }

        let responseText = null;

        let promptToSend = text || "مرحبا";
        
        // للنصوص العادية: نستخدم السكرابر أولاً (لتوفير الـ API للصور)
        console.log('🌐 جاري استخدام Gemini Scraper للرسائل...');
        try {
            const fullPrompt = `${SYSTEM_PROMPT}\n\nالرسالة: ${promptToSend}`;
            responseText = await askWithScraper(userId, fullPrompt, promptToSend);
            console.log('✅ السكرابر نجح');
        } catch (scraperError) {
            console.log('⚠️ السكرابر فشل:', scraperError.message);
            
            // Fallback للـ API إذا فشل السكرابر
            if (genAI) {
                console.log('🔑 جاري استخدام API كاحتياطي...');
                try {
                    responseText = await askWithAPI(userId, text, null);
                    console.log('✅ API نجح');
                } catch (apiError) {
                    console.log('⚠️ API فشل:', apiError.message);
                }
            }
        }

        if (!responseText) {
            return {
                action: "reply",
                message: "عذراً، وقع مشكل. عاود المحاولة."
            };
        }

        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.action) {
                    return parsed;
                }
            }
        } catch (e) {
        }

        let cleanedText = responseText
            .replace(/```json[\s\S]*```/g, '')
            .replace(/\{[\s\S]*\}/g, '')
            .replace(/\$\$\\text\{([^}]+)\}\$\$/g, '$1')
            .replace(/\\\*/g, '*')
            .replace(/\\#/g, '#')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2')
            .trim();
        
        return {
            action: "reply",
            message: cleanedText || responseText
        };

    } catch (error) {
        console.error("Gemini Error:", error.message);
        return {
            action: "reply",
            message: "عذراً، وقع مشكل. عاود المحاولة."
        };
    }
}

export function clearHistory(userId) {
    conversationHistory.delete(userId);
    scraperSessions.delete(userId);
    try {
        const filePath = path.join(CONVERSATIONS_DIR, `${userId}.json`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ تم حذف محادثة ${userId}`);
        }
    } catch (error) {
        console.error('❌ خطأ في حذف ملف المحادثة:', error.message);
    }
}

export function getHistory(userId) {
    return getConversationHistory(userId);
}

export function addContext(userId, context) {
    addToHistory(userId, "model", context);
}

export async function processMessageWithQuote(userId, text, quotedText, imageData = null) {
    let fullMessage = text;
    if (quotedText && quotedText.trim()) {
        fullMessage = `[المستخدم يقتبس رسالة سابقة: "${quotedText}"]\n\nرد المستخدم: ${text}`;
    }
    return processMessage(userId, fullMessage, imageData);
}

const GROUP_MODERATION_PROMPT = `أنت مراقب ذكي لمجموعة واتساب. مهمتك هي تحليل الرسائل وكشف المخالفات.

📋 قوانين المجموعة الصارمة:
1. ممنوع السب والشتم والإهانة بأي لغة
2. ممنوع التحرش أو المحتوى الجنسي أو الإيحاءات
3. ممنوع نشر روابط مشبوهة أو سبام
4. ممنوع الإساءة للأديان أو الأعراق
5. ممنوع التهديد أو العنف
6. ممنوع الترويج للمحتوى غير القانوني
7. ممنوع إزعاج الأعضاء أو المشرفين
8. ممنوع نشر محتوى كاذب أو مضلل
9. ممنوع الدعايات والإعلانات بدون إذن
10. يجب احترام جميع الأعضاء

🔍 حلل الرسالة التالية وأرجع JSON:

إذا كانت الرسالة مخالفة:
{"violation": true, "reason": "سبب المخالفة باختصار", "severity": "high/medium/low", "action": "kick"}

إذا كانت الرسالة سليمة:
{"violation": false}

ملاحظات مهمة:
- severity: high = طرد فوري، medium = تحذير، low = تجاهل
- كن صارماً مع السب والتحرش والإهانة (severity: high)
- الرسائل العادية والأسئلة البريئة = سليمة
- لا تعتبر الدعاء أو التحيات مخالفة

أرجع JSON فقط بدون أي نص إضافي.`;

export async function moderateGroupMessage(text, senderName = 'مستخدم') {
    if (!text || text.trim().length < 2) {
        return { violation: false };
    }

    try {
        const currentGenAI = createGenAI();
        if (!currentGenAI) {
            console.log('⚠️ لا يوجد API key لتحليل الرسالة');
            return { violation: false };
        }

        const model = currentGenAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        
        const prompt = `${GROUP_MODERATION_PROMPT}

الرسالة من "${senderName}":
"${text}"

أرجع JSON فقط:`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.violation !== undefined) {
                    console.log(`🤖 Gemini تحليل: ${parsed.violation ? '⚠️ مخالفة' : '✅ سليم'} - ${parsed.reason || ''}`);
                    return parsed;
                }
            }
        } catch (parseError) {
            console.log('⚠️ خطأ في تحليل رد Gemini:', parseError.message);
        }

        return { violation: false };
    } catch (error) {
        console.error('❌ خطأ في مراقبة Gemini:', error.message);
        return { violation: false };
    }
}
