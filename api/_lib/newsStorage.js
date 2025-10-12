import { getRedisClient } from './storage.js';

const SNAPSHOT_KEY = 'news:snapshot:v1';
const JOB_STATE_KEY = 'news:job:v1';

function safeJsonParse(value, fallback = null) {
    if (!value) return fallback;
    try {
        if (typeof value === 'string') {
            return JSON.parse(value);
        }
        return value;
    } catch (error) {
        console.warn('Failed to parse stored news payload:', error);
        return fallback;
    }
}

export async function loadSnapshot() {
    const redis = getRedisClient();
    const value = await redis.get(SNAPSHOT_KEY);
    return safeJsonParse(value, null);
}

export async function saveSnapshot(snapshot, ttlSeconds) {
    const redis = getRedisClient();
    if (ttlSeconds) {
        await redis.set(SNAPSHOT_KEY, JSON.stringify(snapshot), { ex: ttlSeconds });
    } else {
        await redis.set(SNAPSHOT_KEY, JSON.stringify(snapshot));
    }
}

export async function clearSnapshot() {
    const redis = getRedisClient();
    await redis.del(SNAPSHOT_KEY);
}

export async function loadJobState() {
    const redis = getRedisClient();
    const value = await redis.get(JOB_STATE_KEY);
    return safeJsonParse(value, null);
}

export async function saveJobState(state, ttlSeconds) {
    const redis = getRedisClient();
    const payload = {
        ...state,
        updatedAt: new Date().toISOString()
    };
    if (ttlSeconds) {
        await redis.set(JOB_STATE_KEY, JSON.stringify(payload), { ex: ttlSeconds });
    } else {
        await redis.set(JOB_STATE_KEY, JSON.stringify(payload));
    }
    return payload;
}

export async function clearJobState() {
    const redis = getRedisClient();
    await redis.del(JOB_STATE_KEY);
}
