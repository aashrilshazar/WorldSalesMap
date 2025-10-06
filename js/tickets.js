// Gmail ticket sidebar rendering
const TICKET_REFRESH_MS = 60_000;

async function initTicketSidebar() {
    const listEl = $('tickets-list');
    if (!listEl) return;

    if (!listEl.dataset.bound) {
        listEl.addEventListener('click', handleTicketListClick);
        listEl.dataset.bound = 'true';
    }

    await loadTicketsFromServer();

    if (!state.ticketRefreshInterval) {
        state.ticketRefreshInterval = setInterval(loadTicketsFromServer, TICKET_REFRESH_MS);
    }
}

async function loadTicketsFromServer() {
    state.ticketError = null;
    state.ticketErrorStatus = null;
    try {
        const response = await fetch('/api/tickets');
        if (!response.ok) {
            const message = await extractErrorMessage(response);
            const error = new Error(message || `Request failed with ${response.status}`);
            error.status = response.status;
            throw error;
        }
        const payload = await response.json();
        state.gmailTickets = Array.isArray(payload.tickets) ? payload.tickets : [];
    } catch (error) {
        console.error('Failed to load tickets:', error);
        state.ticketError = error.message || 'Unable to load Gmail tickets';
        state.ticketErrorStatus = error.status || null;
        state.gmailTickets = state.gmailTickets || [];
    }
    renderTicketSidebar();
}

function handleTicketListClick(event) {
    const actionEl = event.target.closest('[data-ticket-action]');
    if (actionEl) {
        const { ticketAction: action, ticketId: id } = actionEl.dataset;
        if (!id) return;

        if (action === 'resolve') {
            markTicketResolved(id);
        } else if (action === 'reopen') {
            reopenTicket(id);
        }
        return;
    }

    const connectEl = event.target.closest('[data-ticket-connect]');
    if (connectEl) {
        beginGmailAuthorization();
    }
}

async function markTicketResolved(id) {
    await mutateTicketStatus(id, 'resolve');
}

async function reopenTicket(id) {
    await mutateTicketStatus(id, 'reopen');
}

async function mutateTicketStatus(id, action) {
    state.ticketError = null;
    state.ticketErrorStatus = null;
    try {
        const response = await fetch(`/api/tickets/${encodeURIComponent(id)}/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
            const message = await extractErrorMessage(response);
            const error = new Error(message || `Failed to ${action} ticket`);
            error.status = response.status;
            throw error;
        }
        await loadTicketsFromServer();
        return;
    } catch (error) {
        console.error(`Failed to ${action} ticket`, error);
        state.ticketError = error.message || `Unable to ${action} ticket`;
        state.ticketErrorStatus = error.status || null;
    }
    renderTicketSidebar();
}

async function beginGmailAuthorization() {
    try {
        const response = await fetch('/api/auth/google/url');
        if (!response.ok) {
            const message = await extractErrorMessage(response);
            throw new Error(message || 'Failed to generate authorization URL');
        }
        const payload = await response.json();
        if (payload?.url) {
            window.open(payload.url, '_blank', 'noopener');
            setTimeout(loadTicketsFromServer, 5000);
        }
    } catch (error) {
        console.error('Authorization start failed', error);
        state.ticketError = error.message || 'Unable to begin Gmail authorization';
        state.ticketErrorStatus = error.status || null;
        renderTicketSidebar();
    }
}

async function extractErrorMessage(response) {
    const contentType = response.headers.get('content-type') || '';
    const raw = await response.text();
    if (contentType.includes('application/json')) {
        try {
            const data = JSON.parse(raw);
            if (data && typeof data.error === 'string') {
                return data.error;
            }
        } catch (err) {
            console.warn('Failed to parse JSON error response', err);
        }
    }
    return raw;
}

function renderTicketSidebar() {
    const listEl = $('tickets-list');
    const countEl = $('tickets-count');
    if (!listEl || !countEl) return;

    const unresolved = state.gmailTickets.filter(t => t.status !== 'resolved');
    countEl.textContent = unresolved.length ? `${unresolved.length} unresolved` : 'All caught up';

    if (state.ticketError) {
        if (state.ticketErrorStatus === 401) {
            listEl.innerHTML = renderAuthorizationPrompt(state.ticketError);
        } else {
            listEl.innerHTML = `<div class="ticket-error">${state.ticketError}</div>`;
        }
        return;
    }

    if (!state.gmailTickets.length) {
        listEl.innerHTML = '<div class="ticket-empty">No tickets yet. Connect a Gmail inbox to get started.</div>';
        return;
    }

    const ordered = [...state.gmailTickets].sort(sortTicketsForSidebar);
    const cards = ordered.map(renderTicketCard).join('');
    listEl.innerHTML = (unresolved.length ? '' : '<div class="ticket-empty">No active follow-ups right now.</div>') + cards;
}

function renderAuthorizationPrompt(message) {
    const text = message || 'Authorize Gmail to view tickets.';
    return `
        <div class="ticket-connect">
            <div class="ticket-error">${text}</div>
            <button type="button" class="ticket-connect__button" data-ticket-connect="authorize">Connect Gmail Inbox</button>
        </div>
    `;
}

function sortTicketsForSidebar(a, b) {
    if (a.status !== b.status) {
        return a.status === 'open' ? -1 : 1;
    }
    const aTime = new Date(a.receivedAt).getTime();
    const bTime = new Date(b.receivedAt).getTime();
    return bTime - aTime;
}

function renderTicketCard(ticket) {
    const isResolved = ticket.status === 'resolved';
    const priorityClass = ticket.priority ? ` ticket-card__badge--${ticket.priority}` : '';
    const priorityLabel = formatPriorityLabel(ticket.priority);
    const cadenceLabel = ticket.followUpCadenceDays ? `Follow-up every ${ticket.followUpCadenceDays}d` : null;
    const lastMeetingLabel = ticket.lastMeetingDaysAgo != null ? `Last meeting ${ticket.lastMeetingDaysAgo}d` : null;
    const metaType = ticket.type === 'follow_up' ? 'follow-up reminder' : 'new email';

    return `
        <article class="ticket-card${isResolved ? ' ticket-card--resolved' : ''}" data-ticket-id="${ticket.id}">
            <div class="ticket-card__header">
                <div>
                    <div class="ticket-card__firm">${ticket.firmName}</div>
                    <div class="ticket-card__meta">${metaType} • ${formatRelativeTime(ticket.receivedAt)}${ticket.inbox ? ` • ${ticket.inbox}` : ''}</div>
                </div>
                ${priorityLabel ? `<span class="ticket-card__badge${priorityClass}">${priorityLabel}</span>` : ''}
            </div>
            <div class="ticket-card__subject">${ticket.subject}</div>
            <div class="ticket-card__details">
                <span class="ticket-card__tag">@${ticket.firmDomain}</span>
                ${lastMeetingLabel ? `<span class="ticket-card__tag">${lastMeetingLabel}</span>` : ''}
                ${cadenceLabel ? `<span class="ticket-card__tag">${cadenceLabel}</span>` : ''}
            </div>
            <div class="ticket-card__footer">
                <div class="ticket-card__avatars">
                    <span class="ticket-card__avatar" title="${ticket.sender}">${getInitialsFromEmail(ticket.sender)}</span>
                </div>
                <div class="ticket-card__actions">
                    <a class="ticket-card__link" href="${ticket.threadUrl || '#'}" target="_blank" rel="noopener">Open Thread</a>
                    <button type="button" class="ticket-card__action" data-ticket-action="${isResolved ? 'reopen' : 'resolve'}" data-ticket-id="${ticket.id}">
                        ${isResolved ? 'Reopen' : 'Mark Resolved'}
                    </button>
                </div>
            </div>
        </article>
    `;
}

function formatPriorityLabel(priority) {
    if (!priority) return '';
    return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function formatRelativeTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'unknown time';
    const diff = Date.now() - date.getTime();
    const minutes = Math.round(diff / 60000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;

    const weeks = Math.round(days / 7);
    return `${weeks}w ago`;
}

function getInitialsFromEmail(email) {
    if (!email) return '?';
    const handle = email.split('@')[0];
    const parts = handle.split(/[._-]+/).filter(Boolean);
    if (!parts.length) return handle.slice(0, 2).toUpperCase();
    return parts.map(part => part.charAt(0)).join('').slice(0, 2).toUpperCase();
}
