import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';

const MAX_WHATSAPP_SIZE = 1.9 * 1024 * 1024 * 1024;
const SPLIT_CHUNK_SIZE = 1 * 1024 * 1024 * 1024;
const TEMP_DIR = '/tmp/file_splits';
const CACHE_TTL = 2 * 60 * 1000;

if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const partsCache = new Map();

function getCacheKey(url) {
    return crypto.createHash('md5').update(url).digest('hex');
}

function getCachedParts(url) {
    const key = getCacheKey(url);
    const cached = partsCache.get(key);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        const allExist = cached.parts.every(p => fs.existsSync(p.path));
        if (allExist) {
            console.log(`[Cache] ✅ Found cached parts for ${key.substring(0, 8)}...`);
            return cached;
        }
    }
    
    if (cached) {
        partsCache.delete(key);
    }
    return null;
}

function setCachedParts(url, parts, totalSize, originalName) {
    const key = getCacheKey(url);
    partsCache.set(key, {
        parts: parts,
        totalSize: totalSize,
        originalName: originalName,
        timestamp: Date.now()
    });
    console.log(`[Cache] 💾 Cached ${parts.length} parts for ${key.substring(0, 8)}... (TTL: 2min)`);
    
    setTimeout(() => {
        const cached = partsCache.get(key);
        if (cached && Date.now() - cached.timestamp >= CACHE_TTL) {
            console.log(`[Cache] 🗑️ Expiring cache for ${key.substring(0, 8)}...`);
            cleanupParts(cached.parts);
            partsCache.delete(key);
        }
    }, CACHE_TTL + 5000);
}

export async function downloadWithAria2(url, filename) {
    const tempPath = path.join(TEMP_DIR, `${Date.now()}_${filename}`);
    
    return new Promise((resolve, reject) => {
        console.log(`[aria2] Downloading: ${filename}`);
        
        const aria2 = spawn('aria2c', [
            '-x', '16',
            '-s', '16',
            '-k', '1M',
            '--max-connection-per-server=16',
            '--min-split-size=1M',
            '--file-allocation=none',
            '--continue=true',
            '-d', path.dirname(tempPath),
            '-o', path.basename(tempPath),
            '--timeout=600',
            '--connect-timeout=60',
            '--max-tries=5',
            '--retry-wait=10',
            '--console-log-level=error',
            url
        ]);
        
        let lastProgress = '';
        
        aria2.stdout.on('data', (data) => {
            const output = data.toString();
            const progressMatch = output.match(/\[#\w+\s+[\d.]+\w+\/[\d.]+\w+\((\d+)%\)/);
            if (progressMatch && progressMatch[1] !== lastProgress) {
                lastProgress = progressMatch[1];
                console.log(`[aria2] Progress: ${lastProgress}%`);
            }
        });
        
        aria2.stderr.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg && !msg.includes('NOTICE')) {
                console.log(`[aria2] ${msg}`);
            }
        });
        
        aria2.on('close', (code) => {
            if (code === 0 && fs.existsSync(tempPath)) {
                const size = fs.statSync(tempPath).size;
                console.log(`[aria2] Download complete: ${formatBytes(size)}`);
                resolve(tempPath);
            } else {
                reject(new Error(`aria2c exited with code ${code}`));
            }
        });
        
        aria2.on('error', (err) => {
            reject(err);
        });
    });
}

export async function getRemoteFileSize(url) {
    try {
        const response = await fetch(url, {
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const contentLength = response.headers.get('content-length');
        return contentLength ? parseInt(contentLength) : null;
    } catch (error) {
        console.error('[FileSplitter] Error getting file size:', error.message);
        return null;
    }
}

export function needsSplitting(fileSize) {
    return fileSize && fileSize > MAX_WHATSAPP_SIZE;
}

export async function splitFile(filePath, chunkSize = SPLIT_CHUNK_SIZE) {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const numParts = Math.ceil(fileSize / chunkSize);
    const parts = [];
    
    const baseName = path.basename(filePath);
    const chunkSizeInt = Math.floor(chunkSize);
    
    console.log(`[FileSplitter] ⚡ Fast splitting ${formatBytes(fileSize)} into ${numParts} parts...`);
    
    const splitPromises = [];
    
    for (let i = 0; i < numParts; i++) {
        const partPath = path.join(TEMP_DIR, `${baseName}.part${String(i + 1).padStart(3, '0')}`);
        const start = i * chunkSizeInt;
        const end = Math.min(start + chunkSizeInt, fileSize);
        const partSize = end - start;
        
        const partInfo = {
            path: partPath,
            partNumber: i + 1,
            totalParts: numParts,
            size: partSize,
            originalName: baseName
        };
        parts.push(partInfo);
        
        splitPromises.push(
            new Promise((resolve, reject) => {
                const readStream = fs.createReadStream(filePath, { 
                    start, 
                    end: end - 1,
                    highWaterMark: 64 * 1024 * 1024
                });
                const writeStream = fs.createWriteStream(partPath);
                
                readStream.pipe(writeStream);
                
                writeStream.on('finish', () => {
                    console.log(`[FileSplitter] ✅ Part ${i + 1}/${numParts}: ${formatBytes(partSize)}`);
                    resolve();
                });
                
                writeStream.on('error', reject);
                readStream.on('error', reject);
            })
        );
    }
    
    await Promise.all(splitPromises);
    
    console.log(`[FileSplitter] ⚡ All ${numParts} parts created in parallel!`);
    
    return parts;
}

export async function splitFileFromUrl(url, filename, onProgress = null) {
    const cached = getCachedParts(url);
    if (cached) {
        console.log(`[FileSplitter] 🚀 Using cached parts!`);
        return {
            needsSplit: true,
            parts: cached.parts,
            totalSize: cached.totalSize,
            originalName: cached.originalName,
            fromCache: true
        };
    }
    
    console.log(`[FileSplitter] Starting download: ${filename}`);
    
    const tempPath = await downloadWithAria2(url, filename);
    const stats = fs.statSync(tempPath);
    
    console.log(`[FileSplitter] File size: ${formatBytes(stats.size)}`);
    
    if (!needsSplitting(stats.size)) {
        return {
            needsSplit: false,
            filePath: tempPath,
            fileSize: stats.size
        };
    }
    
    console.log(`[FileSplitter] ⚡ Fast splitting file...`);
    
    const parts = await splitFile(tempPath);
    
    try {
        fs.unlinkSync(tempPath);
    } catch (e) {
        console.log(`[FileSplitter] Could not delete temp file: ${e.message}`);
    }
    
    setCachedParts(url, parts, stats.size, filename);
    
    return {
        needsSplit: true,
        parts: parts,
        totalSize: stats.size,
        originalName: filename,
        fromCache: false
    };
}

export function cleanupParts(parts) {
    if (!parts) return;
    for (const part of parts) {
        try {
            if (fs.existsSync(part.path)) {
                fs.unlinkSync(part.path);
            }
        } catch (e) {
            console.error(`[FileSplitter] Cleanup error: ${e.message}`);
        }
    }
}

export function cleanupPartsIfNotCached(parts, url) {
    const key = getCacheKey(url);
    if (!partsCache.has(key)) {
        cleanupParts(parts);
    }
}

export function getJoinInstructions(originalName, numParts) {
    let partsList = '';
    for (let i = 1; i <= numParts; i++) {
        partsList += `   • ${originalName}.part${String(i).padStart(3, '0')}\n`;
    }
    
    return `📦 *تعليمات جمع الملف*

الملف الأصلي: *${originalName}*
عدد الأجزاء: *${numParts}*

📁 *أسماء الملفات:*
${partsList}
🔧 *طريقة الجمع باستخدام ZArchiver:*
1️⃣ حمّل جميع الأجزاء (${numParts} ملفات)
2️⃣ افتح تطبيق ZArchiver
3️⃣ انتقل إلى: Android/media/WhatsApp/Documents
4️⃣ اضغط مطولاً على الجزء الأول (.part001)
5️⃣ اختر "دمج الملفات" أو "Combine"
6️⃣ انتظر حتى يكتمل الدمج ✅

⚠️ *ملاحظة:* تأكد من تحميل جميع الأجزاء قبل الدمج

💡 إذا لم يكن لديك ZArchiver، أرسل "zarchiver" لتحميله`;
}

export function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function clearExpiredCache() {
    const now = Date.now();
    for (const [key, cached] of partsCache.entries()) {
        if (now - cached.timestamp >= CACHE_TTL) {
            cleanupParts(cached.parts);
            partsCache.delete(key);
            console.log(`[Cache] 🗑️ Cleared expired cache: ${key.substring(0, 8)}...`);
        }
    }
}

setInterval(clearExpiredCache, 60 * 1000);

export { MAX_WHATSAPP_SIZE, SPLIT_CHUNK_SIZE, TEMP_DIR };
