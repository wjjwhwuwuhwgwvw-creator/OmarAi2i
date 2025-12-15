import config from '../config/config.js';

function getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'صباح الخير';
    if (hour >= 12 && hour < 17) return 'مساء الخير';
    if (hour >= 17 && hour < 21) return 'مساء النور';
    return 'تصبح على خير';
}

function getDate() {
    const d = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return d.toLocaleDateString('ar-MA', options);
}

function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

const fakeDocTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/pdf'
];

export function createFakeContext(senderName, senderPhone) {
    const namebot = config.bot?.name || 'Omar AI';
    const sig = config.developer.instagramUrl;
    const greeting = getGreeting();
    const botdate = getDate();

    return {
        contextInfo: {
            isForwarded: true,
            forwardingScore: 1,
            forwardedNewsletterMessageInfo: {
                newsletterJid: '120363285847738492@newsletter',
                serverMessageId: 103,
                newsletterName: `${namebot} | ${greeting}`
            },
            externalAdReply: {
                title: namebot,
                body: greeting,
                thumbnailUrl: config.bot.profileImageUrl,
                sourceUrl: sig,
                mediaType: 1,
                renderLargerThumbnail: false
            }
        }
    };
}

export function createFakeReply(senderName, text) {
    return {
        key: {
            fromMe: false,
            participant: '0@s.whatsapp.net',
            remoteJid: 'BROADCAST GROUP'
        },
        message: {
            contactMessage: {
                displayName: senderName,
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:;${senderName};;;\nFN:${senderName}\nEND:VCARD`
            }
        }
    };
}

export function createVerifiedBadge() {
    return {
        key: {
            participant: '0@s.whatsapp.net',
            remoteJid: '0@s.whatsapp.net'
        },
        message: {
            conversation: '_تم التحقق عن طريق الواتساب_'
        }
    };
}

export default {
    name: 'All Fake',
    patterns: [],
    commands: [],
    
    createFakeContext,
    createFakeReply,
    createVerifiedBadge,
    getGreeting,
    getDate,
    pickRandom
};
