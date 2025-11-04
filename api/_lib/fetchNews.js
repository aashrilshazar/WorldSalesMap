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
    NEWS_LR,
    NEWS_SAFE,
    NEWS_SEARCH_TEMPLATE,
    NEWS_SNAPSHOT_TTL_SECONDS,
    NEWS_SORT,
    NEWS_DATE_RESTRICT,
    NEWS_EXCLUDE_TERMS,
    NEWS_ALLOWLIST_SITES,
    NEWS_REFRESH_COOLDOWN_SECONDS
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
const SIGNAL_KEYWORDS = {
    fund: [
        'fund',
        'funds',
        'funding',
        'raise',
        'raises',
        'raised',
        'raising',
        'fundraise',
        'fundraising',
        'close',
        'closes',
        'closed',
        'closing',
        'capital raise'
    ],
    deal: [
        'acquire',
        'acquires',
        'acquired',
        'acquisition',
        'deal',
        'merger',
        'merges',
        'merging',
        'investment',
        'invests',
        'invested',
        'backs',
        'take-private',
        'buyout'
    ],
    hire: [
        'hire',
        'hires',
        'hired',
        'hiring',
        'appoints',
        'appointed',
        'appointing',
        'joins',
        'join',
        'joining',
        'named',
        'recruits',
        'recruited'
    ],
    promotion: [
        'promote',
        'promotes',
        'promoted',
        'promotion',
        'promotions',
        'elevates',
        'elevated',
        'elevating',
        'named managing director',
        'named partner',
        'promoted to'
    ]
};
const ALLOWLIST_TERMS = NEWS_ALLOWLIST_SITES.map(site => site.trim()).filter(Boolean);
const ALLOWLIST_QUERY_SUFFIX = ALLOWLIST_TERMS.length
    ? ' (' + ALLOWLIST_TERMS.join(' OR ') + ')'
    : '';
const ALLOWLIST_DOMAINS = ALLOWLIST_TERMS.map(term => term.replace(/^site:/i, '').toLowerCase());
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
const REFRESH_COOLDOWN_MS = Math.max(
    0,
    Number.isFinite(NEWS_REFRESH_COOLDOWN_SECONDS)
        ? NEWS_REFRESH_COOLDOWN_SECONDS * 1000
        : 0
);

function isUrlAllowlisted(url, displayLink) {
    if (!ALLOWLIST_DOMAINS.length) return true;

    const candidates = [];
    if (url) {
        candidates.push(url.toLowerCase());
        try {
            candidates.push(new URL(url).host.toLowerCase());
        } catch (error) {
            // ignore invalid URL parsing
        }
    }
    if (displayLink) {
        candidates.push(String(displayLink).toLowerCase());
    }

    return ALLOWLIST_DOMAINS.some(domain =>
        candidates.some(value => value && value.includes(domain))
    );
}

async function isCancellationRequested(jobId) {
    if (!jobId) return false;
    const state = await loadJobState();
    if (!state) return false;
    if (state.id !== jobId) return false;
    return !!state.cancelRequested;
}

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

    if (!isUrlAllowlisted(item.link, item.displayLink)) {
        return null;
    }

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

    const primaryParams = buildFallbackQueryParams(firmName);
    const { items: primaryItems, cxUsed: primaryCx } = await fetchWithCseFallback(primaryParams, {
        preferStrict: true
    });
    const primaryArticles = normalizeAndTagItems(primaryItems, firmName, primaryCx);

    for (const article of primaryArticles) {
        if (seen.has(article.id)) continue;
        seen.add(article.id);
        collected.push(article);
        if (collected.length >= limit) break;
    }

    if (!collected.length) {
        const secondaryParams = buildOpenQueryParams(firmName);
        const { items: secondaryItems, cxUsed: secondaryCx } = await fetchWithCseFallback(
            secondaryParams,
            { preferStrict: false }
        );
        const secondaryArticles = normalizeAndTagItems(secondaryItems, firmName, secondaryCx);

        for (const article of secondaryArticles) {
            if (seen.has(article.id)) continue;
            seen.add(article.id);
            collected.push(article);
            if (collected.length >= limit) break;
        }
    }

    return collected.slice(0, limit);
}

async function fetchBatchForFirms(firmNames, jobId) {
    const allItems = [];
    const batchErrors = [];
    let processed = 0;
    let cancelled = false;

    for (const firmName of firmNames) {
        if (await isCancellationRequested(jobId)) {
            cancelled = true;
            break;
        }

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

        processed += 1;
    }

    return { items: allItems, errors: batchErrors, processed, cancelled };
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
    const snapshotFresh = isSnapshotFreshEnough(snapshot);

    if (!forceRefresh) {
        let status = 'idle';
        if (jobState?.cancelRequested) {
            status = 'cancelled';
        } else if (jobState?.completedAt) {
            status = 'complete';
        } else if (jobState) {
            status = 'running';
        }
        return buildResponse(snapshot || {}, jobState, status);
    }

    if (snapshotFresh && (!jobState || jobState.completedAt)) {
        const status =
            snapshot?.jobStatus && snapshot.jobStatus !== 'running'
                ? snapshot.jobStatus
                : 'complete';
        const responseSnapshot = snapshot
            ? {
                  ...snapshot,
                  jobStatus: status
              }
            : { jobStatus: status, items: [] };
        return buildResponse(responseSnapshot, jobState?.completedAt ? jobState : null, status);
    }

    const nowIso = new Date().toISOString();
    const baseItems = Array.isArray(snapshot?.items) ? snapshot.items : [];
    let baseErrors = snapshot?.errors || null;

    if (
        !jobState ||
        jobState.completedAt ||
        jobState.cancelRequested ||
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
            completedAt: null,
            cancelRequested: false
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

    if (await isCancellationRequested(jobState.id)) {
        jobState.cancelRequested = true;
        jobState.jobStatus = 'cancelled';
        jobState.completedAt = jobState.completedAt || nowIso;
        await saveJobState(jobState, JOB_STATE_TTL_SECONDS);

        const cancelledSnapshot = (await loadSnapshot()) || {
            items: baseItems,
            lastUpdated: jobState.completedAt,
            errors: baseErrors,
            jobStatus: 'cancelled'
        };
        cancelledSnapshot.jobStatus = 'cancelled';
        cancelledSnapshot.lastUpdated = cancelledSnapshot.lastUpdated || jobState.completedAt;
        await saveSnapshot(cancelledSnapshot, SNAPSHOT_TTL_SECONDS);

        await clearJobState();
        return buildResponse(cancelledSnapshot, jobState, 'cancelled');
    }

    const plannedEndIndex = Math.min(totalFirms, startIndex + FIRMS_PER_BATCH);
    const firms = NEWS_FIRM_NAMES.slice(startIndex, plannedEndIndex);
    const batchResult = await fetchBatchForFirms(firms, jobState.id);

    const currentSnapshot = (await loadSnapshot()) || {
        items: baseItems,
        lastUpdated: null,
        errors: baseErrors
    };

    const existingIds = new Set((Array.isArray(currentSnapshot.items) ? currentSnapshot.items : []).map(item => item.id).filter(Boolean));
    const mergedItems = mergeSnapshotItems(currentSnapshot.items, batchResult.items);
    const mergedErrors = mergeErrors(currentSnapshot.errors, batchResult.errors);
    const processedCount = batchResult.processed || 0;
    const processedFirms =
        processedCount >= firms.length ? firms : firms.slice(0, processedCount);
    const updatedSnapshot = {
        ...currentSnapshot,
        items: mergedItems,
        errors: mergedErrors,
        lastUpdated: nowIso,
        jobId: jobState.id,
        jobStatus: 'running'
    };

    await saveSnapshot(updatedSnapshot, SNAPSHOT_TTL_SECONDS);

    const nextIndex = startIndex + processedCount;

    jobState.nextIndex = nextIndex;
    jobState.processed = nextIndex;
    jobState.batchSize = FIRMS_PER_BATCH;
    jobState.lastBatchAt = nowIso;

    let status = 'running';

    if (batchResult.cancelled || (await isCancellationRequested(jobState.id))) {
        status = 'cancelled';
        jobState.cancelRequested = true;
        jobState.jobStatus = 'cancelled';
        jobState.completedAt = jobState.completedAt || nowIso;
        updatedSnapshot.jobStatus = 'cancelled';
        await saveSnapshot(updatedSnapshot, SNAPSHOT_TTL_SECONDS);
        await saveJobState(jobState, JOB_STATE_TTL_SECONDS);
        await clearJobState();

        const newItemIds = batchResult.items
            .map(item => item?.id)
            .filter(id => id && !existingIds.has(id));
        const batchMeta = {
            firms: processedFirms,
            newItems: newItemIds,
            errors: batchResult.errors,
            range: { start: startIndex, end: nextIndex },
            cancelled: true
        };

        return buildResponse(updatedSnapshot, jobState, status, batchMeta);
    }

    if (nextIndex >= totalFirms) {
        jobState.completedAt = nowIso;
        updatedSnapshot.jobStatus = 'complete';
        updatedSnapshot.lastUpdated = nowIso;
        await saveSnapshot(updatedSnapshot, SNAPSHOT_TTL_SECONDS);
    }

    await saveJobState(jobState, JOB_STATE_TTL_SECONDS);

    status = jobState.completedAt ? 'complete' : 'running';
    const newItemIds = batchResult.items
        .map(item => item?.id)
        .filter(id => id && !existingIds.has(id));
    const batchMeta = {
        firms: processedFirms,
        newItems: newItemIds,
        errors: batchResult.errors,
        range: { start: startIndex, end: nextIndex }
    };

    return buildResponse(updatedSnapshot, jobState, status, batchMeta);
}

export async function cancelNewsJob() {
    const nowIso = new Date().toISOString();
    const snapshot = (await loadSnapshot()) || {
        items: [],
        lastUpdated: null,
        errors: null
    };

    let jobState = await loadJobState();

    if (jobState) {
        if (!jobState.cancelRequested) {
            jobState.cancelRequested = true;
        }
        jobState.jobStatus = 'cancelled';
        jobState.completedAt = jobState.completedAt || nowIso;
        await saveJobState(jobState, JOB_STATE_TTL_SECONDS);
    }

    snapshot.jobStatus = 'cancelled';
    snapshot.lastUpdated = snapshot.lastUpdated || nowIso;
    await saveSnapshot(snapshot, SNAPSHOT_TTL_SECONDS);

    return buildResponse(snapshot, jobState, 'cancelled');
}

export async function clearNewsData() {
    await cancelNewsJob();

    const jobState = await loadJobState();

    const emptySnapshot = {
        items: [],
        lastUpdated: null,
        errors: null,
        jobStatus: 'idle'
    };

    await saveSnapshot(emptySnapshot, SNAPSHOT_TTL_SECONDS);

    const status = jobState?.cancelRequested ? 'cancelled' : 'idle';
    return buildResponse(emptySnapshot, jobState, status);
}

function buildFallbackQueryParams(firmName) {
    const baseQuery = `${buildQuery(firmName)}${ALLOWLIST_QUERY_SUFFIX}`;
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

function buildOpenQueryParams(firmName) {
    return {
        q: buildQuery(firmName),
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

function normalizeAndTagItems(items, firmName, cxUsed) {
    const normalized = [];
    for (const item of items) {
        const article = normalizeSearchItem(item, firmName);
        if (!article) continue;

        const tags = new Set(article.tags || []);
        deriveSignalTags(article, tags);

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

function deriveSignalTags(article, tags) {
    const text = [
        article.headline || '',
        article.summary || '',
        article.source || ''
    ]
        .join(' ')
        .toLowerCase();

    for (const [signal, keywords] of Object.entries(SIGNAL_KEYWORDS)) {
        if (keywords.some(keyword => text.includes(keyword))) {
            tags.add(signal);
        }
    }
}

function isSnapshotFreshEnough(snapshot) {
    if (!REFRESH_COOLDOWN_MS || !snapshot?.lastUpdated) {
        return false;
    }
    const last = new Date(snapshot.lastUpdated);
    if (Number.isNaN(last.getTime())) {
        return false;
    }
    return Date.now() - last.getTime() < REFRESH_COOLDOWN_MS;
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
        ...(params.safe || NEWS_SAFE ? { safe: params.safe || NEWS_SAFE } : {}),
        ...(params.lr || NEWS_LR ? { lr: params.lr || NEWS_LR } : {})
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
