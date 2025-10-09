// Kanban view functionality
function renderKanban() {
    const container = $('kanban-view');
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