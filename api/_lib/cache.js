const cache = new Map();

export function setCache(key, value, ttlSeconds) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    cache.set(key, { value, expiresAt });
}

export function getCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}
