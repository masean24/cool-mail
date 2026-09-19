/**
 * Discord Webhook Service
 * Sends notifications to Discord when new emails arrive.
 * Set DISCORD_WEBHOOK_URL in .env to enable.
 */

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

/**
 * Send a new email notification to Discord
 * @param {string} toEmail - Recipient email address (e.g. user123@cognexy.app)
 * @param {string} fromAddress - Sender address (e.g. noreply@google.com)
 */
async function sendNewEmailNotification(toEmail, fromAddress) {
    if (!WEBHOOK_URL) return; // silently skip if not configured

    try {
        const embed = {
            title: '📧 New Email Received',
            color: 0x5865F2, // Discord blurple
            fields: [
                { name: 'To', value: `\`${toEmail}\``, inline: true },
                { name: 'From', value: `\`${fromAddress}\``, inline: true },
            ],
            timestamp: new Date().toISOString(),
            footer: { text: 'Hubify Mail' },
        };

        await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [embed],
            }),
        });
    } catch (error) {
        console.error('⚠️ Discord webhook failed:', error.message);
    }
}

export default { sendNewEmailNotification };
