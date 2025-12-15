import baileys from '@skyzopedia/baileys-mod';
const { proto, generateWAMessageFromContent } = baileys;

async function sendWithRetry(sendFn, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await sendFn();
        } catch (e) {
            const isRateLimit = e.message?.includes('rate-overlimit') || e.data === 429;
            if (isRateLimit && attempt < maxRetries) {
                const delay = Math.min(3000 * Math.pow(2, attempt - 1), 15000);
                console.log(`⏳ Rate limit - waiting ${delay/1000}s before retry ${attempt + 1}/${maxRetries}`);
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw e;
            }
        }
    }
}

export async function sendButtonList(sock, jid, title, body, footer, buttons, quoted = null) {
    try {
        const dynamicButtons = buttons.map((btn, idx) => ({
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: btn.text || btn.displayText || btn,
                id: btn.id || `btn_${idx + 1}`
            })
        }));

        const msg = generateWAMessageFromContent(jid, {
            viewOnceMessage: {
                message: {
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({ text: body }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: footer || '' }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            title: title,
                            hasMediaAttachment: false
                        }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                            buttons: dynamicButtons
                        })
                    })
                }
            }
        }, { quoted });

        await sendWithRetry(() => sock.relayMessage(jid, msg.message, { messageId: msg.key.id }));
        return msg;
    } catch (e) {
        console.error('sendButtonList error:', e.message);
        let fallbackText = `*${title}*\n\n${body}\n\n`;
        buttons.forEach((btn, idx) => {
            fallbackText += `${idx + 1}. ${btn.text || btn.displayText || btn}\n`;
        });
        fallbackText += `\n${footer}\n\n_رد بالرقم للاختيار_`;
        await new Promise(r => setTimeout(r, 2000));
        return sendWithRetry(() => sock.sendMessage(jid, { text: fallbackText }, { quoted }));
    }
}

export async function sendListMenu(sock, jid, title, body, footer, buttonText, sections, quoted = null) {
    try {
        const listSections = sections.map(section => ({
            title: section.title,
            rows: section.rows.map(row => ({
                header: row.emoji || '',
                title: row.title,
                description: row.description || '',
                id: row.id || row.rowId || row.title
            }))
        }));

        const msg = generateWAMessageFromContent(jid, {
            viewOnceMessage: {
                message: {
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({ text: body }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: footer || '' }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            title: title,
                            hasMediaAttachment: false
                        }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                            buttons: [{
                                name: 'single_select',
                                buttonParamsJson: JSON.stringify({
                                    title: buttonText,
                                    sections: listSections
                                })
                            }]
                        })
                    })
                }
            }
        }, { quoted });

        await sendWithRetry(() => sock.relayMessage(jid, msg.message, { messageId: msg.key.id }));
        return msg;
    } catch (e) {
        console.error('sendListMenu error:', e.message);
        let fallbackText = `*${title}*\n\n${body}\n\n`;
        let counter = 1;
        sections.forEach(section => {
            fallbackText += `*${section.title}*\n`;
            section.rows.forEach(row => {
                fallbackText += `${counter}. ${row.title}${row.description ? ' - ' + row.description : ''}\n`;
                counter++;
            });
            fallbackText += '\n';
        });
        fallbackText += `${footer}\n\n_رد بالرقم للاختيار_`;
        await new Promise(r => setTimeout(r, 2000));
        return sendWithRetry(() => sock.sendMessage(jid, { text: fallbackText }, { quoted }));
    }
}

export function parseInteractiveResponse(msg) {
    try {
        const message = msg.message || {};
        
        if (message.interactiveResponseMessage) {
            const interactiveResponse = message.interactiveResponseMessage;
            
            if (interactiveResponse?.nativeFlowResponseMessage?.paramsJson) {
                const parsed = JSON.parse(interactiveResponse.nativeFlowResponseMessage.paramsJson);
                return {
                    type: 'button',
                    id: parsed.id,
                    text: parsed.display_text || interactiveResponse?.body?.text || parsed.id
                };
            }
            
            if (interactiveResponse?.body?.text) {
                return {
                    type: 'button',
                    id: interactiveResponse.body.text,
                    text: interactiveResponse.body.text
                };
            }
        }
        
        if (message.listResponseMessage) {
            return {
                type: 'list',
                id: message.listResponseMessage?.singleSelectReply?.selectedRowId,
                text: message.listResponseMessage?.title
            };
        }
        
        if (message.buttonsResponseMessage) {
            return {
                type: 'button',
                id: message.buttonsResponseMessage?.selectedButtonId,
                text: message.buttonsResponseMessage?.selectedDisplayText
            };
        }
        
        return null;
    } catch (e) {
        console.error('parseInteractiveResponse error:', e.message);
        return null;
    }
}

export const GAMES_LIST = [
    { id: 'game_1', title: 'حجر ورقة مقص', description: 'العب ضد البوت', emoji: '✊' },
    { id: 'game_2', title: 'خمن الرقم', description: 'خمن رقم من 1 إلى 100', emoji: '🔢' },
    { id: 'game_3', title: 'كلمة السر', description: 'خمن الكلمة المخفية', emoji: '🔤' },
    { id: 'game_4', title: 'صح أم خطأ', description: 'أسئلة معلومات عامة', emoji: '✅' },
    { id: 'game_5', title: 'من سيربح المليون', description: 'أجب على الأسئلة', emoji: '💰' },
    { id: 'game_6', title: 'تخمين العاصمة', description: 'خمن عاصمة الدولة', emoji: '🌍' },
    { id: 'game_7', title: 'حساب سريع', description: 'حل المسائل الرياضية', emoji: '➕' },
    { id: 'game_8', title: 'اكمل المثل', description: 'أكمل الأمثال الشعبية', emoji: '📜' },
    { id: 'game_9', title: 'خمن اللاعب', description: 'من هو لاعب كرة القدم', emoji: '⚽' },
    { id: 'game_10', title: 'حظك اليوم', description: 'اعرف حظك', emoji: '🔮' }
];

export async function sendGamesMenu(sock, jid, quoted = null, footer = '') {
    const buttons = GAMES_LIST.map(game => ({
        id: game.id,
        text: `${game.emoji} ${game.title}`
    }));

    const title = 'قائمة الألعاب';
    const body = `مرحبا! اختر لعبة من القائمة:\n\n${GAMES_LIST.map((g, i) => `${i + 1}. ${g.emoji} ${g.title} - ${g.description}`).join('\n')}`;

    return await sendButtonList(sock, jid, title, body, footer, buttons, quoted);
}

export async function sendGamesListMenu(sock, jid, quoted = null, footer = '') {
    const sections = [{
        title: 'الألعاب المتاحة',
        rows: GAMES_LIST.map(game => ({
            id: game.id,
            title: `${game.emoji} ${game.title}`,
            description: game.description,
            emoji: game.emoji
        }))
    }];

    return await sendListMenu(
        sock, 
        jid, 
        'قائمة الألعاب',
        'اختر لعبة للبدء! عندنا 10 ألعاب ممتعة.',
        footer,
        'اختر لعبة',
        sections,
        quoted
    );
}

export async function sendAppSearchResults(sock, jid, searchQuery, apps, footer = '', quoted = null) {
    const sections = [{
        title: 'نتائج البحث',
        rows: apps.map((app, idx) => ({
            id: String(idx + 1),
            title: `${idx + 1}. ${app.title}`,
            description: app.developer ? `المطور: ${app.developer}` : (app.description || '')
        }))
    }];

    return await sendListMenu(
        sock,
        jid,
        `نتائج البحث`,
        `لقيت ${apps.length} تطبيق لـ: *${searchQuery}*`,
        footer || 'Omar AI Bot',
        'نتائج البحث',
        sections,
        quoted
    );
}

export async function sendQuickButtons(sock, jid, text, buttons, footer = '', quoted = null) {
    return await sendButtonList(sock, jid, '', text, footer, buttons, quoted);
}
