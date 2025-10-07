import { createHash } from 'crypto';
import { google } from 'googleapis';
import {
    GOOGLE_CSE_API_KEY,
    GOOGLE_CSE_ID,
    NEWS_FETCH_BATCH_SIZE,
    NEWS_REFRESH_SECONDS,
    NEWS_RESULTS_PER_FIRM,
    NEWS_SEARCH_TEMPLATE
} from './config.js';
import { getCache, setCache } from './cache.js';
import { NEWS_FIRM_NAMES } from '../../shared/newsFirms.js';

export const NEWS_CACHE_KEY = 'news_feed_snapshot';

const customSearch = google.customsearch('v1');
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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
    return age <= SEVEN_DAYS_MS;
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
    const query = buildQuery(firmName);
    const fetchCount = Math.max(NEWS_RESULTS_PER_FIRM, NEWS_FETCH_BATCH_SIZE);
    const num = Math.min(10, Math.max(1, fetchCount));

    const { data } = await customSearch.cse.list({
        auth: GOOGLE_CSE_API_KEY,
        cx: GOOGLE_CSE_ID,
        q: query,
        dateRestrict: 'd7',
        num
    });

    const items = Array.isArray(data.items) ? data.items : [];
    return items
        .map(item => normalizeSearchItem(item, firmName))
        .filter(Boolean)
        .slice(0, NEWS_RESULTS_PER_FIRM);
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
