import * as cheerio from "cheerio";
import fetch from "node-fetch";
import fs from "fs";
import { 
    needsSplitting, 
    splitFileFromUrl, 
    cleanupParts, 
    getJoinInstructions,
    formatBytes
} from "../src/utils/file-splitter.js";

export default {
    name: 'Mediafire Downloader',
    patterns: [
        /mediafire\.com\/(file|folder)\//i
    ],
    
    async handler(sock, remoteJid, url, msg, utils) {
        try {
            await utils.react(sock, msg, '⏳');
            
            const result = await mediafire(url);
            
            if (!result || !result.download) {
                throw new Error('فشل في جلب الملف');
            }

            if (needsSplitting(result.size)) {
                await utils.react(sock, msg, '✂️');
                
                await sock.sendMessage(remoteJid, {
                    text: `📦 الملف كبير (${result.sizeReadable})\n⏳ جاري التحميل والتقسيم...\nهذا قد يستغرق بعض الوقت...`
                }, { quoted: msg });
                
                const splitResult = await splitFileFromUrl(result.download, result.filename);
                
                if (splitResult.needsSplit) {
                    await sock.sendMessage(remoteJid, {
                        text: `✂️ تم تقسيم الملف إلى ${splitResult.parts.length} أجزاء\n📤 جاري الإرسال...`
                    }, { quoted: msg });
                    
                    for (const part of splitResult.parts) {
                        await utils.react(sock, msg, `📤`);
                        
                        const caption = `📦 ${part.originalName}\n📎 الجزء ${part.partNumber}/${part.totalParts}\nالحجم: ${formatBytes(part.size)}\n${utils.poweredBy}`;
                        
                        await sock.sendMessage(remoteJid, {
                            document: fs.readFileSync(part.path),
                            fileName: `${part.originalName}.part${String(part.partNumber).padStart(3, '0')}`,
                            mimetype: 'application/octet-stream',
                            caption: caption
                        }, { quoted: msg });
                        
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                    
                    await sock.sendMessage(remoteJid, {
                        text: getJoinInstructions(splitResult.originalName, splitResult.parts.length)
                    }, { quoted: msg });
                    
                    cleanupParts(splitResult.parts);
                    
                    await utils.react(sock, msg, '✅');
                    return true;
                }
            }

            await utils.react(sock, msg, '✅');

            const caption = `${result.filename}\nالحجم: ${result.sizeReadable}\n${utils.poweredBy}`;

            await sock.sendMessage(remoteJid, {
                document: { url: result.download },
                fileName: result.filename,
                mimetype: result.mimetype || 'application/octet-stream',
                caption: caption
            }, { quoted: msg });

            return true;
        } catch (error) {
            console.error('Mediafire Error:', error.message);
            await utils.react(sock, msg, '❌');
            await sock.sendMessage(remoteJid, {
                text: `❌ فشل تحميل ملف Mediafire\n${utils.poweredBy}`
            }, { quoted: msg });
            return false;
        }
    }
};

const mediaRegex = /https?:\/\/(www\.)?mediafire\.com\/(file|folder)\/(\w+)/;

async function mediafire(url) {
    const match = mediaRegex.exec(url);
    if (!match) throw new Error("رابط غير صالح");

    const id = match[3];

    const response = await fetch(url, { timeout: 30000 });
    if (!response.ok) throw new Error(`فشل الاتصال: ${response.status}`);
    
    const html = await response.text();
    const $ = cheerio.load(html);

    const download = $("a#downloadButton").attr("href");
    if (!download) throw new Error("فشل في جلب رابط التحميل");

    const infoResponse = await fetch(
        `https://www.mediafire.com/api/1.5/file/get_info.php?response_format=json&quick_key=${id}`,
        { timeout: 15000 }
    );
    
    if (!infoResponse.ok) throw new Error(`فشل API: ${infoResponse.status}`);
    
    const json = await infoResponse.json();
    if (json.response.result !== "Success") throw new Error("فشل في جلب معلومات الملف");
    
    const info = json.response.file_info;
    const size = parseInt(info.size);
    const ext = info.filename.split(".").pop() || 'bin';

    return {
        filename: info.filename,
        ext: ext,
        size: size,
        sizeReadable: formatBytes(size),
        download: download,
        filetype: info.filetype,
        mimetype: info.mimetype || `application/${ext}`,
        privacy: info.privacy,
        owner_name: info.owner_name,
    };
}
