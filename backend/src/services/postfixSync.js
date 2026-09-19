import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import domainService from './domain.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/sync-postfix.sh');

/**
 * Sync Postfix virtual_mailbox_domains with active domains from DB.
 * Writes domains to a file, then runs sync-postfix.sh with sudo.
 * Safe: if sync is disabled or fails, returns result without throwing.
 *
 * @returns {{ success: boolean, skipped?: boolean, error?: string }}
 */
export async function syncPostfix() {
    if (process.env.POSTFIX_SYNC_ENABLED !== 'true') {
        return { success: true, skipped: true };
    }

    let domains;
    try {
        const rows = await domainService.getActiveDomains();
        domains = rows.map((r) => r.domain).filter(Boolean);
    } catch (err) {
        console.error('Postfix sync: failed to get domains', err);
        return { success: false, error: 'Failed to get domains from database' };
    }

    const domainsFilePath = process.env.POSTFIX_DOMAINS_FILE || path.join(process.cwd(), '.postfix-domains');

    try {
        fs.writeFileSync(domainsFilePath, domains.join('\n'), 'utf8');
    } catch (err) {
        console.error('Postfix sync: failed to write domains file', err);
        return { success: false, error: 'Failed to write domains file' };
    }

    if (!fs.existsSync(SCRIPT_PATH)) {
        console.warn('Postfix sync: script not found at', SCRIPT_PATH);
        return { success: false, error: 'Sync script not found' };
    }

    const result = spawnSync('sudo', [SCRIPT_PATH, domainsFilePath], {
        encoding: 'utf8',
        timeout: 15000,
    });

    if (result.error) {
        console.error('Postfix sync: spawn error', result.error);
        return { success: false, error: result.error.message || 'Failed to run sync script' };
    }

    if (result.status !== 0) {
        const msg = (result.stderr || result.stdout || 'Unknown error').trim();
        console.error('Postfix sync: script failed', result.status, msg);
        return { success: false, error: msg };
    }

    return { success: true };
}

export default {
    syncPostfix,
};
