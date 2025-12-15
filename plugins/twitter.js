import axios from 'axios';
import * as cheerio from 'cheerio';

export default {
    name: 'Twitter/X Downloader',
    patterns: [
        /twitter\.com\/.*\/status\//i,
        /x\.com\/.*\/status\//i
    ],
    
    async handler(sock, remoteJid, url, msg, utils) {
        try {
            await utils.react(sock, msg, '⏳');
            
            const videoLinks = await fetchTwitterVideo(url);
            
            if (!videoLinks || videoLinks.length === 0) {
                throw new Error('لم يتم العثور على فيديو');
            }

            const bestQuality = videoLinks[videoLinks.length - 1];

            await utils.react(sock, msg, '✅');
            
            await sock.sendMessage(remoteJid, {
                video: { url: bestQuality.downloadUrl },
                caption: utils.poweredBy
            }, { quoted: msg });

            return true;
        } catch (error) {
            console.error('Twitter Error:', error.message);
            await utils.react(sock, msg, '❌');
            await sock.sendMessage(remoteJid, {
                text: `❌ فشل تحميل فيديو Twitter/X\n${utils.poweredBy}`
            }, { quoted: msg });
            return false;
        }
    }
};

async function fetchTwitterVideo(url) {
    try {
        const response = await axios.post('https://twmate.com/', new URLSearchParams({
            page: url,
            ftype: 'all',
            ajax: '1'
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Accept': '*/*',
                'X-Requested-With': 'XMLHttpRequest',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
                'Referer': 'https://twmate.com/',
            },
            timeout: 30000
        });
        
        const $ = cheerio.load(response.data);
        const videoLinks = [];
        
        $('.btn-dl').each((index, element) => {
            const quality = $(element).parent().prev().text().trim();
            const downloadUrl = $(element).attr('href');
            videoLinks.push({ quality, downloadUrl });
        });

        return videoLinks;
    } catch (error) {
        console.error('Error fetching Twitter video:', error);
        return null;
    }
}
