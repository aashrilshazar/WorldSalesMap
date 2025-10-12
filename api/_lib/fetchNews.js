import { createHash } from 'crypto';
import { google } from 'googleapis';
import {
    GOOGLE_CSE_API_KEY,
    GOOGLE_CSE_ID,
    GOOGLE_CSE_ID_STRICT,
    NEWS_FETCH_BATCH_SIZE,
    NEWS_GL,
    NEWS_HL,
    NEWS_REFRESH_SECONDS,
    NEWS_RESULTS_PER_FIRM,
    NEWS_SAFE,
    NEWS_SEARCH_TEMPLATE,
    NEWS_SORT,
    NEWS_DATE_RESTRICT,
    NEWS_EXCLUDE_TERMS,
    NEWS_NEGATIVE_SITE_EXCLUDES
} from './config.js';
import { getCache, setCache } from './cache.js';
import { NEWS_FIRM_NAMES } from '../../shared/newsFirms.js';
import { withNewsRateLimit } from '../../shared/newsRateLimiter.js';

export const NEWS_CACHE_KEY = 'news_feed_snapshot';

const customSearch = google.customsearch('v1');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RESULTS_PER_QUERY = Math.min(10, Math.max(NEWS_FETCH_BATCH_SIZE, NEWS_RESULTS_PER_FIRM));
const SIGNAL_PRIORITY = ['fund', 'deal', 'hire', 'promotion'];
const NEGATIVE_SITE_SUFFIX = NEWS_NEGATIVE_SITE_EXCLUDES.length
    ? ' ' +
      NEWS_NEGATIVE_SITE_EXCLUDES.map(site => {
          const trimmed = site.trim();
          if (!trimmed) return '';
          return trimmed.startsWith('-') ? trimmed : `-${trimmed}`;
      })
          .filter(Boolean)
          .join(' ')
    : '';
const NEGATIVE_TERMS_VALUE = NEWS_EXCLUDE_TERMS.length
    ? NEWS_EXCLUDE_TERMS.map(term => `"${term}"`).join(' ')
    : '';

const NEWS_QUERY_BUILDERS = {
    fund: firm => ({
        q: `"${firm}" ( "final close" OR "first close" OR "hard cap" OR "raises fund" OR "closes fund" OR "launches fund" )${NEGATIVE_SITE_SUFFIX}`,
        exactTerms: firm,
        excludeTerms: NEGATIVE_TERMS_VALUE,
        num: MAX_RESULTS_PER_QUERY,
        dateRestrict: NEWS_DATE_RESTRICT,
        sort: NEWS_SORT,
        gl: NEWS_GL,
        hl: NEWS_HL,
        safe: NEWS_SAFE
    }),
    deal: firm => ({
        q: `"${firm}" ( acquires OR acquisition OR "closes acquisition" OR "to acquire" OR "take-private" OR merger OR backs OR "minority investment" OR "platform investment" OR "add-on acquisition" )${NEGATIVE_SITE_SUFFIX}`,
        exactTerms: firm,
        excludeTerms: NEGATIVE_TERMS_VALUE,
        num: MAX_RESULTS_PER_QUERY,
        dateRestrict: NEWS_DATE_RESTRICT,
        sort: NEWS_SORT,
        gl: NEWS_GL,
        hl: NEWS_HL,
        safe: NEWS_SAFE
    }),
    hire: firm => ({
        q: `"${firm}" ( hires OR appoints OR "named" OR "joins as" ) intitle:(hires OR appoints OR named)${NEGATIVE_SITE_SUFFIX}`,
        exactTerms: firm,
        excludeTerms: NEGATIVE_TERMS_VALUE,
        num: MAX_RESULTS_PER_QUERY,
        dateRestrict: NEWS_DATE_RESTRICT,
        sort: NEWS_SORT,
        gl: NEWS_GL,
        hl: NEWS_HL,
        safe: NEWS_SAFE
    }),
    promotion: firm => ({
        q: `"${firm}" ( promotes OR promoted OR elevates OR "named managing director" OR "promoted to partner" ) intitle:(promotes OR promoted OR elevates)${NEGATIVE_SITE_SUFFIX}`,
        exactTerms: firm,
        excludeTerms: NEGATIVE_TERMS_VALUE,
        num: MAX_RESULTS_PER_QUERY,
        dateRestrict: NEWS_DATE_RESTRICT,
        sort: NEWS_SORT,
        gl: NEWS_GL,
        hl: NEWS_HL,
        safe: NEWS_SAFE
    })
};

function buildQuery(firmName) {
    return NEWS_SEARCH_TEMPLATE.replace(/<firm name>/gi, firmName);
}

function buildNewsId(firmName, link, title) {
    const hash = createHash('sha1');
    hash.update(firmName);
    if (link) hash.update(link);
    if (title) hash.update(title);
    return `news_${hash.digest('hex').slice(0, 16)}`;
}

function extractSource(item) {
    const pagemap = item.pagemap || {};
    if (Array.isArray(pagemap.metatags)) {
        for (const meta of pagemap.metatags) {
            const candidate = meta['og:site_name'] || meta['twitter:site'] || meta['application-name'];
            if (candidate) {
                return candidate.replace(/^@/, '');
            }
        }
    }
    return item.displayLink || '';
}

function extractPublishedAt(item) {
    const pagemap = item.pagemap || {};
    const candidates = [];

    if (Array.isArray(pagemap.newsarticle)) {
        for (const article of pagemap.newsarticle) {
            if (article?.datepublished) candidates.push(article.datepublished);
            if (article?.datemodified) candidates.push(article.datemodified);
        }
    }

    if (Array.isArray(pagemap.article)) {
        for (const article of pagemap.article) {
            if (article?.datepublished) candidates.push(article.datepublished);
            if (article?.datemodified) candidates.push(article.datemodified);
        }
    }

    if (Array.isArray(pagemap.metatags)) {
        for (const meta of pagemap.metatags) {
            const values = [
                meta['article:published_time'],
                meta['article:modified_time'],
                meta['og:published_time'],
                meta['og:updated_time'],
                meta['pubdate'],
                meta['publishdate'],
                meta['date']
            ];
            values.forEach(value => value && candidates.push(value));
        }
    }

    if (Array.isArray(pagemap.hnews)) {
        for (const entry of pagemap.hnews) {
            if (Array.isArray(entry?.metas)) {
                entry.metas.forEach(meta => {
                    if (meta?.content) candidates.push(meta.content);
                });
            }
        }
    }

    for (const candidate of candidates) {
        const parsed = new Date(candidate);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    return null;
}

function isRecent(date) {
    if (!date) return true;
    const age = Date.now() - date.getTime();
    return age <= ONE_DAY_MS;
}

function normalizeSearchItem(item, firmName) {
    if (!item?.link) return null;

    const publishedAt = extractPublishedAt(item) || new Date();
    if (!isRecent(publishedAt)) {
        return null;
    }

    return {
        id: buildNewsId(firmName, item.link, item.title),
        firm: firmName,
        headline: item.title || '',
        summary: item.snippet || '',
        source: extractSource(item),
        publishedAt: publishedAt.toISOString(),
        tags: [],
        url: item.link
    };
}

async function fetchFirmNews(firmName) {
    const limit = Math.max(1, NEWS_RESULTS_PER_FIRM);
    const seen = new Set();
    const collected = [];

    const signalQueries = buildFirmSignalQueries(firmName);

    for (const [signal, params] of signalQueries) {
        if (collected.length >= limit) break;

        const { items, cxUsed } = await fetchWithCseFallback(params, { preferStrict: true });
        const normalizedItems = normalizeSignalItems(items, firmName, signal, cxUsed);

        for (const article of normalizedItems) {
            if (seen.has(article.id)) continue;
            seen.add(article.id);
            collected.push(article);
            if (collected.length >= limit) break;
        }
    }

    if (collected.length < limit) {
        const fallbackParams = buildFallbackQueryParams(firmName);
        const { items, cxUsed } = await fetchWithCseFallback(fallbackParams, {
            preferStrict: collected.length === 0
        });
        const normalizedItems = normalizeSignalItems(items, firmName, 'general', cxUsed);

        for (const article of normalizedItems) {
            if (seen.has(article.id)) continue;
            seen.add(article.id);
            collected.push(article);
            if (collected.length >= limit) break;
        }
    }

    return collected.slice(0, limit);
}

async function refreshNewsSnapshot() {
    const aggregated = [];
    const errors = [];

    for (const firmName of NEWS_FIRM_NAMES) {
        try {
            const results = await fetchFirmNews(firmName);
            aggregated.push(...results);
        } catch (error) {
            console.error(`News fetch failed for ${firmName}:`, error.message);
            errors.push({ firm: firmName, message: error.message });
        }
    }

    aggregated.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    const snapshot = {
        items: aggregated,
        lastUpdated: new Date().toISOString(),
        errors: errors.length ? errors : null
    };

    setCache(NEWS_CACHE_KEY, snapshot, NEWS_REFRESH_SECONDS);
    return snapshot;
}

export async function fetchNews(forceRefresh = false) {
    if (!forceRefresh) {
        const cached = getCache(NEWS_CACHE_KEY);
        if (cached) {
            return cached;
        }
    }

    return refreshNewsSnapshot();
}

function buildFirmSignalQueries(firmName) {
    const entries = [];
    for (const signal of SIGNAL_PRIORITY) {
        const builder = NEWS_QUERY_BUILDERS[signal];
        if (!builder) continue;
        entries.push([signal, builder(firmName)]);
    }
    return entries;
}

function buildFallbackQueryParams(firmName) {
    const baseQuery = `${buildQuery(firmName)}${NEGATIVE_SITE_SUFFIX}`;
    return {
        q: baseQuery,
        exactTerms: firmName,
        excludeTerms: NEGATIVE_TERMS_VALUE,
        num: MAX_RESULTS_PER_QUERY,
        dateRestrict: NEWS_DATE_RESTRICT,
        sort: NEWS_SORT,
        gl: NEWS_GL,
        hl: NEWS_HL,
        safe: NEWS_SAFE
    };
}

function normalizeSignalItems(items, firmName, signal, cxUsed) {
    const normalized = [];
    for (const item of items) {
        const article = normalizeSearchItem(item, firmName);
        if (!article) continue;

        const tags = new Set(article.tags || []);
        if (signal) {
            tags.add(signal);
        }

        if (
            GOOGLE_CSE_ID_STRICT &&
            cxUsed &&
            cxUsed === GOOGLE_CSE_ID_STRICT &&
            GOOGLE_CSE_ID_STRICT !== GOOGLE_CSE_ID
        ) {
            tags.add('strict-cx');
        }

        article.tags = Array.from(tags);
        normalized.push(article);
    }
    return normalized;
}

async function fetchWithCseFallback(params, { preferStrict = true } = {}) {
    const cxCandidates = [];
    if (preferStrict && GOOGLE_CSE_ID_STRICT) {
        cxCandidates.push(GOOGLE_CSE_ID_STRICT);
    }
    if (GOOGLE_CSE_ID && !cxCandidates.includes(GOOGLE_CSE_ID)) {
        cxCandidates.push(GOOGLE_CSE_ID);
    }

    if (!cxCandidates.length) {
        throw new Error('Missing GOOGLE_CSE_ID configuration');
    }

    let lastCx = cxCandidates[cxCandidates.length - 1];

    for (let index = 0; index < cxCandidates.length; index++) {
        const cx = cxCandidates[index];
        lastCx = cx;

        try {
            const data = await executeSearchWithSortFallback(params, cx);
            const items = Array.isArray(data.items) ? data.items : [];
            if (items.length) {
                return { items, cxUsed: cx };
            }
        } catch (error) {
            const isLast = index === cxCandidates.length - 1;
            if (isLast) {
                throw error;
            }

            console.warn(
                `Custom Search request failed for cx=${cx}. Falling back to next CX.`,
                error?.message || error
            );
        }
    }

    return { items: [], cxUsed: lastCx };
}

async function executeSearchWithSortFallback(params, cx) {
    const requestBase = {
        auth: GOOGLE_CSE_API_KEY,
        cx,
        q: params.q,
        num: Math.min(10, Math.max(1, params.num || MAX_RESULTS_PER_QUERY)),
        dateRestrict: params.dateRestrict || NEWS_DATE_RESTRICT,
        ...(params.exactTerms ? { exactTerms: params.exactTerms } : {}),
        ...(params.excludeTerms ? { excludeTerms: params.excludeTerms } : {}),
        ...(params.gl || NEWS_GL ? { gl: params.gl || NEWS_GL } : {}),
        ...(params.hl || NEWS_HL ? { hl: params.hl || NEWS_HL } : {}),
        ...(params.safe || NEWS_SAFE ? { safe: params.safe || NEWS_SAFE } : {})
    };

    const sortValue = params.sort || NEWS_SORT;
    if (sortValue) {
        requestBase.sort = sortValue;
    }

    try {
        const { data } = await withNewsRateLimit(() => customSearch.cse.list(requestBase));
        return data;
    } catch (error) {
        if (requestBase.sort && Number(error?.response?.status) === 400) {
            const message = String(error?.message || '').toLowerCase();
            if (message.includes('sort')) {
                const { sort, ...withoutSort } = requestBase;
                const { data } = await withNewsRateLimit(() => customSearch.cse.list(withoutSort));
                return data;
            }
        }
        throw error;
    }
}
