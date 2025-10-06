// Event handlers
function setupEventListeners() {
    // Canvas mouse events
    setupCanvasEvents();
    
    // Search
    $('search-input').oninput = handleSearch;
    $('search-input').onkeydown = handleSearchKeydown;
    $('search-input').onfocus = e => updateSearchResults(e.target.value);
    const resultsEl = $('search-results');
    if (resultsEl) {
        resultsEl.onclick = handleSearchResultClick;
        resultsEl.onkeydown = handleSearchResultKeydown;
    }
    document.addEventListener('click', handleDocumentClick);
    
    // View buttons
    $('view-map').onclick = () => setView('map');
    $('view-scatter').onclick = () => setView('scatter');
    $('view-kanban').onclick = () => setView('kanban');
    
    // Sort buttons
    document.querySelectorAll('[data-sort]').forEach(btn => {
        btn.onclick = () => sortBy(btn.dataset.sort);
    });
    
    // Data buttons
    $('add-firm').onclick = () => {
        $('data-modal').classList.add('open');
        $('firm-form').reset();
    };
    
    $('export-data').onclick = exportData;
    $('import-data').onclick = importData;
    
    // Form
    $('firm-form').onsubmit = e => {
        e.preventDefault();
        const formData = {
            name: $('form-name').value,
            aum: $('form-aum').value,
            stage: $('form-stage').value,
            peopleCount: $('form-people-count').value,
            location: $('form-location').value
        };
        
        saveFirm(formData);
        $('data-modal').classList.remove('open');
    };
    
    // Modal controls
    $('cancel-modal').onclick = () => $('data-modal').classList.remove('open');
    $('close-panel').onclick = closeFirmPanel;
    $('add-person').onclick = addPerson;
    
    // Window resize
    window.onresize = handleResize;
}

function setupCanvasEvents() {
    const canvas = state.canvas;
    
    canvas.onmousedown = e => {
        if (state.viewMode !== 'scatter') return;
        state.isDragging = true;
        state.dragStart = {
            x: e.clientX - state.camera.x,
            y: e.clientY - state.camera.y
        };
        canvas.style.cursor = 'grabbing';
    };
    
    canvas.onmousemove = e => {
        if (state.viewMode !== 'scatter') return;
        
        if (state.isDragging) {
            state.camera.x = e.clientX - state.dragStart.x;
            state.camera.y = e.clientY - state.dragStart.y;
        } else {
            handleHover(e);
        }
    };
    
    canvas.onmouseup = () => {
        state.isDragging = false;
        canvas.style.cursor = 'grab';
    };
    
    canvas.onwheel = e => {
        if (state.viewMode !== 'scatter') return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        state.camera.zoom = Math.max(0.1, Math.min(3, state.camera.zoom * delta));
    };
    
    canvas.onclick = () => {
        if (state.hoveredFirm) openFirmPanel(state.hoveredFirm);
    };
}

function handleHover(e) {
    const rect = state.canvas.getBoundingClientRect();
    const { canvas, camera } = state;
    
    const x = (e.clientX - rect.left - canvas.width / 2) / camera.zoom 
             + canvas.width / 2 - camera.x;
    const y = (e.clientY - rect.top - canvas.height / 2) / camera.zoom 
             + canvas.height / 2 - camera.y;
    
    state.hoveredFirm = null;
    for (const firm of state.firms) {
        const dx = x - firm.x;
        const dy = y - firm.y;
        if (Math.sqrt(dx * dx + dy * dy) < Math.sqrt(firm.aum) * 5) {
            state.hoveredFirm = firm;
            canvas.style.cursor = 'pointer';
            break;
        }
    }
    
    if (!state.hoveredFirm) {
        canvas.style.cursor = 'grab';
    }
}

function clearSearchResults() {
    const container = $('search-results');
    if (!container) return;
    container.innerHTML = '';
    container.classList.remove('visible');
    state.searchMatches = [];
}

function updateSearchResults(rawQuery) {
    const container = $('search-results');
    if (!container) return;
    const query = (rawQuery || '').trim().toLowerCase();

    if (!query) {
        clearSearchResults();
        return;
    }

    const matches = state.firms
        .filter(f => f.name && f.name.toLowerCase().startsWith(query))
        .sort((a, b) => a.name.localeCompare(b.name));

    state.searchMatches = matches;

    if (!matches.length) {
        clearSearchResults();
        return;
    }

    container.innerHTML = matches
        .map(f => `<div class="search-result-item" data-firm-id="${f.id}" tabindex="0">${f.name}</div>`)
        .join('');
    container.classList.add('visible');
}

function applySearchSelection(firm) {
    if (!firm) return;

    const input = $('search-input');
    if (input) {
        input.value = firm.name;
    }

    clearSearchResults();

    if (state.viewMode === 'scatter') {
        animateToFirm(firm);
        return;
    }

    if (state.viewMode === 'map') {
        if (firm.hqLocation) {
            if (typeof focusFirmOnMap === 'function') {
                focusFirmOnMap(firm);
            } else if (typeof zoomToLocation === 'function') {
                zoomToLocation(firm);
            }
        } else if (typeof openFirmPanel === 'function') {
            openFirmPanel(firm);
        }
    }
}

function handleSearch(e) {
    const value = e.target.value || '';
    updateSearchResults(value);

    const query = value.trim().toLowerCase();
    if (!query) return;

    const exactMatch = state.firms.find(f => f.name && f.name.toLowerCase() === query);
    if (!exactMatch) return;

    applySearchSelection(exactMatch);
}

function animateToFirm(firm) {
    const targetX = -firm.x + state.canvas.width / 2;
    const targetY = -firm.y + state.canvas.height / 2;
    const steps = 30;
    let step = 0;
    
    const startX = state.camera.x;
    const startY = state.camera.y;
    const startZoom = state.camera.zoom;
    
    function animateTo() {
        step++;
        const eased = 1 - Math.pow(1 - step / steps, 3);
        state.camera.x = startX + (targetX - startX) * eased;
        state.camera.y = startY + (targetY - startY) * eased;
        state.camera.zoom = startZoom + (1.5 - startZoom) * eased;
        
        if (step < steps) requestAnimationFrame(animateTo);
    }
    
    animateTo();
    state.hoveredFirm = firm;
}

function handleSearchResultClick(e) {
    const item = e.target.closest('.search-result-item');
    if (!item) return;
    const firm = state.firms.find(f => f.id === item.dataset.firmId);
    if (!firm) return;
    applySearchSelection(firm);
    e.stopPropagation();
}

function handleSearchResultKeydown(e) {
    if (e.key !== 'Enter') return;
    const item = e.target.closest('.search-result-item');
    if (!item) return;
    const firm = state.firms.find(f => f.id === item.dataset.firmId);
    if (!firm) return;
    e.preventDefault();
    applySearchSelection(firm);
}

function handleSearchKeydown(e) {
    if (e.key === 'Enter') {
        const [firstMatch] = state.searchMatches || [];
        if (firstMatch) {
            e.preventDefault();
            applySearchSelection(firstMatch);
        }
    } else if (e.key === 'Escape') {
        clearSearchResults();
    }
}

function handleDocumentClick(e) {
    const searchBox = $('search-box');
    if (searchBox && searchBox.contains(e.target)) return;
    clearSearchResults();
}

function handleResize() {
    if (state.viewMode === 'scatter') {
        resizeCanvas();
    }
    
    if (state.viewMode === 'map') {
        if (typeof resizeGlobe === 'function') {
            resizeGlobe();
        }
    }
}
