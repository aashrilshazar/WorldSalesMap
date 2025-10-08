// Data loading and persistence functions
function loadData() {
    try {
        const stored = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || [];
        const source = localStorage.getItem(CONFIG.SOURCE_KEY);
        
        // Load from pe-firms-data.js
        const dataset = (window.PE_FIRMS_DATA || []).map((f, i) => withBasePosition({
            ...f,
            id: f.id || `firm_dataset_${i}`,
            name: f.name || `Firm ${i + 1}`,
            aum: f.aum ?? (f.aum_m ? f.aum_m / 1000 : 1),
            stage: normalizeStage(f.stage),
            peopleCount: f.peopleCount ?? (f.people?.length || 0),
            people: f.people || [],
            hqLocation: f.hqLocation || null
        }));

        // Prefer dataset over stored data, or use stored if dataset is empty
        if (dataset.length > 0) {
            state.firms = dataset;
            state.mapBubbleLayoutDirty = true;
            persistFirms('dataset');
        } else if (stored.length > 0) {
            state.firms = stored.map(withBasePosition);
            state.mapBubbleLayoutDirty = true;
        } else {
            // No data available
            state.firms = [];
            state.mapBubbleLayoutDirty = true;
            console.warn('No firms data available');
        }
    } catch (e) {
        console.error('Error loading data:', e);
        state.firms = [];
        state.mapBubbleLayoutDirty = true;
    }
}

function persistFirms(source) {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state.firms));
    if (source) localStorage.setItem(CONFIG.SOURCE_KEY, source);
}

function exportData() {
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + 
             encodeURIComponent(JSON.stringify(state.firms, null, 2));
    a.download = `pe_firms_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = e => {
        const reader = new FileReader();
        reader.onload = evt => {
            try {
                state.firms = JSON.parse(evt.target.result).map(withBasePosition);
                state.mapBubbleLayoutDirty = true;
                persistFirms('user');
                updateMapBubbles();
                if (state.viewMode === 'kanban') {
                    renderKanban();
                }
                alert('Data imported successfully!');
            } catch (err) {
                alert('Error importing data: ' + err.message);
            }
        };
        reader.readAsText(e.target.files[0]);
    };
    input.click();
}
