import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJson(filename, defaultValue = {}) {
    const filePath = path.join(DATA_DIR, filename);
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (e) {
        console.error(`Error loading ${filename}:`, e.message);
    }
    return defaultValue;
}

function saveJson(filename, data) {
    const filePath = path.join(DATA_DIR, filename);
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`Error saving ${filename}:`, e.message);
    }
}

export const blocklist = {
    data: (() => {
        const loaded = loadJson('blocklist.json', { blocked: [] });
        if (!loaded.blocked || !Array.isArray(loaded.blocked)) {
            loaded.blocked = [];
        }
        return loaded;
    })(),
    
    isBlocked(phone) {
        if (!this.data.blocked || !Array.isArray(this.data.blocked)) {
            this.data.blocked = [];
        }
        return this.data.blocked.some(b => b.phone === phone);
    },
    
    add(phone, reason = '') {
        if (!this.data.blocked || !Array.isArray(this.data.blocked)) {
            this.data.blocked = [];
        }
        if (!this.isBlocked(phone)) {
            this.data.blocked.push({ phone, reason, blockedAt: new Date().toISOString() });
            saveJson('blocklist.json', this.data);
        }
    },
    
    remove(phone) {
        if (!this.data.blocked || !Array.isArray(this.data.blocked)) {
            this.data.blocked = [];
        }
        this.data.blocked = this.data.blocked.filter(b => b.phone !== phone);
        saveJson('blocklist.json', this.data);
    },
    
    getAll() {
        return this.data.blocked || [];
    },
    
    count() {
        return (this.data.blocked || []).length;
    }
};

export const users = {
    data: (() => {
        const loaded = loadJson('users.json', { users: [] });
        if (!loaded.users || !Array.isArray(loaded.users)) {
            loaded.users = [];
        }
        return loaded;
    })(),
    
    _ensureArray() {
        if (!this.data.users || !Array.isArray(this.data.users)) {
            this.data.users = [];
        }
    },
    
    get(phone) {
        this._ensureArray();
        return this.data.users.find(u => u.phone === phone);
    },
    
    update(phone, name = '') {
        this._ensureArray();
        const existing = this.data.users.find(u => u.phone === phone);
        if (existing) {
            existing.name = name || existing.name;
            existing.lastActive = new Date().toISOString();
        } else {
            this.data.users.push({
                phone,
                name,
                createdAt: new Date().toISOString(),
                lastActive: new Date().toISOString()
            });
        }
        saveJson('users.json', this.data);
    },
    
    getAll() {
        return this.data;
    },
    
    count() {
        this._ensureArray();
        return this.data.users.length;
    }
};

export const downloads = {
    data: (() => {
        const loaded = loadJson('downloads.json', { downloads: [] });
        if (!loaded.downloads || !Array.isArray(loaded.downloads)) {
            loaded.downloads = [];
        }
        return loaded;
    })(),
    
    _ensureArray() {
        if (!this.data.downloads || !Array.isArray(this.data.downloads)) {
            this.data.downloads = [];
        }
    },
    
    add(phone, appId, appName, fileType, fileSize) {
        this._ensureArray();
        this.data.downloads.push({
            phone,
            appId,
            appName,
            fileType,
            fileSize,
            createdAt: new Date().toISOString()
        });
        if (this.data.downloads.length > 10000) {
            this.data.downloads = this.data.downloads.slice(-5000);
        }
        saveJson('downloads.json', this.data);
    },
    
    getByUser(phone, limit = 10) {
        this._ensureArray();
        return this.data.downloads
            .filter(d => d.phone === phone)
            .slice(-limit)
            .reverse();
    },
    
    getStats() {
        this._ensureArray();
        const today = new Date().toISOString().split('T')[0];
        const todayDownloads = this.data.downloads.filter(d => 
            d.createdAt && d.createdAt.startsWith(today)
        ).length;
        
        const totalSize = this.data.downloads.reduce((sum, d) => sum + (d.fileSize || 0), 0);
        
        const appCounts = {};
        this.data.downloads.forEach(d => {
            if (d.appName) {
                appCounts[d.appName] = (appCounts[d.appName] || 0) + 1;
            }
        });
        
        const topApps = Object.entries(appCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([app_name, count]) => ({ app_name, count }));
        
        return {
            totalUsers: users.count(),
            totalDownloads: this.data.downloads.length,
            todayDownloads,
            totalSize,
            blockedUsers: blocklist.count(),
            topApps
        };
    }
};

export const groupSettings = {
    data: (() => {
        const loaded = loadJson('groups.json', { groups: {} });
        if (!loaded.groups || typeof loaded.groups !== 'object') {
            loaded.groups = {};
        }
        return loaded;
    })(),
    
    _ensureObject() {
        if (!this.data.groups || typeof this.data.groups !== 'object') {
            this.data.groups = {};
        }
    },
    
    get(groupId) {
        this._ensureObject();
        return this.data.groups[groupId] || {
            antiLink: true,
            antiBadWords: true,
            antiPrivate: true,
            antiTime: {
                enabled: false,
                closeTime: '20:00',
                openTime: '08:00',
                status: 'opened'
            },
            welcome: true,
            originalName: ''
        };
    },
    
    set(groupId, settings) {
        this._ensureObject();
        this.data.groups[groupId] = { ...this.get(groupId), ...settings };
        saveJson('groups.json', this.data);
    },
    
    remove(groupId) {
        this._ensureObject();
        delete this.data.groups[groupId];
        saveJson('groups.json', this.data);
    },
    
    getAll() {
        this._ensureObject();
        return this.data.groups;
    }
};

export const antiPrivateSettings = {
    data: loadJson('antiPrivate.json', { enabled: false, groupLink: 'https://chat.whatsapp.com/JZ4mpJqjG2DGoGKKHbjTpy?mode=hqrc', blockedInPrivate: [] }),
    
    isEnabled() {
        return this.data.enabled;
    },
    
    setEnabled(enabled) {
        this.data.enabled = enabled;
        saveJson('antiPrivate.json', this.data);
    },
    
    getGroupLink() {
        return this.data.groupLink;
    },
    
    setGroupLink(link) {
        this.data.groupLink = link;
        saveJson('antiPrivate.json', this.data);
    },
    
    addBlockedInPrivate(phone) {
        if (!this.data.blockedInPrivate) {
            this.data.blockedInPrivate = [];
        }
        if (!this.data.blockedInPrivate.includes(phone)) {
            this.data.blockedInPrivate.push(phone);
            saveJson('antiPrivate.json', this.data);
        }
    },
    
    isBlockedInPrivate(phone) {
        return this.data.blockedInPrivate?.includes(phone) || false;
    },
    
    removeBlockedInPrivate(phone) {
        if (this.data.blockedInPrivate) {
            this.data.blockedInPrivate = this.data.blockedInPrivate.filter(p => p !== phone);
            saveJson('antiPrivate.json', this.data);
        }
    }
};

export const warningsTracker = {
    data: loadJson('warnings.json', { users: {} }),
    
    getWarnings(phone) {
        return this.data.users[phone]?.count || 0;
    },
    
    addWarning(phone, reason) {
        if (!this.data.users[phone]) {
            this.data.users[phone] = { count: 0, reasons: [], lastWarning: null };
        }
        this.data.users[phone].count++;
        this.data.users[phone].reasons.push({ reason, time: new Date().toISOString() });
        this.data.users[phone].lastWarning = new Date().toISOString();
        saveJson('warnings.json', this.data);
        return this.data.users[phone].count;
    },
    
    resetWarnings(phone) {
        delete this.data.users[phone];
        saveJson('warnings.json', this.data);
    }
};
