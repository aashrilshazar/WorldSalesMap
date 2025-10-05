// Event handlers
function setupEventListeners() {
    // Canvas mouse events
    setupCanvasEvents();
    
    // Search
    $('search-input').oninput = handleSearch;
    
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

function handleSearch(e) {
    const query = e.target.value.toLowerCase();
    if (query.length < 2) return;
    
    const found = state.firms.find(f => 
        f.name.toLowerCase().includes(query)
    );
    
    if (!found) return;
    
    if (state.viewMode === 'scatter') {
        animateToFirm(found);
    } else if (state.viewMode === 'map' && found.hqLocation) {
        zoomToLocation(found);
    }
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

function zoomToLocation(firm) {
    if (!CONFIG.CITY_COORDS[firm.hqLocation]) return;
    
    const coords = CONFIG.CITY_COORDS[firm.hqLocation];
    const [x, y] = state.mapProjection([coords[1], coords[0]]);
    
    state.mapSvg.transition()
        .duration(750)
        .call(
            state.mapZoom.transform,
            d3.zoomIdentity
                .translate(window.innerWidth / 2, window.innerHeight / 2)
                .scale(4)
                .translate(-x, -y)
        );
}

function handleResize() {
    if (state.viewMode === 'scatter') {
        resizeCanvas();
    }
    
    if (state.viewMode === 'map' && state.mapProjection) {
        const container = $('map-container');
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        state.mapProjection
            .scale((width / 2 / Math.PI) * 0.8)
            .translate([width / 2, height / 1.8]);
        
        const path = d3.geoPath().projection(state.mapProjection);
        if (state.mapCountries) {
            state.mapCountries.selectAll('.map-country').attr('d', path);
        }
        if (state.mapStates) {
            state.mapStates.selectAll('.map-state').attr('d', path);
        }
        
        if (typeof computeMapBounds === 'function') {
            state.mapBounds = computeMapBounds(path);
        }
        
        if (state.mapZoom && state.mapSvg && state.mapBounds) {
            state.mapZoom
                .translateExtent(state.mapBounds)
                .extent([[0, 0], [width, height]]);
            const currentTransform = d3.zoomTransform(state.mapSvg.node());
            state.mapSvg.call(state.mapZoom.transform, currentTransform);
        }
        
        updateMapBubbles();
    }
}
