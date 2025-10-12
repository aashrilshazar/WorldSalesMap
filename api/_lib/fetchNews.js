import { createHash } from 'crypto';
import { google } from 'googleapis';
import {
    GOOGLE_CSE_API_KEY,
    GOOGLE_CSE_ID,
    GOOGLE_CSE_ID_STRICT,
    NEWS_FETCH_BATCH_SIZE,
    NEWS_FIRMS_PER_BATCH,
    NEWS_GL,
    NEWS_HL,
    NEWS_JOB_TTL_SECONDS,
    NEWS_RESULTS_PER_FIRM,
    NEWS_SAFE,
    NEWS_SEARCH_TEMPLATE,
    NEWS_SNAPSHOT_TTL_SECONDS,
    NEWS_SORT,
    NEWS_DATE_RESTRICT,
    NEWS_EXCLUDE_TERMS,
    NEWS_NEGATIVE_SITE_EXCLUDES
} from './config.js';
import {
    loadSnapshot,
    saveSnapshot,
    loadJobState,
    saveJobState,
    clearJobState
} from './newsStorage.js';
import { NEWS_FIRM_NAMES } from '../../shared/newsFirms.js';
import { withNewsRateLimit } from '../../shared/newsRateLimiter.js';

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
const FIRMS_PER_BATCH = Math.max(1, Number.isFinite(NEWS_FIRMS_PER_BATCH) ? NEWS_FIRMS_PER_BATCH : 5);
const SNAPSHOT_TTL_SECONDS = Math.max(
    60,
    Number.isFinite(NEWS_SNAPSHOT_TTL_SECONDS) ? NEWS_SNAPSHOT_TTL_SECONDS : 24 * 60 * 60
);
const JOB_STATE_TTL_SECONDS = Math.max(
    SNAPSHOT_TTL_SECONDS,
    Number.isFinite(NEWS_JOB_TTL_SECONDS) ? NEWS_JOB_TTL_SECONDS : 24 * 60 * 60
);
const MAX_ERROR_ENTRIES = 500;

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

async function fetchBatchForFirms(firmNames) {
    const allItems = [];
    const batchErrors = [];

    for (const firmName of firmNames) {
        try {
            const items = await fetchFirmNews(firmName);
            allItems.push(...items);
        } catch (error) {
            const message = error?.message || 'Failed to fetch news';
            batchErrors.push({
                firm: firmName,
                message,
                at: new Date().toISOString()
            });
        }
    }

    return { items: allItems, errors: batchErrors };
}

function mergeSnapshotItems(existingItems = [], newItems = []) {
    if (!Array.isArray(existingItems)) existingItems = [];
    if (!Array.isArray(newItems)) newItems = [];

    const merged = new Map();
    for (const item of existingItems) {
        if (item?.id) {
            merged.set(item.id, item);
        }
    }
    for (const item of newItems) {
        if (item?.id) {
            merged.set(item.id, item);
        }
    }

    const sorted = Array.from(merged.values()).sort(
        (a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)
    );

    return enforcePerFirmLimit(sorted);
}

function enforcePerFirmLimit(items) {
    const limit = Math.max(1, NEWS_RESULTS_PER_FIRM);
    if (!Array.isArray(items) || !items.length) return [];
    if (!limit) return items;

    const perFirmCounts = new Map();
    const result = [];

    for (const item of items) {
        const firm = item?.firm || 'unknown';
        const current = perFirmCounts.get(firm) || 0;
        if (current >= limit) continue;
        perFirmCounts.set(firm, current + 1);
        result.push(item);
    }

    return result;
}

function mergeErrors(existingErrors = null, newErrors = []) {
    const combined = [
        ...(Array.isArray(existingErrors) ? existingErrors : []),
        ...newErrors
    ];
    if (!combined.length) return null;
    if (combined.length > MAX_ERROR_ENTRIES) {
        return combined.slice(combined.length - MAX_ERROR_ENTRIES);
    }
    return combined;
}

function buildResponse(snapshot = {}, job = null, status = 'idle', batch = null) {
    const items = Array.isArray(snapshot.items) ? snapshot.items : [];
    const normalizedItems = items
        .slice()
        .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

    let derivedStatus = status;
    if (!job && typeof snapshot.jobStatus === 'string') {
        derivedStatus = snapshot.jobStatus;
    }

    const totalFirms = job?.totalFirms ?? NEWS_FIRM_NAMES.length;
    const processed = job?.processed ?? job?.nextIndex ?? 0;
    const percentComplete =
        totalFirms > 0 ? Math.min(100, Math.round((processed / totalFirms) * 100)) : null;

    const jobInfo = job
        ? {
              id: job.id,
              totalFirms,
              processedFirms: processed,
              nextIndex: job.nextIndex ?? processed,
              batchSize: job.batchSize ?? FIRMS_PER_BATCH,
              startedAt: job.startedAt || null,
              lastBatchAt: job.lastBatchAt || null,
              completedAt: job.completedAt || null,
              percentComplete
          }
        : null;

    return {
        items: normalizedItems,
        lastUpdated: snapshot.lastUpdated || null,
        errors: snapshot.errors || null,
        status: derivedStatus,
        job: jobInfo,
        batch
    };
}

export async function fetchNews(forceRefresh = false) {
    const totalFirms = NEWS_FIRM_NAMES.length;
    const snapshot = await loadSnapshot();
    let jobState = await loadJobState();

    if (!forceRefresh) {
        const status =
            jobState && jobState.completedAt ? 'complete' : jobState ? 'running' : 'idle';
        return buildResponse(snapshot || {}, jobState, status);
    }

    const nowIso = new Date().toISOString();
    const baseItems = Array.isArray(snapshot?.items) ? snapshot.items : [];
    let baseErrors = snapshot?.errors || null;

    if (
        !jobState ||
        jobState.completedAt ||
        jobState.nextIndex >= totalFirms ||
        !jobState.id
    ) {
        await clearJobState();
        jobState = {
            id: `job_${Date.now()}`,
            totalFirms,
            nextIndex: 0,
            processed: 0,
            batchSize: FIRMS_PER_BATCH,
            startedAt: nowIso,
            lastBatchAt: null,
            completedAt: null
        };
        await saveJobState(jobState, JOB_STATE_TTL_SECONDS);

        const initialSnapshot = {
            items: baseItems,
            lastUpdated: snapshot?.lastUpdated || null,
            errors: null,
            jobId: jobState.id,
            jobStatus: 'running'
        };
        await saveSnapshot(initialSnapshot, SNAPSHOT_TTL_SECONDS);
        baseErrors = null;
    }

    const startIndex = jobState.nextIndex || 0;
    if (startIndex >= totalFirms) {
        jobState.completedAt = jobState.completedAt || nowIso;
        await saveJobState(jobState, JOB_STATE_TTL_SECONDS);

        const finalSnapshot = (await loadSnapshot()) || {
            items: baseItems,
            lastUpdated: jobState.completedAt,
            errors: baseErrors,
            jobStatus: 'complete'
        };

        if (!finalSnapshot.lastUpdated) {
            finalSnapshot.lastUpdated = jobState.completedAt;
            await saveSnapshot(finalSnapshot, SNAPSHOT_TTL_SECONDS);
        }

        return buildResponse(finalSnapshot, jobState, 'complete');
    }

    const endIndex = Math.min(totalFirms, startIndex + FIRMS_PER_BATCH);
    const firms = NEWS_FIRM_NAMES.slice(startIndex, endIndex);
    const batchResult = await fetchBatchForFirms(firms);

    const currentSnapshot = (await loadSnapshot()) || {
        items: baseItems,
        lastUpdated: null,
        errors: baseErrors
    };

    const existingIds = new Set((Array.isArray(currentSnapshot.items) ? currentSnapshot.items : []).map(item => item.id).filter(Boolean));
    const mergedItems = mergeSnapshotItems(currentSnapshot.items, batchResult.items);
    const mergedErrors = mergeErrors(currentSnapshot.errors, batchResult.errors);
    const updatedSnapshot = {
        ...currentSnapshot,
        items: mergedItems,
        errors: mergedErrors,
        lastUpdated: nowIso,
        jobId: jobState.id,
        jobStatus: endIndex >= totalFirms ? 'complete' : 'running'
    };

    await saveSnapshot(updatedSnapshot, SNAPSHOT_TTL_SECONDS);

    jobState.nextIndex = endIndex;
    jobState.processed = endIndex;
    jobState.batchSize = FIRMS_PER_BATCH;
    jobState.lastBatchAt = nowIso;

    if (endIndex >= totalFirms) {
        jobState.completedAt = nowIso;
        updatedSnapshot.jobStatus = 'complete';
        updatedSnapshot.lastUpdated = nowIso;
        await saveSnapshot(updatedSnapshot, SNAPSHOT_TTL_SECONDS);
    }

    await saveJobState(jobState, JOB_STATE_TTL_SECONDS);

    const status = jobState.completedAt ? 'complete' : 'running';
    const newItemIds = batchResult.items
        .map(item => item?.id)
        .filter(id => id && !existingIds.has(id));
    const batchMeta = {
        firms,
        newItems: newItemIds,
        errors: batchResult.errors,
        range: { start: startIndex, end: endIndex }
    };

    return buildResponse(updatedSnapshot, jobState, status, batchMeta);
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
