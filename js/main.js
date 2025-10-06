// Main initialization and view management
function setView(mode) {
    state.viewMode = mode;
    const sidebar = $('ticket-sidebar');
    if (sidebar) {
        sidebar.classList.toggle('hidden', mode === 'kanban');
    }
    
    // Hide all views
    document.querySelectorAll('.view-container')
        .forEach(v => v.classList.remove('active'));
    document.querySelectorAll('#view-map, #view-scatter, #view-kanban')
        .forEach(b => b.classList.remove('active'));
    document.querySelectorAll('[data-sort]')
        .forEach(b => b.style.display = 'none');

    if (typeof updateNewsBarForView === 'function') {
        updateNewsBarForView(mode);
    }

    // Show selected view
    switch(mode) {
        case 'map':
            $('map-container').classList.add('active');
            $('view-map').classList.add('active');
            stopAnimation();
            if (typeof renderGlobe === 'function') {
                renderGlobe();
            } else {
                updateMapBubbles();
            }
            break;
            
        case 'scatter':
            $('canvas-container').classList.add('active');
            $('view-scatter').classList.add('active');
            document.querySelectorAll('[data-sort]')
                .forEach(b => b.style.display = 'inline-block');
            resizeCanvas();
            startAnimation();
            break;
            
        case 'kanban':
            $('kanban-view').classList.add('active');
            $('view-kanban').classList.add('active');
            stopAnimation();
            renderKanban();
            break;
    }
}

function populateDropdowns() {
    // Populate location dropdown
    $('form-location').innerHTML = 
        '<option value="">Select Location</option>' +
        Object.keys(CONFIG.CITY_COORDS)
            .map(c => `<option value="${c}">${c}</option>`)
            .join('');
    
    // Populate stage dropdown
    $('form-stage').innerHTML = 
        CONFIG.STAGE_NAMES.map((n, i) =>
            `<option value="${i + 1}">${i + 1} - ${n}</option>`
        ).join('');
    
    // Populate progress stages
    $('progress-stages').innerHTML = 
        CONFIG.STAGE_NAMES.map((n, i) => 
            `<span class="progress-stage" data-stage="${i + 1}"><strong>${i + 1}</strong> ${n}</span>`
        ).join('');
}

async function init() {
    // Initialize dropdowns
    populateDropdowns();

    // Load data
    loadData();

    if (typeof initNewsBar === 'function') {
        initNewsBar();
    }

    // Initialize Gmail tickets sidebar
    initTicketSidebar();
    
    // Setup canvas
    setupCanvas();
    
    // Initialize map
    await initMap();
    
    // Setup event listeners
    setupEventListeners();
    
    // Set initial view
    setView('map');
}

// Start the application
document.addEventListener('DOMContentLoaded', init);
