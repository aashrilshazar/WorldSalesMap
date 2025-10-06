export const GMAIL_ACCOUNTS = (process.env.GMAIL_ACCOUNTS || '')
    .split(',')
    .map(a => a.trim())
    .filter(Boolean);

export const GMAIL_QUERIES = JSON.parse(process.env.GMAIL_QUERIES || '{}');

export const GMAIL_MAX_RESULTS = Number(process.env.GMAIL_MAX_RESULTS || 20);
export const GMAIL_CACHE_SECONDS = Number(process.env.GMAIL_CACHE_SECONDS || 60);

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

export const ACCOUNT_REFRESH_TOKENS = JSON.parse(process.env.GMAIL_REFRESH_TOKENS || '{}');

export function validateConfig() {
    const missing = [];
    if (!GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
    if (!GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
    if (!GMAIL_ACCOUNTS.length) missing.push('GMAIL_ACCOUNTS');
    if (!Object.keys(ACCOUNT_REFRESH_TOKENS).length) missing.push('GMAIL_REFRESH_TOKENS');

    if (missing.length) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}
