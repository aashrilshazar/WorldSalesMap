export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
export const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI
    || 'http://localhost:3000/api/oauth2/callback';

export const GMAIL_INBOX_USER = process.env.GMAIL_INBOX_USER || 'me';
export const GMAIL_FETCH_QUERY = process.env.GMAIL_FETCH_QUERY
    || 'is:inbox -category:{promotions social}';
export const GMAIL_MAX_RESULTS = Number(process.env.GMAIL_MAX_RESULTS || 50);
export const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS || 60_000);

export const KV_TICKET_STATUS_KEY = process.env.KV_TICKET_STATUS_KEY || 'gmail-ticket-status';
export const KV_TICKET_CACHE_KEY = process.env.KV_TICKET_CACHE_KEY || 'gmail-ticket-cache';
export const KV_TOKEN_KEY = process.env.KV_TOKEN_KEY || 'gmail-oauth-token';

export const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || SYNC_INTERVAL_MS);
