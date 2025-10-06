import { kv } from '@vercel/kv';
import {
    KV_TICKET_STATUS_KEY,
    KV_TICKET_CACHE_KEY,
    CACHE_TTL_MS
} from './config.js';

const hasKv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
let memoryStatus = new Map();
let memoryCache = null;

function nowIso() {
    return new Date().toISOString();
}

async function getStatusStore() {
    if (hasKv) {
        const data = await kv.hgetall(KV_TICKET_STATUS_KEY);
        if (!data) return new Map();
        return new Map(Object.entries(data).map(([id, raw]) => {
            try {
                return [id, JSON.parse(raw)];
            } catch (error) {
                console.warn('Failed to parse ticket status from KV', id, error);
                return [id, null];
            }
        }).filter(([, value]) => value));
    }
    return new Map(memoryStatus);
}

async function setStatus(id, payload) {
    if (hasKv) {
        if (!payload) {
            await kv.hdel(KV_TICKET_STATUS_KEY, id);
        } else {
            await kv.hset(KV_TICKET_STATUS_KEY, { [id]: JSON.stringify(payload) });
        }
        return;
    }

    if (!payload) {
        memoryStatus.delete(id);
    } else {
        memoryStatus.set(id, payload);
    }
}

async function getCache() {
    if (hasKv) {
        const cached = await kv.get(KV_TICKET_CACHE_KEY);
        return cached || null;
    }
    return memoryCache;
}

async function setCache(payload) {
    if (hasKv) {
        if (payload == null) {
            await kv.del(KV_TICKET_CACHE_KEY);
            return;
        }
        await kv.set(KV_TICKET_CACHE_KEY, payload, {
            ex: Math.ceil(CACHE_TTL_MS / 1000) || undefined
        });
        return;
    }
    memoryCache = payload || null;
}

async function updateCachedTicket(id, partial) {
    const cached = await getCache();
    if (!cached || !Array.isArray(cached.tickets)) return null;
    const nextTickets = cached.tickets.map(ticket => {
        if (ticket.id !== id) return ticket;
        return { ...ticket, ...partial };
    });
    const updatedTicket = nextTickets.find(ticket => ticket.id === id) || null;
    await setCache({ ...cached, tickets: nextTickets });
    return updatedTicket;
}

export async function getCachedTickets() {
    const cached = await getCache();
    if (!cached) return null;
    const isFresh = Date.now() - cached.timestamp < CACHE_TTL_MS;
    if (!isFresh) return null;
    return cached.tickets || [];
}

export async function updateTicketCache(tickets) {
    await setCache({ timestamp: Date.now(), tickets });
}

export async function applyStatuses(tickets) {
    const statusMap = await getStatusStore();
    return tickets.map(ticket => {
        const status = statusMap.get(ticket.id);
        if (!status) return ticket;
        return { ...ticket, ...status };
    });
}

export async function markTicketResolved(id) {
    const status = { status: 'resolved', resolvedAt: nowIso() };
    await setStatus(id, status);
    const updatedTicket = await updateCachedTicket(id, status);
    return updatedTicket ? updatedTicket : { id, ...status };
}

export async function reopenTicket(id) {
    const status = { status: 'open', resolvedAt: null };
    await setStatus(id, status);
    const updatedTicket = await updateCachedTicket(id, status);
    return updatedTicket ? updatedTicket : { id, ...status };
}

export async function clearCache() {
    await setCache(null);
}
