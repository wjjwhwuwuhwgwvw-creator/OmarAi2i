import { spawn, exec, execSync } from 'child_process';

export default {
    name: 'Ping',
    patterns: [],
    commands: ['ping', 'speed', 'بينغ', 'سرعة'],

    async handler(sock, remoteJid, text, msg, utils, senderPhone) {
        try {
            const start = performance.now();
            
            const latency = (performance.now() - start).toFixed(2);
            
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);

            const memUsage = process.memoryUsage();
            const memUsed = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
            const memTotal = (memUsage.heapTotal / 1024 / 1024).toFixed(2);

            let systemInfo = '';
            try {
                const hostname = execSync('hostname', { encoding: 'utf8' }).trim();
                systemInfo = `\n*الخادم:* ${hostname}`;
            } catch (e) {
            }

            const response = `*🏓 بونغ!*

*السرعة:* ${latency} ms
*وقت التشغيل:* ${hours}س ${minutes}د ${seconds}ث
*الذاكرة:* ${memUsed} MB / ${memTotal} MB${systemInfo}

${utils.poweredBy}`;

            await sock.sendMessage(remoteJid, { text: response }, { quoted: msg });
            return true;
        } catch (error) {
            console.error('Ping Error:', error.message);
            await sock.sendMessage(remoteJid, { text: `*🏓 بونغ!*\n\nالبوت يعمل بشكل طبيعي${utils.poweredBy}` }, { quoted: msg });
            return false;
        }
    }
};
