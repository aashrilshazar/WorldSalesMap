import { google } from 'googleapis';
import { getOAuthClient } from './googleAuth.js';
import {
    GMAIL_INBOX_USER,
    GMAIL_FETCH_QUERY,
    GMAIL_MAX_RESULTS,
    SYNC_INTERVAL_MS
} from './config.js';
import {
    upsertTickets,
    getAllTickets,
    updateLastSync,
    getLastSync
} from './ticketStore.js';

const gmailScopes = [
    'https://www.googleapis.com/auth/gmail.readonly'
];

let isSyncing = false;

export async function ensureTicketsSynced({ force = false } = {}) {
    const lastSync = getLastSync();
    const shouldSync = force || !lastSync || (Date.now() - lastSync > SYNC_INTERVAL_MS);
    if (!shouldSync || isSyncing) {
        return getAllTickets();
    }

    try {
        isSyncing = true;
        const client = await getOAuthClient();
        await assertHasCredentials(client);
        const gmail = google.gmail({ version: 'v1', auth: client });
        const listResponse = await gmail.users.messages.list({
            userId: GMAIL_INBOX_USER,
            q: GMAIL_FETCH_QUERY,
            labelIds: ['INBOX'],
            maxResults: GMAIL_MAX_RESULTS
        });

        const messages = listResponse.data.messages || [];
        if (!messages.length) {
            updateLastSync();
            return getAllTickets();
        }

        const fullMessages = await Promise.all(
            messages.map(msg => gmail.users.messages.get({
                userId: GMAIL_INBOX_USER,
                id: msg.id,
                format: 'metadata',
                metadataHeaders: ['From', 'Subject', 'Date', 'Message-Id', 'To']
            }))
        );

        const parsedTickets = fullMessages
            .map(res => normalizeMessage(res.data))
            .filter(Boolean);
        upsertTickets(parsedTickets);
        updateLastSync();

        return getAllTickets();
    } finally {
        isSyncing = false;
    }
}

export { gmailScopes };

function normalizeMessage(message) {
    if (!message) return null;
    const headers = headersToObject(message.payload?.headers || []);
    const fromHeader = headers.from || '';
    const parsedFrom = parseEmailAddress(fromHeader);
    const receivedAt = new Date(headers.date || Number(message.internalDate));

    if (!parsedFrom.email) return null;

    const domain = extractDomain(parsedFrom.email);

    return {
        id: message.id,
        threadId: message.threadId,
        messageId: headers['message-id'] || message.id,
        subject: headers.subject || '(no subject)',
        sender: parsedFrom.email,
        senderName: parsedFrom.name,
        receivedAt: receivedAt.toISOString(),
        firmDomain: domain,
        firmName: prettifyDomain(domain),
        inbox: headers.to || '',
        priority: derivePriorityFromSubject(headers.subject),
        type: 'new_email',
        threadUrl: buildGmailThreadUrl(message)
    };
}

function headersToObject(headers) {
    return headers.reduce((acc, header) => {
        const key = header.name.toLowerCase();
        acc[key] = header.value;
        return acc;
    }, {});
}

function parseEmailAddress(raw) {
    if (!raw) return { email: '', name: '' };
    const match = raw.match(/^(.*)<(.+@.+)>$/);
    if (match) {
        return {
            name: match[1].trim().replace(/^"|"$/g, ''),
            email: match[2].trim().toLowerCase()
        };
    }
    return { email: raw.trim().toLowerCase(), name: '' };
}

function extractDomain(email) {
    const [, domain = ''] = email.split('@');
    return domain.toLowerCase();
}

function prettifyDomain(domain) {
    if (!domain) return 'Unknown Firm';
    const base = domain.replace(/\.(com|io|co|net|org)$/i, '');
    return base
        .split(/[-_.]/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function derivePriorityFromSubject(subject = '') {
    const lower = subject.toLowerCase();
    if (lower.includes('urgent') || lower.includes('asap')) return 'high';
    if (lower.includes('follow up') || lower.includes('reminder')) return 'medium';
    return 'low';
}

function buildGmailThreadUrl(message) {
    if (!message || !message.id) return '#';
    return `https://mail.google.com/mail/u/0/#inbox/${message.id}`;
}

async function assertHasCredentials(client) {
    const credentials = client.credentials || {};
    if (!credentials.access_token && !credentials.refresh_token) {
        throw new Error('Google OAuth token missing. Authorize the application first.');
    }
}
