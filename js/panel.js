// Firm panel functionality
function openFirmPanel(firm) {
    state.currentFirm = firm;
    $('firm-panel').classList.add('open');
    
    // Update header
    $('panel-firm-name').textContent = firm.name;
    const locationEl = $('panel-firm-location');
    if (locationEl) {
        if (firm.hqLocation) {
            const countryCode = CONFIG.CITY_TO_COUNTRY[firm.hqLocation];
            let locationLabel = firm.hqLocation;
            if (countryCode) {
                try {
                    const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
                    const countryName = regionNames.of(countryCode);
                    locationLabel = countryName
                        ? `${firm.hqLocation}, ${countryName}`
                        : `${firm.hqLocation}, ${countryCode}`;
                } catch (e) {
                    locationLabel = `${firm.hqLocation}, ${countryCode}`;
                }
            }
            locationEl.textContent = locationLabel;
        } else {
            locationEl.textContent = 'Location unavailable';
        }
    }
    $('panel-firm-aum').textContent = `$${firm.aum.toFixed(1)}B AUM`;
    
    // Update stage
    const stage = normalizeStage(firm.stage);
    const stageEl = $('panel-stage');
    stageEl.textContent = `${stage}. ${getStageName(stage)}`;
    stageEl.className = `stage-indicator stage-${stage}`;
    
    // Update progress bar
    const progress = CONFIG.STAGE_NAMES.length > 1 
        ? ((stage - 1) / (CONFIG.STAGE_NAMES.length - 1)) * 100 
        : 100;
    $('progress-fill').style.width = `${progress}%`;
    const stageColor = getStageColor(stage);
    document.querySelectorAll('.progress-stage').forEach(el => {
        const tileStage = parseInt(el.dataset.stage, 10);
        if (tileStage === stage) {
            el.classList.add('active');
            el.style.background = stageColor;
            el.style.color = '#0f172a';
        } else {
            el.classList.remove('active');
            el.style.background = 'rgba(30,41,59,0.55)';
            el.style.color = '#94a3b8';
        }
    });
    
    // Update people
    renderPeople(firm);
}

function closeFirmPanel() {
    $('firm-panel').classList.remove('open');
    state.currentFirm = null;
}

function renderPeople(firm) {
    const peopleGrid = $('people-grid');
    const roleGroups = {};
    
    // Group people by role
    (firm.people || []).forEach(p => {
        const role = p.role || 'Other';
        if (!roleGroups[role]) roleGroups[role] = [];
        roleGroups[role].push(p);
    });
    
    // Render role groups
    peopleGrid.innerHTML = Object.entries(roleGroups)
        .map(([role, people]) => {
            if (people.length === 0) return '';
            
            return `
                <div class="role-group">
                    <div class="role-title">${role}</div>
                    ${people.map(p => {
                        const lastContact = p.lastContact
                            ? `${Math.floor((Date.now() - new Date(p.lastContact)) / (24 * 60 * 60 * 1000))}d ago`
                            : 'No contact';
                        
                        return `
                            <div class="person-bubble">
                                <div class="person-name">${p.name}</div>
                                <div class="person-title">${p.title || role}</div>
                                <div class="last-contact">${lastContact}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        })
        .join('');
}

function addPerson() {
    if (!state.currentFirm) return;
    
    const name = prompt('Enter person name:');
    if (!name) return;
    
    const role = prompt('Enter role (GP/MD/Principal/VP/Associate/Other):') || 'Other';
    
    if (!state.currentFirm.people) state.currentFirm.people = [];
    
    state.currentFirm.people.push({
        id: 'person_' + Date.now(),
        name,
        role,
        title: role,
        lastContact: new Date().toISOString()
    });
    
    persistFirms('user');
    openFirmPanel(state.currentFirm);
}

function saveFirm(formData) {
    const newFirm = withBasePosition({
        id: 'firm_' + Date.now(),
        name: formData.name,
        aum: parseFloat(formData.aum),
        stage: normalizeStage(formData.stage),
        peopleCount: parseInt(formData.peopleCount) || 0,
        people: [],
        hqLocation: formData.location || null
    });
    
    state.firms.push(newFirm);
    persistFirms('user');
    updateMapBubbles();
    
    return newFirm;
}
