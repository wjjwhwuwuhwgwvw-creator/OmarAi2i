import axios from 'axios';

const aiLabs = {
  api: {
    base: 'https://text2pet.zdex.top',
    endpoints: {
      images: '/images'
    }
  },
  headers: {
    'user-agent': 'NB Android/1.0.0',
    'accept-encoding': 'gzip',
    'content-type': 'application/json',
    authorization: ''
  },
  state: { token: null },
  setup: {
    cipher: 'hbMcgZLlzvghRlLbPcTbCpfcQKM0PcU0zhPcTlOFMxBZ1oLmruzlVp9remPgi0QWP0QW',
    shiftValue: 3,
    dec(text, shift) {
      return [...text].map(c =>
        /[a-z]/.test(c) ?
        String.fromCharCode((c.charCodeAt(0) - 97 - shift + 26) % 26 + 97) :
        /[A-Z]/.test(c) ?
        String.fromCharCode((c.charCodeAt(0) - 65 - shift + 26) % 26 + 65) :
        c
      ).join('');
    },
    decrypt: async () => {
      if (aiLabs.state.token) return aiLabs.state.token;
      const decrypted = aiLabs.setup.dec(aiLabs.setup.cipher, aiLabs.setup.shiftValue);
      aiLabs.state.token = decrypted;
      aiLabs.headers.authorization = decrypted;
      return decrypted;
    }
  },
  generateImage: async (prompt = '') => {
    if (!prompt?.trim() || !/^[a-zA-Z0-9\s.,!?'-]+$/.test(prompt)) {
      return { success: false, result: { error: 'يجب كتابة الوصف بالإنجليزية فقط' } };
    }
    await aiLabs.setup.decrypt();
    try {
      const payload = { prompt };
      const url = aiLabs.api.base + aiLabs.api.endpoints.images;
      const res = await axios.post(url, payload, { headers: aiLabs.headers, timeout: 60000 });
      if (res.data.code !== 0 || !res.data.data) {
        return { success: false, result: { error: 'فشل إنشاء الصورة' } };
      }
      return { success: true, result: { url: res.data.data, prompt } };
    } catch (err) {
      return { success: false, result: { error: err.message } };
    }
  }
};

export default {
    name: 'AI Image Generator',
    patterns: [],
    commands: ['ai-image', 'aiimage', 'imagine', 'صورة'],

    async handler(sock, remoteJid, text, msg, utils, senderPhone) {
        try {
            const args = text.split(/\s+/).slice(1).join(' ').trim();
            
            if (!args) {
                await sock.sendMessage(remoteJid, { 
                    text: `*كيفية استخدام مولد الصور:*

اكتب وصف الصورة بالإنجليزية:
ai-image a beautiful sunset over mountains

*أمثلة:*
- ai-image cute cat playing with yarn
- ai-image futuristic city at night
- ai-image fantasy dragon in the sky${utils.poweredBy}` 
                }, { quoted: msg });
                return true;
            }

            await utils.react(sock, msg, '⏳');
            await sock.sendMessage(remoteJid, { 
                text: `*جاري إنشاء الصورة...*\n\nالوصف: ${args}${utils.poweredBy}` 
            }, { quoted: msg });

            const response = await aiLabs.generateImage(args);
            
            if (response.success) {
                await utils.react(sock, msg, '✅');
                await sock.sendMessage(remoteJid, {
                    image: { url: response.result.url },
                    caption: `*تم إنشاء الصورة بنجاح*\n\n*الوصف:* ${args}${utils.poweredBy}`
                }, { quoted: msg });
            } else {
                await utils.react(sock, msg, '❌');
                await sock.sendMessage(remoteJid, { 
                    text: `❌ ${response.result.error}\n\nتأكد من كتابة الوصف بالإنجليزية فقط${utils.poweredBy}` 
                }, { quoted: msg });
            }
            return true;
        } catch (error) {
            console.error('AI Image Error:', error.message);
            await sock.sendMessage(remoteJid, { 
                text: `❌ فشل إنشاء الصورة. حاول مرة أخرى${utils.poweredBy}` 
            }, { quoted: msg });
            return false;
        }
    }
};
