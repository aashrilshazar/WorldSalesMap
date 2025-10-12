function safeJsonParse(value, fallback) {
    if (!value) return fallback;

    const attempts = [];
    const trimmed = value.trim();

    attempts.push(value);
    if (trimmed !== value) attempts.push(trimmed);

    const maybeWrapped = trimmed.replace(/^["']|["']$/g, '');
    if (maybeWrapped && maybeWrapped !== trimmed) attempts.push(maybeWrapped);

    for (const candidate of attempts) {
        try {
            return JSON.parse(candidate);
        } catch (error) {
            // try the next candidate variant before giving up
        }
    }

    try {
        return JSON.parse(trimmed.replace(/\n/g, ''));
    } catch (error) {
        console.warn('Failed to parse JSON config value:', error.message);
        return fallback;
    }
}

export const GMAIL_CREDENTIALS = safeJsonParse(process.env.GMAIL_CREDENTIALS_JSON, {});

function parseListEnv(name, fallback = []) {
    const raw = process.env[name];
    if (!raw) return fallback;

    const parsed = safeJsonParse(raw, null);
    if (Array.isArray(parsed)) {
        return parsed
            .map(entry => (typeof entry === 'string' ? entry.trim() : String(entry).trim()))
            .filter(Boolean);
    }

    return raw
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
}

export const GMAIL_INBOXES = Object.keys(GMAIL_CREDENTIALS);
export const GMAIL_QUERIES = safeJsonParse(process.env.GMAIL_QUERIES, {});
export const GMAIL_MAX_RESULTS = Number(process.env.GMAIL_MAX_RESULTS || 20);
export const GMAIL_CACHE_SECONDS = Number(process.env.GMAIL_CACHE_SECONDS || 60);

export const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID || '';
export const GOOGLE_CSE_API_KEY =
    process.env.GOOGLE_CSE_API_KEY ||
    process.env.NEWS_GOOGLE_CSE_API_KEY ||
    process.env.NEWS_GOOGLE_CSE_KEY ||
    '';
export const GOOGLE_CSE_ID_STRICT = process.env.GOOGLE_CSE_ID_STRICT || '';
export const NEWS_SEARCH_TEMPLATE =
    process.env.NEWS_SEARCH_TEMPLATE ||
    '"<firm name>" ("fund" OR "funds" OR "raises" OR "closed" OR "deal" OR "acquisition" OR "promotes" OR "hire" OR "joins")';
export const NEWS_RESULTS_PER_FIRM = Number(process.env.NEWS_RESULTS_PER_FIRM || 1);
export const NEWS_FETCH_BATCH_SIZE = Number(process.env.NEWS_FETCH_BATCH_SIZE || 10);
export const NEWS_REFRESH_SECONDS = Number(process.env.NEWS_REFRESH_SECONDS || 3 * 60 * 60);
export const NEWS_DATE_RESTRICT = process.env.NEWS_DATE_RESTRICT || 'd1';
export const NEWS_SORT = process.env.NEWS_SORT || 'date';
export const NEWS_GL = process.env.NEWS_GL || 'us';
export const NEWS_HL = process.env.NEWS_HL || 'en';
export const NEWS_SAFE = process.env.NEWS_SAFE || 'off';
const DEFAULT_EXCLUDE_TERMS = [
    "we're hiring",
    'we are hiring',
    'hiring',
    'careers',
    'career',
    'job',
    'jobs',
    'open role',
    'recruiting',
    'recruiter',
    'podcast',
    'webinar',
    'coupon',
    'promo code',
    'promotion code',
    'considering',
    'exploring',
    'rumor',
    'rumored',
    'letter of intent'
];
const DEFAULT_NEGATIVE_SITE_EXCLUDES = [
    'site:lever.co',
    'site:jobs.lever.co',
    'site:greenhouse.io',
    'site:boards.greenhouse.io',
    'site:myworkdayjobs.com',
    'site:workdayjobs.com',
    'site:jobs.sap.com',
    'site:jazzhr.com',
    'site:smartrecruiters.com',
    'site:bamboohr.com'
];
export const NEWS_EXCLUDE_TERMS = parseListEnv('NEWS_EXCLUDE_TERMS', DEFAULT_EXCLUDE_TERMS);
export const NEWS_NEGATIVE_SITE_EXCLUDES = parseListEnv(
    'NEWS_NEGATIVE_SITE_EXCLUDES',
    DEFAULT_NEGATIVE_SITE_EXCLUDES
);

export const KV_REST_API_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
export const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

export function validateConfig({ requireGmail = true, requireNews = false } = {}) {
    const missing = [];

    if (requireGmail) {
        if (!GMAIL_INBOXES.length) missing.push('GMAIL_CREDENTIALS_JSON (no inboxes)');
        if (!KV_REST_API_URL) missing.push('KV_REST_API_URL');
        if (!KV_REST_API_TOKEN) missing.push('KV_REST_API_TOKEN');

        GMAIL_INBOXES.forEach(inbox => {
            const creds = GMAIL_CREDENTIALS[inbox];
            if (!creds?.clientId) missing.push(`clientId for ${inbox}`);
            if (!creds?.clientSecret) missing.push(`clientSecret for ${inbox}`);
            if (!creds?.refreshToken) missing.push(`refreshToken for ${inbox}`);
        });
    }

    if (requireNews) {
        if (!GOOGLE_CSE_ID) missing.push('GOOGLE_CSE_ID');
        if (!GOOGLE_CSE_API_KEY) missing.push('GOOGLE_CSE_API_KEY');
    }

    if (missing.length) {
        throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }
}

export function getCredentialsForInbox(inbox) {
    return GMAIL_CREDENTIALS[inbox] || null;
}
