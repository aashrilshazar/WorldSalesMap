import { fetchNews as fetchNewsSnapshot } from '../../api/_lib/fetchNews.js';
import { NEWS_REFRESH_COOLDOWN_SECONDS } from '../../api/_lib/config.js';

const DEFAULT_COOLDOWN_SECONDS = 12 * 60 * 60;
const MIN_SCHEDULER_INTERVAL_MS = 60 * 60 * 1000;

const cooldownSeconds =
    Number.isFinite(NEWS_REFRESH_COOLDOWN_SECONDS) && NEWS_REFRESH_COOLDOWN_SECONDS > 0
        ? NEWS_REFRESH_COOLDOWN_SECONDS
        : DEFAULT_COOLDOWN_SECONDS;
const schedulerIntervalMs = Math.max(cooldownSeconds * 1000, MIN_SCHEDULER_INTERVAL_MS);

let schedulerHandle = null;
let initialKickoff = null;

export function startNewsScheduler() {
    if (schedulerHandle) return;

    schedulerHandle = setInterval(() => {
        triggerRefresh(true);
    }, schedulerIntervalMs);

    if (typeof schedulerHandle.unref === 'function') {
        schedulerHandle.unref();
    }

    initialKickoff = triggerRefresh(true);
}

async function triggerRefresh(forceRefresh = false) {
    try {
        return await fetchNewsSnapshot(forceRefresh);
    } catch (error) {
        console.error(
            forceRefresh ? 'Scheduled news refresh failed:' : 'News snapshot fetch failed:',
            error.message || error
        );
        throw error;
    }
}

export function waitForInitialRefresh() {
    return initialKickoff;
}

export async function refreshNews() {
    return triggerRefresh(true);
}

export async function getNewsSnapshot({ forceRefresh = false } = {}) {
    return triggerRefresh(forceRefresh);
}
