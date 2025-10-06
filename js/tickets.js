// Gmail ticket sidebar rendering
function initTicketSidebar() {
    const listEl = $('tickets-list');
    if (!listEl) return;

    if (!listEl.dataset.bound) {
        listEl.addEventListener('click', handleTicketListClick);
        listEl.dataset.bound = 'true';
    }

    state.gmailTickets = createMockTickets();
    renderTicketSidebar();

    if (!state.ticketRefreshInterval) {
        state.ticketRefreshInterval = setInterval(renderTicketSidebar, 60000);
    }
}

function createMockTickets() {
    const now = Date.now();
    return [
        {
            id: 'ticket-1',
            firmName: 'Atlas Equity Partners',
            firmDomain: 'atlaspartners.com',
            inbox: 'deals@atlasequity.com',
            sender: 'amanda.lee@atlaspartners.com',
            subject: 'Follow-up on data room access',
            receivedAt: new Date(now - 45 * 60 * 1000).toISOString(),
            status: 'open',
            priority: 'high',
            type: 'new_email',
            lastMeetingDaysAgo: 12,
            followUpCadenceDays: 7,
            threadUrl: '#'
        },
        {
            id: 'ticket-2',
            firmName: 'Northwind Capital',
            firmDomain: 'northwindcap.com',
            inbox: 'intro@northwindcap.com',
            sender: 'marcus@northwindcap.com',
            subject: 'Agenda for Thursday sync',
            receivedAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
            status: 'open',
            priority: 'medium',
            type: 'new_email',
            lastMeetingDaysAgo: 4,
            followUpCadenceDays: 14,
            threadUrl: '#'
        },
        {
            id: 'ticket-3',
            firmName: 'Summit Ridge Advisors',
            firmDomain: 'summitridge.com',
            inbox: 'team@summitridge.com',
            sender: 'jen.cooper@summitridge.com',
            subject: 'Next steps after diligence session',
            receivedAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'open',
            priority: 'low',
            type: 'follow_up',
            lastMeetingDaysAgo: 16,
            followUpCadenceDays: 14,
            threadUrl: '#'
        },
        {
            id: 'ticket-4',
            firmName: 'Harborlight Partners',
            firmDomain: 'harborlight.io',
            inbox: 'hello@harborlight.io',
            sender: 'cecilia@harborlight.io',
            subject: 'Shared portfolio metrics',
            receivedAt: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
            status: 'resolved',
            priority: 'medium',
            type: 'new_email',
            lastMeetingDaysAgo: 2,
            followUpCadenceDays: 10,
            threadUrl: '#'
        }
    ];
}

function handleTicketListClick(event) {
    const actionEl = event.target.closest('[data-ticket-action]');
    if (!actionEl) return;

    const { ticketAction: action, ticketId: id } = actionEl.dataset;
    if (!id) return;

    if (action === 'resolve') {
        markTicketResolved(id);
    } else if (action === 'reopen') {
        reopenTicket(id);
    }
}

function markTicketResolved(id) {
    const ticket = state.gmailTickets.find(t => t.id === id);
    if (!ticket || ticket.status === 'resolved') return;
    ticket.status = 'resolved';
    ticket.resolvedAt = new Date().toISOString();
    renderTicketSidebar();
}

function reopenTicket(id) {
    const ticket = state.gmailTickets.find(t => t.id === id);
    if (!ticket || ticket.status !== 'resolved') return;
    ticket.status = 'open';
    delete ticket.resolvedAt;
    renderTicketSidebar();
}

function renderTicketSidebar() {
    const listEl = $('tickets-list');
    const countEl = $('tickets-count');
    if (!listEl || !countEl) return;

    const unresolved = state.gmailTickets.filter(t => t.status !== 'resolved');
    countEl.textContent = unresolved.length ? `${unresolved.length} unresolved` : 'All caught up';

    if (!state.gmailTickets.length) {
        listEl.innerHTML = '<div class="ticket-empty">No tickets yet. Connect a Gmail inbox to get started.</div>';
        return;
    }

    const ordered = [...state.gmailTickets].sort(sortTicketsForSidebar);
    const cards = ordered.map(renderTicketCard).join('');
    listEl.innerHTML = (unresolved.length ? '' : '<div class="ticket-empty">No active follow-ups right now.</div>') + cards;
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
