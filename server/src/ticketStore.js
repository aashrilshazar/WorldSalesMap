const tickets = new Map();
let lastSyncTimestamp = 0;

export function upsertTicket(ticket) {
    const existing = tickets.get(ticket.id);
    if (existing) {
        tickets.set(ticket.id, {
            ...ticket,
            status: existing.status,
            resolvedAt: existing.resolvedAt || ticket.resolvedAt || null
        });
        return tickets.get(ticket.id);
    }

    const normalized = {
        status: 'open',
        resolvedAt: null,
        ...ticket
    };
    tickets.set(ticket.id, normalized);
    return normalized;
}

export function upsertTickets(batch = []) {
    return batch.map(upsertTicket);
}

export function markTicketResolved(id) {
    const ticket = tickets.get(id);
    if (!ticket) return null;
    const next = { ...ticket, status: 'resolved', resolvedAt: new Date().toISOString() };
    tickets.set(id, next);
    return next;
}

export function reopenTicket(id) {
    const ticket = tickets.get(id);
    if (!ticket) return null;
    const next = { ...ticket, status: 'open', resolvedAt: null };
    tickets.set(id, next);
    return next;
}

export function getAllTickets() {
    return Array.from(tickets.values())
        .sort((a, b) => {
            if (a.status !== b.status) {
                return a.status === 'open' ? -1 : 1;
            }
            return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
        });
}

export function updateLastSync(timestamp = Date.now()) {
    lastSyncTimestamp = timestamp;
}

export function getLastSync() {
    return lastSyncTimestamp;
}

export function resetTickets() {
    tickets.clear();
    lastSyncTimestamp = 0;
}
