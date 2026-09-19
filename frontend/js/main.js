/**
 * Hubify Mail - Main Frontend JavaScript
 */

// API Base URL
const API_BASE = '/api';

// State
let currentEmail = null;
let currentDomains = [];
let pollInterval = null;
let lastRefreshTime = null;
let refreshCounterInterval = null;
let lastEmailCount = 0;
let notificationEnabled = localStorage.getItem('hubify_notification') !== 'false';
let audioContext = null;

// Initialize Audio Context (for notification sound)
function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

// Play notification sound using Web Audio API
function playNotificationSound() {
    try {
        const ctx = getAudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Pleasant "ding" sound
        oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
        oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1); // Higher pitch
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.5);
    } catch (e) {
        console.log('Audio not supported');
    }
}

// Show browser notification
async function showBrowserNotification(title, body) {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
        new Notification(title, {
            body,
            icon: '/favicon.ico',
            tag: 'hubify-email'
        });
    } else if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            new Notification(title, { body, icon: '/favicon.ico' });
        }
    }
}

// Notify new email
function notifyNewEmail(email) {
    if (!notificationEnabled) return;

    playNotificationSound();
    showBrowserNotification('📧 New Email!', `From: ${email.from}\n${email.subject}`);
}

// DOM Elements
const elements = {
    emailDisplay: document.getElementById('email-display'),
    btnCopy: document.getElementById('btn-copy'),
    btnRefresh: document.getElementById('btn-refresh'),
    btnNew: document.getElementById('btn-new'),
    btnDelete: document.getElementById('btn-delete'),
    btnNotification: document.getElementById('btn-notification'),
    customForm: document.getElementById('custom-form'),
    customLocal: document.getElementById('custom-local'),
    customDomain: document.getElementById('custom-domain'),
    inboxContent: document.getElementById('inbox-content'),
    emailList: document.getElementById('email-list'),
    genderSelect: document.getElementById('gender-select'),
    ttlText: document.getElementById('ttl-text'),
    inboxStatus: document.querySelector('.inbox__status'),
    inboxStatusDot: document.querySelector('.inbox__status-dot'),
    modal: document.getElementById('email-modal'),
    modalClose: document.getElementById('modal-close'),
    modalSubject: document.getElementById('modal-subject'),
    modalFrom: document.getElementById('modal-from'),
    modalTo: document.getElementById('modal-to'),
    modalDate: document.getElementById('modal-date'),
    modalBody: document.getElementById('modal-body'),
    toastContainer: document.getElementById('toast-container'),
};

// Utils
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function formatTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatTTL(expiresAt) {
    if (!expiresAt) return 'Email aktif selama 24 jam';

    const expires = new Date(expiresAt);
    const now = new Date();
    const diff = expires - now;

    if (diff <= 0) return 'Email expired';

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);

    return `Expires in ${hours}h ${minutes}m`;
}

function formatLastRefresh() {
    if (!lastRefreshTime) return 'Never';
    const now = new Date();
    const diff = Math.floor((now - lastRefreshTime) / 1000);

    if (diff < 5) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
}

function updateRefreshCounter() {
    if (elements.inboxStatus) {
        const statusText = elements.inboxStatus.querySelector('span');
        if (statusText) {
            statusText.textContent = `Last: ${formatLastRefresh()}`;
        }
    }
}

const BASE_TITLE = 'Hubify Store - Temporary Email';
function updateTitleBadge(count) {
    document.title = count > 0 ? `(${count}) ${BASE_TITLE}` : BASE_TITLE;
}

// API Functions
async function fetchDomains() {
    try {
        const res = await fetch(`${API_BASE}/domains`);
        const data = await res.json();
        if (data.success) {
            currentDomains = data.data;
            populateDomainSelect();
        }
    } catch (error) {
        console.error('Error fetching domains:', error);
        showToast('Failed to load domains', 'error');
    }
}

async function generateEmail() {
    if (currentDomains.length === 0) {
        showToast('No domains available', 'error');
        return;
    }

    try {
        const randomDomain = currentDomains[Math.floor(Math.random() * currentDomains.length)];
        const domainId = randomDomain.id;
        const gender = elements.genderSelect?.value || 'random';
        const res = await fetch(`${API_BASE}/inbox/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domainId, gender }),
        });
        const data = await res.json();

        if (data.success) {
            setCurrentEmail(data.data.email, data.data.expiresAt);
            showToast('Email generated!', 'success');
        } else {
            showToast(data.error || 'Failed to generate email', 'error');
        }
    } catch (error) {
        console.error('Error generating email:', error);
        showToast('Failed to generate email', 'error');
    }
}

async function useCustomEmail(localPart, domainId) {
    try {
        const res = await fetch(`${API_BASE}/inbox/custom`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ localPart, domainId }),
        });
        const data = await res.json();

        if (data.success) {
            setCurrentEmail(data.data.email, data.data.expiresAt);
            showToast('Email set!', 'success');
        } else {
            showToast(data.error || 'Failed to set email', 'error');
        }
    } catch (error) {
        console.error('Error setting custom email:', error);
        showToast('Failed to set email', 'error');
    }
}

async function fetchInbox() {
    if (!currentEmail) return;

    // Show loading state
    setLoadingState(true);

    try {
        const res = await fetch(`${API_BASE}/inbox/${encodeURIComponent(currentEmail)}`);
        const data = await res.json();

        if (data.success) {
            const emails = data.data.emails;

            // Check for new emails (only notify if count increased and not first load)
            if (lastEmailCount > 0 && emails.length > lastEmailCount) {
                const newEmail = emails[0]; // Most recent email
                notifyNewEmail(newEmail);
            }
            lastEmailCount = emails.length;

            renderInbox(emails);
            if (data.data.expiresAt) {
                elements.ttlText.textContent = formatTTL(data.data.expiresAt);
            }
            // Update last refresh time
            lastRefreshTime = new Date();
            updateRefreshCounter();
        }
    } catch (error) {
        console.error('Error fetching inbox:', error);
    } finally {
        setLoadingState(false);
    }
}

async function fetchEmailDetail(emailId) {
    try {
        const res = await fetch(`${API_BASE}/email/${emailId}`);
        const data = await res.json();

        if (data.success) {
            showEmailModal(data.data);
        } else {
            showToast('Failed to load email', 'error');
        }
    } catch (error) {
        console.error('Error fetching email:', error);
        showToast('Failed to load email', 'error');
    }
}

async function deleteInbox() {
    if (!currentEmail) return;

    try {
        const res = await fetch(`${API_BASE}/inbox/${encodeURIComponent(currentEmail)}`, {
            method: 'DELETE',
        });
        const data = await res.json();

        if (data.success) {
            showToast('Inbox deleted!', 'success');
            generateEmail();
        } else {
            showToast(data.error || 'Failed to delete inbox', 'error');
        }
    } catch (error) {
        console.error('Error deleting inbox:', error);
        showToast('Failed to delete inbox', 'error');
    }
}

// UI Functions
function setLoadingState(isLoading) {
    if (elements.inboxStatusDot) {
        if (isLoading) {
            elements.inboxStatusDot.classList.add('loading');
        } else {
            elements.inboxStatusDot.classList.remove('loading');
        }
    }
}

function setCurrentEmail(email, expiresAt) {
    currentEmail = email;
    elements.emailDisplay.value = email;
    elements.ttlText.textContent = formatTTL(expiresAt);

    // Save to localStorage
    localStorage.setItem('hubify_email', email);

    // Start polling
    startPolling();

    // Fetch inbox immediately
    fetchInbox();
}

function populateDomainSelect() {
    elements.customDomain.innerHTML = currentDomains
        .map((d) => `<option value="${d.id}">${d.domain}</option>`)
        .join('');
}

function renderInbox(emails) {
    if (!emails || emails.length === 0) {
        elements.inboxContent.classList.remove('hidden');
        elements.emailList.classList.add('hidden');
        updateTitleBadge(0);
        return;
    }

    updateTitleBadge(emails.length);

    elements.inboxContent.classList.add('hidden');
    elements.emailList.classList.remove('hidden');

    elements.emailList.innerHTML = emails
        .map((email) => `
      <li class="email-item" data-id="${email.id}">
        <div class="email-item__header">
          <span class="email-item__from">${escapeHtml(email.from)}</span>
          <span class="email-item__time">${formatTime(email.receivedAt)}</span>
        </div>
        <div class="email-item__subject">${escapeHtml(email.subject)}</div>
        <div class="email-item__preview">${escapeHtml(email.preview || '')}</div>
      </li>
    `)
        .join('');
}

function showEmailModal(email) {
    elements.modalSubject.textContent = email.subject;
    elements.modalFrom.textContent = email.from;
    elements.modalTo.textContent = email.to;
    elements.modalDate.textContent = new Date(email.receivedAt).toLocaleString('id-ID');

    // Clear previous content
    elements.modalBody.innerHTML = '';

    // Prefer HTML body for rich content, fallback to text
    if (email.bodyHtml) {
        // Create sandboxed iframe for HTML content
        const iframe = document.createElement('iframe');
        iframe.className = 'email-iframe';
        iframe.sandbox = 'allow-same-origin';
        iframe.style.width = '100%';
        iframe.style.border = 'none';
        iframe.style.minHeight = '300px';

        elements.modalBody.appendChild(iframe);

        // Write HTML content to iframe
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <base target="_blank">
                <style>
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        padding: 10px;
                        margin: 0;
                        font-size: 14px;
                        line-height: 1.5;
                        color: #333;
                        background: #fff;
                    }
                    img { max-width: 100%; height: auto; }
                    a { color: #0066cc; }
                </style>
            </head>
            <body>${email.bodyHtml}</body>
            </html>
        `);
        doc.close();

        // Auto-resize iframe to content height
        iframe.onload = () => {
            try {
                const height = iframe.contentDocument.body.scrollHeight;
                iframe.style.height = Math.min(height + 20, 500) + 'px';
            } catch (e) {
                iframe.style.height = '400px';
            }
        };
    } else if (email.bodyText) {
        // Display plain text with proper formatting
        const pre = document.createElement('pre');
        pre.className = 'email-text';
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.wordWrap = 'break-word';
        pre.style.fontFamily = 'inherit';
        pre.style.margin = '0';
        pre.textContent = email.bodyText;
        elements.modalBody.appendChild(pre);
    } else {
        elements.modalBody.textContent = '(No content)';
    }

    elements.modal.classList.add('active');
}

function hideEmailModal() {
    elements.modal.classList.remove('active');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Email copied!', 'success');
    }).catch(() => {
        // Fallback
        const input = document.createElement('input');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('Email copied!', 'success');
    });
}

// Notification toggle
function toggleNotification() {
    notificationEnabled = !notificationEnabled;
    localStorage.setItem('hubify_notification', notificationEnabled);
    updateNotificationButton();

    if (notificationEnabled) {
        // Request permission when enabling
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
        showToast('Notifications enabled!', 'success');
    } else {
        showToast('Notifications disabled', 'success');
    }
}

function updateNotificationButton() {
    if (elements.btnNotification) {
        elements.btnNotification.textContent = notificationEnabled ? '🔔' : '🔕';
        elements.btnNotification.title = notificationEnabled ? 'Notifications ON (click to disable)' : 'Notifications OFF (click to enable)';
    }
}

// Polling
function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(fetchInbox, 5000);

    // Start refresh counter
    if (refreshCounterInterval) clearInterval(refreshCounterInterval);
    refreshCounterInterval = setInterval(updateRefreshCounter, 1000);
}

function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
    if (refreshCounterInterval) {
        clearInterval(refreshCounterInterval);
        refreshCounterInterval = null;
    }
}

// Event Listeners
elements.btnCopy.addEventListener('click', () => {
    if (currentEmail) {
        copyToClipboard(currentEmail);
    }
});

elements.btnRefresh.addEventListener('click', () => {
    fetchInbox();
    showToast('Refreshed!', 'success');
});

elements.btnNew.addEventListener('click', generateEmail);

elements.btnDelete.addEventListener('click', () => {
    if (confirm('Delete this inbox and all emails?')) {
        deleteInbox();
    }
});

elements.btnNotification.addEventListener('click', toggleNotification);

elements.customForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const localPart = elements.customLocal.value.trim();
    const domainId = elements.customDomain.value;

    if (localPart && domainId) {
        useCustomEmail(localPart, parseInt(domainId));
        elements.customLocal.value = '';
    }
});

elements.emailList.addEventListener('click', (e) => {
    const item = e.target.closest('.email-item');
    if (item) {
        const emailId = item.dataset.id;
        fetchEmailDetail(emailId);
    }
});

elements.modalClose.addEventListener('click', hideEmailModal);

elements.modal.addEventListener('click', (e) => {
    if (e.target === elements.modal) {
        hideEmailModal();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hideEmailModal();
    }
});

// Initialize
async function init() {
    await fetchDomains();

    // Initialize notification button state
    updateNotificationButton();

    // Check for saved email
    const savedEmail = localStorage.getItem('hubify_email');
    if (savedEmail) {
        // Validate saved email domain still exists
        const [, domain] = savedEmail.split('@');
        const domainExists = currentDomains.some((d) => d.domain === domain);

        if (domainExists) {
            setCurrentEmail(savedEmail, null);
            return;
        }
    }

    // Generate new email
    generateEmail();
}

init();
