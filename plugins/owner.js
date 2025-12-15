import config from '../config/config.js';

export default {
    name: 'Owner Info',
    patterns: [],
    commands: ['owner', 'dev', 'developer', 'المطور', 'صاحب'],

    async handler(sock, remoteJid, text, msg, utils, senderPhone) {
        try {
            const ownerInfo = `*「 معلومات عن صاحب البوت 」*

*انستجرام:*
${config.developer.instagramUrl}

*قناة واتساب:*
${config.developer.channelUrl}

*GitHub:*
github.com/omarxarafp

${utils.poweredBy}`;

            await sock.sendMessage(remoteJid, { text: ownerInfo }, { quoted: msg });
            return true;
        } catch (error) {
            console.error('Owner Info Error:', error.message);
            return false;
        }
    }
};
