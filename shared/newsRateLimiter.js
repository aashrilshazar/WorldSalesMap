const DEFAULT_INTERVAL_MS = Number(process.env.NEWS_REQUEST_INTERVAL_MS || 500);
const DEFAULT_MAX_RETRIES = Number(process.env.NEWS_REQUEST_MAX_RETRIES || 3);
const DEFAULT_BACKOFF_MS = Number(process.env.NEWS_REQUEST_BACKOFF_MS || 15000);
const DEFAULT_JITTER_MS = Number(process.env.NEWS_REQUEST_JITTER_MS || 250);

let lastInvocationTime = 0;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isQuotaError(error) {
    if (!error) return false;

    // googleapis sets response.status for HTTP 429 quota errors
    if (Number(error?.response?.status) === 429) {
        return true;
    }

    const message = String(error?.message || '').toLowerCase();
    return message.includes('quota exceeded') || message.includes('rate limit');
}

function withJitter(baseDelay, jitterMs) {
    if (jitterMs <= 0) return baseDelay;
    const sign = Math.random() < 0.5 ? -1 : 1;
    const variation = Math.random() * jitterMs;
    return Math.max(0, baseDelay + sign * variation);
}

async function waitForInterval(intervalMs) {
    const now = Date.now();
    const elapsed = now - lastInvocationTime;
    const remaining = intervalMs - elapsed;
    if (remaining > 0) {
        await sleep(withJitter(remaining, DEFAULT_JITTER_MS));
    }
}

async function executeWithRetry(task, options, attempt = 0) {
    const { intervalMs, maxRetries, backoffMs } = options;

    await waitForInterval(intervalMs);

    try {
        const result = await task();
        lastInvocationTime = Date.now();
        return result;
    } catch (error) {
        lastInvocationTime = Date.now();

        if (attempt >= maxRetries || !isQuotaError(error)) {
            throw error;
        }

        const delay = withJitter(backoffMs * Math.pow(2, attempt), DEFAULT_JITTER_MS);
        await sleep(delay);
        return executeWithRetry(task, options, attempt + 1);
    }
}

export async function withNewsRateLimit(task, overrides = {}) {
    const intervalMs = Number(overrides.intervalMs || DEFAULT_INTERVAL_MS);
    const maxRetries = Number(
        overrides.maxRetries === undefined ? DEFAULT_MAX_RETRIES : overrides.maxRetries
    );
    const backoffMs = Number(overrides.backoffMs || DEFAULT_BACKOFF_MS);

    return executeWithRetry(task, { intervalMs, maxRetries, backoffMs });
}
