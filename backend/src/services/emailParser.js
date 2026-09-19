import { simpleParser } from 'mailparser';
import { convert } from 'html-to-text';

/**
 * Extract text from HTML if needed
 */
const htmlToText = (html) => {
    if (!html) return '';
    try {
        return convert(html, {
            wordwrap: false,
            selectors: [
                { selector: 'a', options: { ignoreHref: true } },
                { selector: 'img', format: 'skip' },
            ],
        });
    } catch (error) {
        console.error('Error converting HTML to text:', error);
        return '';
    }
};

/**
 * Parse raw email from stdin (Postfix pipe)
 */
export const parseEmail = async (rawEmail) => {
    const parsed = await simpleParser(rawEmail);

    // Debug logging
    console.log('📧 Parsed email keys:', Object.keys(parsed));
    console.log('📧 Has text:', !!parsed.text, 'length:', parsed.text?.length || 0);
    console.log('📧 Has html:', !!parsed.html, 'length:', parsed.html?.length || 0);
    console.log('📧 Has textAsHtml:', !!parsed.textAsHtml);

    // Extract recipient address
    const toHeader = parsed.to?.value?.[0];
    const toAddress = toHeader?.address?.toLowerCase() || '';

    // Extract sender
    const fromHeader = parsed.from?.value?.[0];
    const fromAddress = fromHeader?.address || '';
    const fromName = fromHeader?.name || '';
    const from = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

    // Extract text body - try multiple sources
    let text = parsed.text || '';

    // If no text but has HTML, convert HTML to text
    if (!text && parsed.html) {
        console.log('📧 No text body, converting HTML to text...');
        text = htmlToText(parsed.html);
    }

    // Extract HTML body
    let html = parsed.html || '';

    // If no HTML but has textAsHtml, use that
    if (!html && parsed.textAsHtml) {
        html = parsed.textAsHtml;
    }

    console.log('📧 Final text length:', text.length);
    console.log('📧 Final html length:', html.length);

    return {
        to: toAddress,
        from,
        subject: parsed.subject || '(No Subject)',
        text: text,
        html: html,
        hasAttachment: parsed.attachments?.length > 0,
        date: parsed.date || new Date(),
    };
};

export default {
    parseEmail,
};
