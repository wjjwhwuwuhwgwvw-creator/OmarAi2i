import { groupSettings } from '../src/storage.js';
import { setAntiTime, isBotAdmin, isUserAdmin } from '../src/group-manager.js';
import config from '../config/config.js';

const DEVELOPER_PHONES = config.developer.phones;

function isDeveloper(phone) {
    return DEVELOPER_PHONES.includes(phone);
}

export default {
    name: 'Group Admin',
    patterns: [],
    commands: ['antilink', 'antibadwords', 'antitime', 'auto', 'groupsettings', 'اعدادات'],

    async handler(sock, remoteJid, text, msg, utils, senderPhone) {
        try {
            if (!remoteJid.endsWith('@g.us')) {
                await sock.sendMessage(remoteJid, { 
                    text: `❌ هذا الأمر يعمل فقط في المجموعات${utils.poweredBy}` 
                }, { quoted: msg });
                return true;
            }

            const senderJid = `${senderPhone}@s.whatsapp.net`;
            const isSenderAdmin = await isUserAdmin(sock, remoteJid, senderJid);
            const isOwner = isDeveloper(senderPhone);
            
            if (!isSenderAdmin && !isOwner) {
                await sock.sendMessage(remoteJid, { 
                    text: `❌ هذا الأمر للمسؤولين فقط${utils.poweredBy}` 
                }, { quoted: msg });
                return true;
            }

            const botIsAdmin = await isBotAdmin(sock, remoteJid);
            if (!botIsAdmin) {
                await sock.sendMessage(remoteJid, { 
                    text: `❌ البوت يجب أن يكون مسؤولاً لاستخدام هذه الميزة${utils.poweredBy}` 
                }, { quoted: msg });
                return true;
            }

            const lowerText = text.toLowerCase().trim();
            const args = lowerText.split(/\s+/);
            const command = args[0];
            const action = args[1];

            if (command === 'antilink') {
                const settings = groupSettings.get(remoteJid);
                if (action === 'on') {
                    groupSettings.set(remoteJid, { antiLink: true });
                    await sock.sendMessage(remoteJid, { 
                        text: `✅ *تم تفعيل Anti-Link*\n\nسيتم حذف الروابط وطرد المرسل تلقائياً${utils.poweredBy}` 
                    }, { quoted: msg });
                } else if (action === 'off') {
                    groupSettings.set(remoteJid, { antiLink: false });
                    await sock.sendMessage(remoteJid, { 
                        text: `❌ *تم إلغاء Anti-Link*${utils.poweredBy}` 
                    }, { quoted: msg });
                } else {
                    await sock.sendMessage(remoteJid, { 
                        text: `*حالة Anti-Link:* ${settings.antiLink ? '✅ مفعل' : '❌ معطل'}\n\nاستخدم:\n- antilink on\n- antilink off${utils.poweredBy}` 
                    }, { quoted: msg });
                }
                return true;
            }

            if (command === 'antibadwords') {
                const settings = groupSettings.get(remoteJid);
                if (action === 'on') {
                    groupSettings.set(remoteJid, { antiBadWords: true });
                    await sock.sendMessage(remoteJid, { 
                        text: `✅ *تم تفعيل Anti-Bad Words*\n\nسيتم تحذير وطرد من يستخدم كلمات سيئة${utils.poweredBy}` 
                    }, { quoted: msg });
                } else if (action === 'off') {
                    groupSettings.set(remoteJid, { antiBadWords: false });
                    await sock.sendMessage(remoteJid, { 
                        text: `❌ *تم إلغاء Anti-Bad Words*${utils.poweredBy}` 
                    }, { quoted: msg });
                } else {
                    await sock.sendMessage(remoteJid, { 
                        text: `*حالة Anti-Bad Words:* ${settings.antiBadWords ? '✅ مفعل' : '❌ معطل'}\n\nاستخدم:\n- antibadwords on\n- antibadwords off${utils.poweredBy}` 
                    }, { quoted: msg });
                }
                return true;
            }

            if (command === 'antitime' || command === 'auto') {
                const settings = groupSettings.get(remoteJid);
                
                if (action === 'on') {
                    const result = await setAntiTime(sock, remoteJid, true, '20:00', '08:00');
                    await sock.sendMessage(remoteJid, { 
                        text: `${result.message}${utils.poweredBy}` 
                    }, { quoted: msg });
                } else if (action === 'off') {
                    const result = await setAntiTime(sock, remoteJid, false);
                    await sock.sendMessage(remoteJid, { 
                        text: `${result.message}${utils.poweredBy}` 
                    }, { quoted: msg });
                } else if (action === 'set' && args[2] && args[3]) {
                    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
                    if (!timeRegex.test(args[2]) || !timeRegex.test(args[3])) {
                        await sock.sendMessage(remoteJid, { 
                            text: `⚠️ تنسيق الوقت غير صحيح! استخدم HH:MM بنظام 24 ساعة\n\nمثال: antitime set 20:00 08:00${utils.poweredBy}` 
                        }, { quoted: msg });
                        return true;
                    }
                    const result = await setAntiTime(sock, remoteJid, true, args[2], args[3]);
                    await sock.sendMessage(remoteJid, { 
                        text: `${result.message}${utils.poweredBy}` 
                    }, { quoted: msg });
                } else if (action === 'status') {
                    const antiTime = settings.antiTime || {};
                    const statusText = `📊 *حالة التحكم التلقائي بالمجموعة*

الحالة: ${antiTime.enabled ? '✅ مفعل' : '❌ معطل'}
حالة المجموعة: ${antiTime.status === 'closed' ? '🔒 مغلقة' : '🔓 مفتوحة'}
وقت الإغلاق: ${antiTime.closeTime || '20:00'}
وقت الفتح: ${antiTime.openTime || '08:00'}`;
                    await sock.sendMessage(remoteJid, { 
                        text: `${statusText}${utils.poweredBy}` 
                    }, { quoted: msg });
                } else {
                    const helpText = `*أوامر Anti-Time:*

- antitime on - تفعيل الإغلاق التلقائي
- antitime off - إلغاء الإغلاق التلقائي
- antitime set HH:MM HH:MM - تحديد وقت الإغلاق والفتح
- antitime status - عرض الحالة

*مثال:*
antitime set 20:00 08:00
(إغلاق الساعة 8 مساءً، فتح الساعة 8 صباحاً)`;
                    await sock.sendMessage(remoteJid, { 
                        text: `${helpText}${utils.poweredBy}` 
                    }, { quoted: msg });
                }
                return true;
            }

            if (command === 'groupsettings' || command === 'اعدادات') {
                const settings = groupSettings.get(remoteJid);
                const antiTime = settings.antiTime || {};
                
                const settingsText = `*⚙️ إعدادات المجموعة*

🔗 *Anti-Link:* ${settings.antiLink ? '✅ مفعل' : '❌ معطل'}
🚫 *Anti-Bad Words:* ${settings.antiBadWords ? '✅ مفعل' : '❌ معطل'}
⏰ *Anti-Time:* ${antiTime.enabled ? '✅ مفعل' : '❌ معطل'}
   └ الإغلاق: ${antiTime.closeTime || '20:00'}
   └ الفتح: ${antiTime.openTime || '08:00'}
   └ الحالة: ${antiTime.status === 'closed' ? '🔒 مغلقة' : '🔓 مفتوحة'}
👋 *Welcome:* ${settings.welcome ? '✅ مفعل' : '❌ معطل'}

*الأوامر المتاحة:*
- antilink on/off
- antibadwords on/off
- antitime on/off/set/status`;

                await sock.sendMessage(remoteJid, { 
                    text: `${settingsText}${utils.poweredBy}` 
                }, { quoted: msg });
                return true;
            }

            return false;
        } catch (error) {
            console.error('Group Admin Error:', error.message);
            return false;
        }
    }
};
