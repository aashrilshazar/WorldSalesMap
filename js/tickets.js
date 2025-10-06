const TICKETS_ENDPOINT = '/api/tickets';
const TICKET_REFRESH_MS = 60_000;

async function initTicketSidebar() {
    const listEl = $('tickets-list');
    const countEl = $('tickets-count');
    if (!listEl || !countEl) return;

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
        state.gmailTickets = Array.isArray(data.tickets) ? data.tickets : [];
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
    return `
        <article class="ticket-card" data-ticket-id="${ticket.id}">
            <div class="ticket-card__header">
                <div>
                    <div class="ticket-card__firm">${ticket.firmName || 'Unknown Firm'}</div>
                    <div class="ticket-card__meta">${formatRelativeTime(ticket.receivedAt)} • ${ticket.sender || 'unknown sender'}</div>
                </div>
                ${ticket.priority ? `<span class="ticket-card__badge ticket-card__badge--${ticket.priority}">${formatPriority(ticket.priority)}</span>` : ''}
            </div>
            <div class="ticket-card__subject">${ticket.subject || '(no subject)'}</div>
            <div class="ticket-card__details">
                ${ticket.firmDomain ? `<span class="ticket-card__tag">@${ticket.firmDomain}</span>` : ''}
                ${ticket.inbox ? `<span class="ticket-card__tag">${ticket.inbox}</span>` : ''}
            </div>
            <div class="ticket-card__footer">
                <a class="ticket-card__link" href="${ticket.threadUrl || '#'}" target="_blank" rel="noopener">Open in Gmail</a>
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
