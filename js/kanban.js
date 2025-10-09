// Kanban view functionality
function renderKanban() {
    const container = $('kanban-view');
    setupKanbanScrolling(container);
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

function setupKanbanScrolling(container) {
    if (!container || container.dataset.scrollSetup) return;
    container.dataset.scrollSetup = 'true';

    container.addEventListener('wheel', e => {
        if (e.ctrlKey) return;

        const column = e.target.closest('.kanban-column');
        const preferVertical = Math.abs(e.deltaY) > Math.abs(e.deltaX);

        if (preferVertical && column) {
            const canScrollVertically =
                (e.deltaY < 0 && column.scrollTop > 0) ||
                (e.deltaY > 0 && column.scrollTop + column.clientHeight < column.scrollHeight);
            if (canScrollVertically) return;
        }

        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (!delta) return;

        container.scrollLeft += delta;
        e.preventDefault();
    }, { passive: false });

    let pointerId = null;
    let startX = 0;
    let startScroll = 0;

    const stopDragging = () => {
        if (pointerId === null) return;
        if (typeof container.releasePointerCapture === 'function') {
            try {
                container.releasePointerCapture(pointerId);
            } catch (err) {
                // ignore release errors caused by pointer already released
            }
        }
        pointerId = null;
        container.classList.remove('kanban-grabbing');
    };

    container.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        if (e.target.closest('.kanban-card')) return;

        pointerId = e.pointerId;
        startX = e.clientX;
        startScroll = container.scrollLeft;
        container.classList.add('kanban-grabbing');

        if (typeof container.setPointerCapture === 'function') {
            try {
                container.setPointerCapture(pointerId);
            } catch (err) {
                // ignore capture errors on unsupported platforms
            }
        }
    });

    container.addEventListener('pointermove', e => {
        if (pointerId === null || e.pointerId !== pointerId) return;
        const deltaX = e.clientX - startX;
        container.scrollLeft = startScroll - deltaX;
        e.preventDefault();
    });

    container.addEventListener('pointerup', e => {
        if (pointerId === null || e.pointerId !== pointerId) return;
        stopDragging();
    });

    container.addEventListener('pointercancel', stopDragging);
    container.addEventListener('pointerleave', e => {
        if (pointerId === null || e.pointerId !== pointerId) return;
        stopDragging();
    });
}
