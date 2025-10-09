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
    if (!container || container._kanbanScrollSetup) return;
    container._kanbanScrollSetup = true;

    container.addEventListener('wheel', event => {
        if (event.ctrlKey) return;
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        container.scrollLeft += event.deltaY;
        event.preventDefault();
    }, { passive: false });

    let isDragging = false;
    let dragStartX = 0;
    let dragStartScroll = 0;

    const stopDrag = pointerId => {
        if (!isDragging) return;
        isDragging = false;
        if (typeof container.releasePointerCapture === 'function' && pointerId !== undefined) {
            try {
                container.releasePointerCapture(pointerId);
            } catch (err) {
                // ignore
            }
        }
        container.classList.remove('kanban-grabbing');
    };

    container.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        if (event.target.closest('.kanban-card')) return;
        isDragging = true;
        dragStartX = event.clientX;
        dragStartScroll = container.scrollLeft;
        container.classList.add('kanban-grabbing');
        if (typeof container.setPointerCapture === 'function') {
            try {
                container.setPointerCapture(event.pointerId);
            } catch (err) {
                // ignore
            }
        }
    });

    container.addEventListener('pointermove', event => {
        if (!isDragging) return;
        const delta = event.clientX - dragStartX;
        container.scrollLeft = dragStartScroll - delta;
    });

    container.addEventListener('pointerup', event => stopDrag(event.pointerId));
    container.addEventListener('pointercancel', event => stopDrag(event.pointerId));
    container.addEventListener('pointerleave', () => stopDrag());
}
