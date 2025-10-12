import { createHash } from 'crypto';
import { google } from 'googleapis';
import {
    GOOGLE_CSE_API_KEY,
    GOOGLE_CSE_ID,
    NEWS_FETCH_BATCH_SIZE,
    NEWS_REFRESH_HOURS,
    NEWS_RESULTS_PER_FIRM,
    NEWS_SEARCH_TEMPLATE
} from './config.js';
import { NEWS_FIRM_NAMES } from '../../shared/newsFirms.js';
import { withNewsRateLimit } from '../../shared/newsRateLimiter.js';

const customSearch = google.customsearch('v1');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = Math.max(1, NEWS_REFRESH_HOURS) * 60 * 60 * 1000;

const newsState = {
    items: [],
    lastUpdated: null,
    lastError: null
};

let inFlightRefresh = null;
let schedulerHandle = null;

function buildQuery(firmName) {
    return NEWS_SEARCH_TEMPLATE.replace(/<firm name>/gi, firmName);
}

function isRecentEnough(date) {
    if (!date) return true;
    const age = Date.now() - date.getTime();
    return age <= ONE_DAY_MS;
}

function extractPublishedAt(item) {
    const candidates = [];
    const pagemap = item.pagemap || {};

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
        const date = new Date(candidate);
        if (!Number.isNaN(date.getTime())) return date;
    }

    return null;
}

function extractSource(item) {
    const pagemap = item.pagemap || {};
    if (Array.isArray(pagemap.metatags)) {
        for (const meta of pagemap.metatags) {
            const siteName = meta['og:site_name'] || meta['twitter:site'] || meta['application-name'];
            if (siteName) return siteName.replace(/^@/, '');
        }
    }
    return item.displayLink || '';
}

function buildNewsId(firmName, link, title) {
    const hash = createHash('sha1');
    hash.update(firmName);
    if (link) hash.update(link);
    if (title) hash.update(title);
    return `news_${hash.digest('hex').slice(0, 16)}`;
}

function normalizeSearchItem(item, firmName) {
    if (!item?.link) return null;

    const publishedAt = extractPublishedAt(item) || new Date();

    if (!isRecentEnough(publishedAt)) {
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
    try {
        const query = buildQuery(firmName);
        const fetchCount = Math.max(NEWS_RESULTS_PER_FIRM, NEWS_FETCH_BATCH_SIZE);
        const num = Math.min(10, Math.max(1, fetchCount));
        const { data } = await withNewsRateLimit(() =>
            customSearch.cse.list({
                auth: GOOGLE_CSE_API_KEY,
                cx: GOOGLE_CSE_ID,
                q: query,
                dateRestrict: 'd1',
                num
            })
        );

        const items = Array.isArray(data.items) ? data.items : [];
        const normalized = items
            .map(item => normalizeSearchItem(item, firmName))
            .filter(Boolean)
            .slice(0, NEWS_RESULTS_PER_FIRM);

        return normalized;
    } catch (error) {
        console.error(`Failed to fetch news for ${firmName}:`, error.message);
        throw error;
    }
}

async function refreshNewsInternal() {
    const aggregated = [];
    const errors = [];

    for (const firmName of NEWS_FIRM_NAMES) {
        try {
            const firmNews = await fetchFirmNews(firmName);
            aggregated.push(...firmNews);
        } catch (error) {
            errors.push({ firm: firmName, message: error.message });
        }
    }

    aggregated.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    newsState.items = aggregated;
    newsState.lastUpdated = new Date().toISOString();
    newsState.lastError = errors.length ? errors : null;

    return newsState;
}

export function startNewsScheduler() {
    if (!schedulerHandle) {
        schedulerHandle = setInterval(() => {
            refreshNews().catch(error => {
                console.error('Scheduled news refresh failed:', error.message);
            });
        }, REFRESH_INTERVAL_MS);

        if (typeof schedulerHandle.unref === 'function') {
            schedulerHandle.unref();
        }
    }

    refreshNews().catch(error => {
        console.error('Initial news fetch failed:', error.message);
    });
}

function isStale() {
    if (!newsState.lastUpdated) return true;
    const last = new Date(newsState.lastUpdated);
    if (Number.isNaN(last.getTime())) return true;
    return Date.now() - last.getTime() > REFRESH_INTERVAL_MS;
}

export async function refreshNews() {
    if (inFlightRefresh) {
        return inFlightRefresh;
    }

    inFlightRefresh = refreshNewsInternal()
        .catch(error => {
            newsState.lastError = [{ firm: 'all', message: error.message }];
            throw error;
        })
        .finally(() => {
            inFlightRefresh = null;
        });

    return inFlightRefresh;
}

export async function getNewsSnapshot({ forceRefresh = false } = {}) {
    if (forceRefresh || isStale()) {
        try {
            await refreshNews();
        } catch (error) {
            console.error('Failed to refresh news snapshot:', error.message);
        }
    }

    return {
        items: newsState.items.slice(),
        lastUpdated: newsState.lastUpdated,
        errors: newsState.lastError
    };
}
