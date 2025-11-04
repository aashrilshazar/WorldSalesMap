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
export const NEWS_RESULTS_PER_FIRM = Number(process.env.NEWS_RESULTS_PER_FIRM || 3);
export const NEWS_FETCH_BATCH_SIZE = Number(process.env.NEWS_FETCH_BATCH_SIZE || 10);
export const NEWS_FIRMS_PER_BATCH = Number(process.env.NEWS_FIRMS_PER_BATCH || 10);
export const NEWS_JOB_TTL_SECONDS = Number(process.env.NEWS_JOB_TTL_SECONDS || 24 * 60 * 60);
export const NEWS_SNAPSHOT_TTL_SECONDS =
    Number(process.env.NEWS_SNAPSHOT_TTL_SECONDS || 24 * 60 * 60) || 24 * 60 * 60;
export const NEWS_REFRESH_COOLDOWN_SECONDS = Number(
    process.env.NEWS_REFRESH_COOLDOWN_SECONDS || 12 * 60 * 60
);
export const NEWS_DATE_RESTRICT = process.env.NEWS_DATE_RESTRICT || 'd1';
export const NEWS_SORT = process.env.NEWS_SORT || 'date';
export const NEWS_GL = process.env.NEWS_GL || 'us';
export const NEWS_HL = process.env.NEWS_HL || 'en';
export const NEWS_SAFE = process.env.NEWS_SAFE || 'off';
export const NEWS_LR =
    process.env.NEWS_LR ||
    process.env.NEWS_LANGUAGE_RESTRICT ||
    'lang_en';
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
const DEFAULT_ALLOWLIST_SITES = [
    // PR wires (highest-signal)
    'site:businesswire.com',
    'site:globenewswire.com',
    'site:prnewswire.com',
    'site:newsdirect.com',
    'site:accesswire.com',
    'site:einpresswire.com',

    // Core PE trades + tier-1 finance desks
    'site:pehub.com',
    'site:privateequityinternational.com',
    'site:penews.com',
    'site:thedeal.com',
    'site:secondariesinvestor.com',
    'site:privateequitywire.co.uk',
    'site:reuters.com',
    'site:bloomberg.com',
    'site:ft.com',
    'site:wsj.com',
    'site:spglobal.com/marketintelligence',

    // Additional global/regional PE trades
    'site:avcj.com',
    'site:unquote.com',
    'site:realdeals.eu.com',
    'site:altassets.net',
    'site:pitchbook.com/news',
    'site:infrastructureinvestor.com',

    // Executive moves / people news
    'site:huntscanlon.com',
    'site:institutionalinvestor.com',

    // Law-firm press rooms
    'site:kirkland.com',
    'site:lathamwatkins.com',
    'site:skadden.com',
    'site:simpsonthacher.com',
    'site:ropesgray.com',
    'site:paulweiss.com',
    'site:clearygottlieb.com',
    'site:davispolk.com',
    'site:friedfrank.com',
    'site:debevoise.com',
    'site:weil.com',
    'site:sidley.com',
    'site:gibsondunn.com',
    'site:whitecase.com',
    'site:sullcrom.com',
    'site:cravath.com',
    'site:proskauer.com',
    'site:cooley.com',
    'site:goodwinlaw.com',
    'site:wilsonsonsini.com',
    'site:aoshearman.com',
    'site:linklaters.com',
    'site:freshfields.com',
    'site:cliffordchance.com',
    'site:allenandovery.com',
    'site:hoganlovells.com',
    'site:herbertsmithfreehills.com',
    'site:macfarlanes.com',
    'site:traverssmith.com',
    'site:cms.law',
    'site:slaughterandmay.com',
    'site:ashurst.com',
    'site:milbank.com',
    'site:jonesday.com',
    'site:bakerbotts.com',

    // Advisor press rooms (IB/FA completions)
    'site:evercore.com',
    'site:lazard.com',
    'site:moelis.com',
    'site:solomonpartners.com',
    'site:jefferies.com',
    'site:hl.com',
    'site:lincolninternational.com',
    'site:goldmansachs.com',
    'site:morganstanley.com',
    'site:jpmorgan.com',
    'site:newsroom.bankofamerica.com',
    'site:barclays.com',
    'site:db.com',
    'site:rbc.com',
    'site:ubsgroup.com',

    // Global wires & mainstream business press
    'site:apnews.com',
    'site:cnbc.com',
    'site:forbes.com',
    'site:fortune.com',
    'site:marketwatch.com',
    'site:cityam.com',
    'site:telegraph.co.uk/business',
    'site:handelsblatt.com',
    'site:ilsole24ore.com',
    'site:nikkei.com',
    'site:asia.nikkei.com',
    'site:nikkeiasia.com',
    'site:theinformation.com',

    // Private markets & asset-manager trades
    'site:peprofessional.com',
    'site:buyoutsinsider.com',
    'site:realestatecapital.com',
    'site:realassets.ipe.com',
    'site:eqmagpro.com',
    'site:fundfire.com',
    'site:ignites.com',
    'site:ipe.com',
    'site:citywire.com',

    // Portfolio / restructuring watching
    'site:turnaround.org',
    'site:mergersandinquisitions.com',
    'site:globallegalchronicle.com',
    'site:globaldata.com/store/report',

    // Regional & sector specialists
    'site:valor.globo.com',
    'site:lesechos.fr',
    'site:afr.com',
    'site:business-standard.com',
    'site:finextra.com',
    'site:medcitynews.com',

    // Regulators & exchanges (filings/approvals)
    'site:sec.gov',
    'site:finra.org',
    'site:eba.europa.eu',
    'site:mas.gov.sg',
    'site:lseg.com',

    // Corporate comms / IR (examples)
    'site:ir.blackstone.com',
    'site:ir.apollo.com',
    'site:ir.kkr.com'
];
export const NEWS_EXCLUDE_TERMS = parseListEnv('NEWS_EXCLUDE_TERMS', DEFAULT_EXCLUDE_TERMS);
export const NEWS_ALLOWLIST_SITES = parseListEnv('NEWS_ALLOWLIST_SITES', DEFAULT_ALLOWLIST_SITES);

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
