import dotenv from 'dotenv';

dotenv.config();

export const PORT = Number(process.env.PORT || 4000);

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
export const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || '';

export const GMAIL_USER = process.env.GMAIL_USER || '';
export const GMAIL_QUERY = process.env.GMAIL_QUERY || 'label:INBOX newer_than:1d';
export const GMAIL_MAX_RESULTS = Number(process.env.GMAIL_MAX_RESULTS || 20);

export const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID || '';
export const GOOGLE_CSE_API_KEY = process.env.GOOGLE_CSE_API_KEY || '';
export const NEWS_SEARCH_TEMPLATE =
    process.env.NEWS_SEARCH_TEMPLATE ||
    '"<firm name>" ("fund" OR "funds" OR "raises" OR "closed" OR "deal" OR "acquisition" OR "promotes" OR "hire" OR "joins")';
export const NEWS_RESULTS_PER_FIRM = Number(process.env.NEWS_RESULTS_PER_FIRM || 3);
export const NEWS_FETCH_BATCH_SIZE = Number(process.env.NEWS_FETCH_BATCH_SIZE || 10);
export const NEWS_REFRESH_HOURS = Number(process.env.NEWS_REFRESH_HOURS || 3);

export function validateConfig() {
    const missing = [];
    if (!GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
    if (!GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
    if (!GOOGLE_REFRESH_TOKEN) missing.push('GOOGLE_REFRESH_TOKEN');
    if (!GMAIL_USER) missing.push('GMAIL_USER');
    if (!GOOGLE_CSE_ID) missing.push('GOOGLE_CSE_ID');
    if (!GOOGLE_CSE_API_KEY) missing.push('GOOGLE_CSE_API_KEY');

    if (missing.length) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}
