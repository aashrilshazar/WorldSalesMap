const TICKETS_ENDPOINT = '/api/tickets';
const TICKET_REFRESH_MS = 60_000;

async function initTicketSidebar() {
    const listEl = $('tickets-list');
    const countEl = $('tickets-count');
    if (!listEl || !countEl) return;

    if (!listEl.dataset.actionsBound) {
        listEl.addEventListener('click', handleTicketListClick);
        listEl.dataset.actionsBound = 'true';
    }

    countEl.textContent = 'Loading…';
    listEl.innerHTML = renderStatus('Loading Gmail tickets…');

    await loadTicketsFromServer();

    if (!state.ticketRefreshInterval) {
        state.ticketRefreshInterval = setInterval(loadTicketsFromServer, TICKET_REFRESH_MS);
    }
}

async function loadTicketsFromServer() {
    const listEl = $('tickets-list');
    const countEl = $('tickets-count');
    if (!listEl || !countEl) return;

    state.ticketError = null;

    try {
        const response = await fetch(TICKETS_ENDPOINT);
        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }
        const data = await response.json();
        const tickets = Array.isArray(data.tickets) ? data.tickets : [];

        state.resolvedTicketIds = new Set(
            tickets
                .filter(ticket => ticket.status === 'resolved')
                .map(ticket => ticket.id)
        );
        state.dismissedTicketIds = new Set(
            tickets
                .filter(ticket => ticket.status === 'dismissed')
                .map(ticket => ticket.id)
        );

        state.gmailTickets = tickets.filter(ticket => ticket.status !== 'dismissed');
    } catch (error) {
        console.error('Failed to load Gmail tickets', error);
        state.ticketError = error.message || 'Unable to load Gmail tickets';
        state.gmailTickets = [];
    }

    renderTicketSidebar();
}

function renderTicketSidebar() {
    const listEl = $('tickets-list');
    const countEl = $('tickets-count');
    if (!listEl || !countEl) return;

    if (state.ticketError) {
        countEl.textContent = '0 unresolved';
        listEl.innerHTML = renderStatus(state.ticketError, true);
        return;
    }

    const tickets = state.gmailTickets || [];
    const unresolved = tickets.filter(t => t.status !== 'resolved');

    countEl.textContent = unresolved.length ? `${unresolved.length} unresolved` : 'All caught up';

    if (!tickets.length) {
        listEl.innerHTML = renderStatus('No matching emails were found in the configured inbox yet.');
        return;
    }

    const cards = tickets.map(renderTicketCard).join('');
    listEl.innerHTML = cards;
}

function renderStatus(message, isError = false) {
    const cls = isError ? 'ticket-error' : 'ticket-empty';
    return `<div class="${cls}">${message}</div>`;
}

function renderTicketCard(ticket) {
    const isResolved = ticket.status === 'resolved';
    const priority = ticket.priority ? ticket.priority.toLowerCase() : '';
    const badge = priority ? `<span class="ticket-card__badge ticket-card__badge--${priority}">${formatPriority(priority)}</span>` : '';
    const inboxTag = ticket.inbox
        ? `<span class="ticket-card__tag ticket-card__tag--inbox">${ticket.inbox}</span>`
        : '';

    return `
        <article class="ticket-card${isResolved ? ' ticket-card--resolved' : ''}" data-ticket-id="${ticket.id}">
            <div class="ticket-card__header">
                <div class="ticket-card__title">
                    <div class="ticket-card__firm">${ticket.firmName || 'Unknown Firm'}</div>
                    <div class="ticket-card__meta">${formatRelativeTime(ticket.receivedAt)} • ${ticket.sender || 'unknown sender'}</div>
                </div>
                ${badge}
            </div>
            <div class="ticket-card__subject">${ticket.subject || '(no subject)'}</div>
            <div class="ticket-card__details">
                ${ticket.firmDomain ? `<span class="ticket-card__tag">@${ticket.firmDomain}</span>` : ''}
                ${inboxTag}
            </div>
            <div class="ticket-card__buttons">
                <button type="button" class="ticket-card__button${isResolved ? ' ticket-card__button--active' : ''}" data-ticket-action="resolve" data-ticket-id="${ticket.id}">
                    ${isResolved ? 'Unresolve' : 'Mark Resolved'}
                </button>
                <button type="button" class="ticket-card__button" data-ticket-action="dismiss" data-ticket-id="${ticket.id}">Delete</button>
            </div>
        </article>
    `;
}

function formatPriority(priority) {
    return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function formatRelativeTime(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return 'unknown time';

    const diffMs = Date.now() - date.getTime();
    const minutes = Math.max(1, Math.round(diffMs / 60000));
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;

    const weeks = Math.round(days / 7);
    return `${weeks}w ago`;
}

async function persistTicketStatus(id, status) {
    try {
        const response = await fetch(`/api/tickets/${encodeURIComponent(id)}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        return response.json();
    } catch (error) {
        throw error;
    }
}

function handleTicketListClick(event) {
    const actionEl = event.target.closest('[data-ticket-action]');
    if (!actionEl) return;

    const { ticketAction: action, ticketId: id } = actionEl.dataset;
    if (!id) return;

    if (action === 'resolve') {
        markTicketResolved(id);
    } else if (action === 'dismiss') {
        dismissTicket(id);
    }
}

async function markTicketResolved(id) {
    const wasResolved = state.resolvedTicketIds.has(id);
    const nextStatus = wasResolved ? 'open' : 'resolved';

    if (wasResolved) {
        state.resolvedTicketIds.delete(id);
    } else {
        state.resolvedTicketIds.add(id);
    }

    state.gmailTickets = state.gmailTickets.map(ticket =>
        ticket.id === id ? { ...ticket, status: nextStatus } : ticket
    );
    renderTicketSidebar();

    try {
        await persistTicketStatus(id, nextStatus);
    } catch (error) {
        console.error('Failed to persist ticket status', error);
        if (wasResolved) {
            state.resolvedTicketIds.add(id);
            state.gmailTickets = state.gmailTickets.map(ticket =>
                ticket.id === id ? { ...ticket, status: 'resolved' } : ticket
            );
        } else {
            state.resolvedTicketIds.delete(id);
            state.gmailTickets = state.gmailTickets.map(ticket =>
                ticket.id === id ? { ...ticket, status: 'open' } : ticket
            );
        }
        renderTicketSidebar();
    }
}

async function dismissTicket(id) {
    const ticket = state.gmailTickets.find(t => t.id === id);
    if (!ticket) return;

    state.dismissedTicketIds.add(id);
    state.resolvedTicketIds.delete(id);
    state.gmailTickets = state.gmailTickets.filter(t => t.id !== id);
    renderTicketSidebar();

    try {
        await persistTicketStatus(id, 'dismissed');
    } catch (error) {
        console.error('Failed to dismiss ticket', error);
        state.dismissedTicketIds.delete(id);
        // Reinsert ticket and sort by received time
        state.gmailTickets = [...state.gmailTickets, { ...ticket, status: 'open' }]
            .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
        renderTicketSidebar();
    }
}
