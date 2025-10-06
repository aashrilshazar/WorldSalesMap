import { Redis } from '@upstash/redis';

let redisClient = null;

function getRedis() {
    if (redisClient) return redisClient;
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        throw new Error('Upstash credentials missing. Set KV_REST_API_URL and KV_REST_API_TOKEN.');
    }

    redisClient = new Redis({ url, token });
    return redisClient;
}

const STATUS_KEY_PREFIX = 'gmail-ticket-status:';

export async function getTicketStatuses(ids = []) {
    if (!ids.length) return new Map();
    const redis = getRedis();

    const pipeline = redis.pipeline();
    ids.forEach(id => pipeline.get(STATUS_KEY_PREFIX + id));
    const results = await pipeline.exec();

    const map = new Map();
    results.forEach((value, index) => {
        const id = ids[index];
        if (!value) return;
        try {
            map.set(id, JSON.parse(value));
        } catch (err) {
            console.warn('Failed to parse ticket status for', id, err);
        }
    });
    return map;
}

export async function setTicketStatus(id, statusPayload) {
    const redis = getRedis();
    if (!statusPayload) {
        await redis.del(STATUS_KEY_PREFIX + id);
        return null;
    }
    const payload = {
        ...statusPayload,
        updatedAt: new Date().toISOString()
    };
    await redis.set(STATUS_KEY_PREFIX + id, JSON.stringify(payload));
    return payload;
}

export async function clearTicketStatus(id) {
    const redis = getRedis();
    await redis.del(STATUS_KEY_PREFIX + id);
}
