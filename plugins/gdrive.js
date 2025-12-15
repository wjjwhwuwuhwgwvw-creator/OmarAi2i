import fetch from "node-fetch";
import fs from "fs";
import { 
    getRemoteFileSize, 
    needsSplitting, 
    splitFileFromUrl, 
    cleanupParts, 
    getJoinInstructions,
    formatBytes as formatSize
} from "../src/utils/file-splitter.js";

export default {
    name: 'Google Drive Downloader',
    patterns: [
        /drive\.google\.com/i,
        /drive\.usercontent\.google\.com/i
    ],
    
    async handler(sock, remoteJid, url, msg, utils) {
        try {
            await utils.react(sock, msg, '⏳');
            
            const result = await downloadFromGDrive(url);
            
            if (result.error) {
                throw new Error(result.message || 'فشل في جلب الملف');
            }

            const fileSize = await getRemoteFileSize(result.downloadUrl);
            
            if (needsSplitting(fileSize)) {
                await utils.react(sock, msg, '✂️');
                
                await sock.sendMessage(remoteJid, {
                    text: `📦 الملف كبير (${formatSize(fileSize)})\n⏳ جاري التحميل والتقسيم...\nهذا قد يستغرق بعض الوقت...`
                }, { quoted: msg });
                
                const splitResult = await splitFileFromUrl(result.downloadUrl, result.fileName);
                
                if (splitResult.needsSplit) {
                    await sock.sendMessage(remoteJid, {
                        text: `✂️ تم تقسيم الملف إلى ${splitResult.parts.length} أجزاء\n📤 جاري الإرسال...`
                    }, { quoted: msg });
                    
                    for (const part of splitResult.parts) {
                        await utils.react(sock, msg, `📤`);
                        
                        const caption = `📦 ${part.originalName}\n📎 الجزء ${part.partNumber}/${part.totalParts}\nالحجم: ${formatSize(part.size)}\n${utils.poweredBy}`;
                        
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

            await utils.react(sock, msg, '⬇️');

            const caption = `${result.fileName}\nالحجم: ${result.fileSize}\n${utils.poweredBy}`;

            await sock.sendMessage(remoteJid, {
                document: { url: result.downloadUrl },
                fileName: result.fileName,
                mimetype: result.mimetype || 'application/octet-stream',
                caption: caption
            }, { quoted: msg });

            await utils.react(sock, msg, '✅');
            return true;
        } catch (error) {
            console.error('GDrive Error:', error.message);
            await utils.react(sock, msg, '❌');
            await sock.sendMessage(remoteJid, {
                text: `❌ فشل تحميل ملف Google Drive\n\n${error.message}\n${utils.poweredBy}`
            }, { quoted: msg });
            return false;
        }
    }
};

async function downloadFromGDrive(url) {
    try {
        const cleanUrl = url.replace(/&amp;/g, '&');
        
        let fileId = null;
        const patterns = [
            /\/d\/([a-zA-Z0-9_-]+)/,
            /id=([a-zA-Z0-9_-]+)/,
            /folders\/([a-zA-Z0-9_-]+)/
        ];
        
        for (const pattern of patterns) {
            const match = cleanUrl.match(pattern);
            if (match) {
                fileId = match[1];
                break;
            }
        }
        
        if (!fileId) {
            return { error: true, message: 'لم يتم العثور على ID الملف' };
        }
        
        console.log(`[GDrive] File ID: ${fileId}`);
        
        const fileInfo = await getFileInfo(fileId);
        console.log(`[GDrive] File: ${fileInfo.fileName}, Size: ${fileInfo.fileSize}`);
        
        const downloadUrl = await getLargeFileDownloadUrl(fileId);
        
        if (!downloadUrl) {
            return { error: true, message: 'فشل في الحصول على رابط التحميل' };
        }
        
        console.log(`[GDrive] Final Download URL: ${downloadUrl.substring(0, 100)}...`);
        
        return {
            downloadUrl,
            fileName: fileInfo.fileName,
            fileSize: fileInfo.fileSize,
            mimetype: getMimeType(fileInfo.fileName)
        };
        
    } catch (error) {
        console.error('[GDrive] Error:', error);
        return { error: true, message: error.message };
    }
}

async function getFileInfo(fileId) {
    let fileName = 'google_drive_file';
    let fileSize = 'غير معروف';
    
    try {
        const infoUrl = `https://drive.google.com/file/d/${fileId}/view`;
        const response = await fetch(infoUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        
        const html = await response.text();
        
        const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                          html.match(/"title":"([^"]+)"/) ||
                          html.match(/<title>([^<]+)<\/title>/i);
        
        if (titleMatch) {
            fileName = titleMatch[1]
                .replace(' - Google Drive', '')
                .replace(/&#(\d+);/g, (m, c) => String.fromCharCode(c))
                .trim();
        }
        
        const sizeMatch = html.match(/\((\d+(?:[.,]\d+)?\s*(?:KB|MB|GB|TB|bytes?))\)/i) ||
                         html.match(/"sizeBytes":"(\d+)"/);
        
        if (sizeMatch) {
            if (sizeMatch[1].match(/^\d+$/)) {
                fileSize = formatSize(parseInt(sizeMatch[1]));
            } else {
                fileSize = sizeMatch[1];
            }
        }
    } catch (e) {
        console.error('[GDrive] Info error:', e.message);
    }
    
    return { fileName, fileSize };
}

async function getLargeFileDownloadUrl(fileId) {
    try {
        const userContentUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
        console.log(`[GDrive] Fetching: ${userContentUrl}`);
        
        const response1 = await fetch(userContentUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        
        const contentType = response1.headers.get('content-type');
        if (contentType && !contentType.includes('text/html')) {
            console.log('[GDrive] Direct download (small file)');
            return userContentUrl;
        }
        
        const html = await response1.text();
        console.log(`[GDrive] Got HTML, length: ${html.length}`);
        
        const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/);
        const confirmMatch = html.match(/name="confirm"\s+value="([^"]+)"/);
        
        const uuid = uuidMatch ? uuidMatch[1] : null;
        const confirm = confirmMatch ? confirmMatch[1] : 't';
        
        console.log(`[GDrive] Confirm: ${confirm}, UUID: ${uuid}`);
        
        let finalUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${confirm}`;
        if (uuid) {
            finalUrl += `&uuid=${uuid}`;
        }
        
        const verifyResponse = await fetch(finalUrl, {
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        const finalContentType = verifyResponse.headers.get('content-type');
        if (finalContentType && !finalContentType.includes('text/html')) {
            console.log('[GDrive] Final URL verified successfully');
            return finalUrl;
        }
        
        console.log('[GDrive] Fallback to confirm=t');
        return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
        
    } catch (error) {
        console.error('[GDrive] Download URL error:', error);
        return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
    }
}

function getMimeType(fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes = {
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed',
        '7z': 'application/x-7z-compressed',
        'mp3': 'audio/mpeg',
        'mp4': 'video/mp4',
        'mkv': 'video/x-matroska',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'apk': 'application/vnd.android.package-archive',
        'exe': 'application/x-msdownload'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}
