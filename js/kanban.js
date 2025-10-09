// Kanban view functionality
function renderKanban() {
    const container = $('kanban-view');
    enableKanbanHorizontalScroll(container);
    container.innerHTML = CONFIG.STAGE_NAMES.map((name, i) => {
        const firms = state.firms.filter(f => f.stage === i + 1);
        return `
            <div class="kanban-column" data-stage="${i + 1}">
                <div class="kanban-header stage-${i + 1}">${i + 1}. ${name}</div>
                ${firms.map(f => `
                    <div class="kanban-card" draggable="true" data-firm-id="${f.id}">
                        <div class="kanban-card-name">${f.name}</div>
                        <div class="kanban-card-aum">$${f.aum.toFixed(1)}B AUM</div>
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');
    
    // Add event listeners to cards
    container.querySelectorAll('.kanban-card').forEach(card => {
        card.onclick = () => {
            const firm = state.firms.find(f => f.id === card.dataset.firmId);
            if (firm) openFirmPanel(firm);
        };
        
        card.ondragstart = e => {
            e.dataTransfer.setData('firmId', card.dataset.firmId);
        };
    });
    
    // Add drop zones
    container.querySelectorAll('.kanban-column').forEach(col => {
        col.ondragover = e => e.preventDefault();
        
        col.ondrop = e => {
            e.preventDefault();
            const firmId = e.dataTransfer.getData('firmId');
            const firm = state.firms.find(f => f.id === firmId);
            
            if (firm) {
                firm.stage = normalizeStage(col.dataset.stage);
                persistFirms();
                renderKanban();
                updateMapBubbles();
                
                if (state.currentFirm?.id === firm.id) {
                    openFirmPanel(firm);
                }
            }
        };
    });
}

function enableKanbanHorizontalScroll(container) {
    if (!container || container.dataset.kanbanScroll === 'true') return;
    container.dataset.kanbanScroll = 'true';
    container._kanbanScrollRemainder = 0;

    container.addEventListener('wheel', event => {
        if (event.ctrlKey) return; // allow pinch-to-zoom gestures

        const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
        const column = event.target.closest('.kanban-column');

        if (!horizontal && column) {
            const { scrollTop, scrollHeight, clientHeight } = column;
            const canScrollVertically =
                (event.deltaY < 0 && scrollTop > 0) ||
                (event.deltaY > 0 && scrollTop + clientHeight < scrollHeight);
            if (canScrollVertically) return;
        }

        if (horizontal && event.deltaX !== 0) {
            // Let native horizontal scrolling handle the gesture
            return;
        }

        const delta = horizontal ? event.deltaX : event.deltaY;
        if (!delta) return;

        container._kanbanScrollRemainder = (container._kanbanScrollRemainder || 0) + delta;
        const scrollAmount = container._kanbanScrollRemainder > 0
            ? Math.floor(container._kanbanScrollRemainder)
            : Math.ceil(container._kanbanScrollRemainder);

        if (scrollAmount !== 0) {
            container.scrollLeft += scrollAmount;
            container._kanbanScrollRemainder -= scrollAmount;
        }

        event.preventDefault();
    }, { passive: false });
}
