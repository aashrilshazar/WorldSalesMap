import { google } from 'googleapis';
import {
    GMAIL_ACCOUNTS,
    GMAIL_QUERIES,
    GMAIL_MAX_RESULTS,
    GMAIL_CACHE_SECONDS,
    ACCOUNT_REFRESH_TOKENS
} from './config.js';
import { getOAuthClient } from './googleClient.js';
import { getCache, setCache } from './cache.js';
import { getTicketStatuses } from './storage.js';

const cacheKey = 'gmail_tickets';

export async function fetchTickets() {
    const cached = getCache(cacheKey);
    if (cached) {
        return cached;
    }

    const accountResults = await Promise.all(
        GMAIL_ACCOUNTS.map(account => fetchAccountTickets(account))
    );

    const combined = accountResults.flat();
    const statusMap = await getTicketStatuses(combined.map(t => t.id));

    const tickets = combined
        .map(ticket => {
            const stored = statusMap.get(ticket.id);
            if (!stored) return ticket;
            return {
                ...ticket,
                status: stored.status || ticket.status
            };
        })
        .filter(ticket => ticket.status !== 'dismissed')
        .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));

    setCache(cacheKey, tickets, GMAIL_CACHE_SECONDS);
    return tickets;
}

async function fetchAccountTickets(account) {
    const refreshToken = ACCOUNT_REFRESH_TOKENS[account];
    if (!refreshToken) {
        console.warn(`No refresh token configured for account ${account}`);
        return [];
    }

    const auth = getOAuthClient(refreshToken);
    const gmail = google.gmail({ version: 'v1', auth });

    const listResponse = await gmail.users.messages.list({
        userId: account,
        q: GMAIL_QUERIES[account] || GMAIL_QUERIES.default || 'label:INBOX',
        labelIds: ['INBOX'],
        maxResults: GMAIL_MAX_RESULTS
    });

    const messages = listResponse.data.messages || [];
    if (!messages.length) return [];

    const messageDetails = await Promise.all(messages.map(async ({ id }) => {
        try {
            const { data } = await gmail.users.messages.get({
                userId: account,
                id,
                format: 'metadata',
                metadataHeaders: ['Subject', 'From', 'To', 'Date', 'Message-Id']
            });
            return data;
        } catch (error) {
            console.warn(`Failed to fetch message ${id} for ${account}:`, error.message);
            return null;
        }
    }));

    return messageDetails.filter(Boolean).map(msg => normalizeMessage(msg, account));
}

function normalizeMessage(message, account) {
    const headers = headersToObject(message.payload?.headers || []);
    const subject = headers.subject || '(no subject)';
    const sender = parseAddress(headers.from);
    const receivedAt = new Date(headers.date || Number(message.internalDate));
    const domain = extractDomain(sender.email);

    return {
        id: message.id,
        threadId: message.threadId,
        messageId: headers['message-id'] || message.id,
        subject,
        sender: sender.email,
        senderName: sender.name,
        inbox: account,
        receivedAt: receivedAt.toISOString(),
        firmDomain: domain,
        firmName: prettifyDomain(domain),
        priority: derivePriority(subject),
        status: 'open',
        type: 'new_email',
        threadUrl: buildGmailThreadUrl(message.id, account)
    };
}

function headersToObject(list) {
    return list.reduce((acc, header) => {
        acc[header.name.toLowerCase()] = header.value;
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
    return domain
        .replace(/\.(com|net|org|io|co)$/i, '')
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

function buildGmailThreadUrl(messageId, account) {
    return `https://mail.google.com/mail/u/${account}/#inbox/${messageId}`;
}
