import axios from 'axios';
import crypto from 'crypto';

const savetube = {
    api: {
        base: "https://media.savetube.me/api",
        cdn: "/random-cdn",
        info: "/v2/info",
        download: "/download"
    },
    headers: {
        'accept': '*/*',
        'content-type': 'application/json',
        'origin': 'https://yt.savetube.me',
        'referer': 'https://yt.savetube.me/',
        'user-agent': 'Postify/1.0.0'
    },
    formats: ['144', '240', '360', '480', '720', '1080', 'mp3'],

    hexToBuffer: (hexString) => {
        const matches = hexString.match(/.{1,2}/g);
        return Buffer.from(matches.join(''), 'hex');
    },

    decrypt: async (enc) => {
        try {
            const secretKey = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
            const data = Buffer.from(enc, 'base64');
            const iv = data.slice(0, 16);
            const content = data.slice(16);
            const key = savetube.hexToBuffer(secretKey);

            const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
            let decrypted = decipher.update(content);
            decrypted = Buffer.concat([decrypted, decipher.final()]);

            return JSON.parse(decrypted.toString());
        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    },

    extractVideoId: (url) => {
        const patterns = [
            /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
            /youtu\.be\/([a-zA-Z0-9_-]{11})/,
            /[?&]v=([a-zA-Z0-9_-]{11})/
        ];
        for (let pattern of patterns) {
            if (pattern.test(url)) return url.match(pattern)[1];
        }
        return null;
    },

    download: async (url, format = '360') => {
        const id = savetube.extractVideoId(url);
        if (!id) {
            return { success: false, error: 'رابط يوتيوب غير صالح' };
        }

        try {
            const cdnResponse = await axios.get(`${savetube.api.base}${savetube.api.cdn}`, {
                headers: savetube.headers,
                timeout: 15000
            });
            const cdn = cdnResponse.data.cdn;

            const infoResponse = await axios.post(`https://${cdn}${savetube.api.info}`, {
                url: `https://www.youtube.com/watch?v=${id}`
            }, {
                headers: savetube.headers,
                timeout: 20000
            });

            const decrypted = await savetube.decrypt(infoResponse.data.data);

            const dlResponse = await axios.post(`https://${cdn}${savetube.api.download}`, {
                id: id,
                downloadType: format === 'mp3' ? 'audio' : 'video',
                quality: format === 'mp3' ? '128' : format,
                key: decrypted.key
            }, {
                headers: savetube.headers,
                timeout: 30000
            });

            return {
                success: true,
                title: decrypted.title || 'فيديو YouTube',
                type: format === 'mp3' ? 'audio' : 'video',
                format: format,
                thumbnail: decrypted.thumbnail || `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
                downloadUrl: dlResponse.data.data.downloadUrl,
                duration: decrypted.duration || 0,
                id: id
            };

        } catch (error) {
            console.error('Savetube error:', error.message);
            return { success: false, error: error.message };
        }
    }
};

function formatDuration(seconds) {
    if (!seconds) return '0:00';
    if (typeof seconds === 'string') {
        seconds = parseInt(seconds) || 0;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default {
    name: 'YouTube Downloader',
    patterns: [
        /youtube\.com\/watch/i,
        /youtu\.be\//i,
        /youtube\.com\/shorts\//i
    ],

    async handler(sock, remoteJid, url, msg, utils) {
        try {
            await utils.react(sock, msg, '⏳');

            const result = await savetube.download(url, '360');

            if (!result.success) {
                throw new Error(result.error || 'فشل التحميل');
            }

            await utils.react(sock, msg, '✅');

            await sock.sendMessage(remoteJid, {
                video: { url: result.downloadUrl },
                caption: `*${result.title}*\nالمدة: ${formatDuration(result.duration)}\n${utils.poweredBy}`
            }, { quoted: msg });

            return true;
        } catch (error) {
            console.error('YouTube Error:', error.message);
            await utils.react(sock, msg, '❌');
            await sock.sendMessage(remoteJid, {
                text: `❌ فشل تحميل فيديو YouTube\n\nجرب مرة أخرى أو استخدم رابط آخر\n${utils.poweredBy}`
            }, { quoted: msg });
            return false;
        }
    }
};
