import { google } from 'googleapis';
import {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN,
    GMAIL_USER,
    GMAIL_QUERY,
    GMAIL_MAX_RESULTS
} from './config.js';

let cachedClient = null;

function getOAuthClient() {
    if (cachedClient) return cachedClient;

    const client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        'https://developers.google.com/oauthplayground'
    );

    client.setCredentials({
        refresh_token: GOOGLE_REFRESH_TOKEN
    });

    cachedClient = client;
    return client;
}

export async function fetchInboxTickets() {
    const auth = getOAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });

    const listResponse = await gmail.users.messages.list({
        userId: GMAIL_USER,
        q: GMAIL_QUERY,
        labelIds: ['INBOX'],
        maxResults: GMAIL_MAX_RESULTS
    });

    const messages = listResponse.data.messages || [];
    if (!messages.length) return [];

    const fullMessages = await Promise.all(messages.map(async (msg) => {
        try {
            const { data } = await gmail.users.messages.get({
                userId: GMAIL_USER,
                id: msg.id,
                format: 'metadata',
                metadataHeaders: ['Subject', 'From', 'To', 'Date', 'Message-Id']
            });
            return data;
        } catch (error) {
            console.warn(`Failed to fetch message ${msg.id}:`, error.message);
            return null;
        }
    }));

    return fullMessages
        .filter(Boolean)
        .map(normalizeMessage)
        .filter(Boolean)
        .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
}

function normalizeMessage(message) {
    const headers = headerListToObject(message.payload?.headers || []);
    const subject = headers.subject || '(no subject)';
    const from = parseAddress(headers.from);
    const to = headers.to || '';
    const receivedAt = new Date(headers.date || Number(message.internalDate));

    const domain = extractDomain(from.email);

    return {
        id: message.id,
        threadId: message.threadId,
        messageId: headers['message-id'] || message.id,
        subject,
        sender: from.email,
        senderName: from.name,
        inbox: to,
        receivedAt: receivedAt.toISOString(),
        firmDomain: domain,
        firmName: prettifyDomain(domain),
        priority: derivePriority(subject),
        status: 'open',
        type: 'new_email',
        threadUrl: buildGmailThreadUrl(message.id)
    };
}

function headerListToObject(headers) {
    return headers.reduce((acc, header) => {
        const key = header.name.toLowerCase();
        acc[key] = header.value;
        return acc;
    }, {});
}

function parseAddress(raw = '') {
    const match = raw.match(/^(.*)<(.+@.+)>$/);
    if (match) {
        return {
            name: match[1].trim().replace(/^"|"$/g, ''),
            email: match[2].trim().toLowerCase()
        };
    }
    return { name: '', email: raw.trim().toLowerCase() };
}

function extractDomain(email = '') {
    const [, domain = ''] = email.split('@');
    return domain.toLowerCase();
}

function prettifyDomain(domain) {
    if (!domain) return 'Unknown Firm';
    const cleaned = domain.replace(/\.(com|net|org|io|co)$/i, '');
    return cleaned
        .split(/[._-]/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function derivePriority(subject = '') {
    const value = subject.toLowerCase();
    if (value.includes('urgent') || value.includes('asap')) return 'high';
    if (value.includes('follow up') || value.includes('reminder')) return 'medium';
    return 'low';
}

function buildGmailThreadUrl(messageId) {
    return `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
}
