// Placeholder Gmail ticket sidebar
function initTicketSidebar() {
    const listEl = $('tickets-list');
    const countEl = $('tickets-count');
    if (!listEl || !countEl) return;

    countEl.textContent = '0 unresolved';
    listEl.innerHTML = renderPlaceholder();
}

function renderPlaceholder() {
    return `
        <div class="ticket-empty">
            Gmail ticket ingestion is not configured yet.<br>
            Connect service inboxes once the workspace setup is ready.
        </div>
    `;
}
