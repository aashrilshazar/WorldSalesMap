// Globe-based map view functionality
const MAP_BUBBLE_MIN_RADIUS = 2;
const MAP_BUBBLE_FACTOR = 0.3;
const MAP_BUBBLE_HOVER_FACTOR = 0.45;
const MAP_CITY_BASE_RADIUS = 1.6;
const MAP_CITY_MIN_RADIUS = 0.5;
const MAP_BOUNDARY_PADDING = 20;
const ROTATION_SENSITIVITY = 0.25;
const ROTATION_LAT_CLAMP = 75;
const WORLD_SPHERE = { type: 'Sphere' };
const US_FOCUS_LON_RANGE = [-170, -50];
const US_FOCUS_LAT_RANGE = [15, 75];
const COUNTY_DISPLAY_ZOOM = 1.5;

let pathGenerator = null;
let graticule = null;
let countryFeatures = [];
let stateFeatures = [];
let countyFeatures = [];

let renderScheduled = false;
let forceStaticRender = false;

function isCoordinateVisible(lon, lat) {
    const centerLon = -state.mapRotation.lambda;
    const centerLat = -state.mapRotation.phi;
    const distance = d3.geoDistance([lon, lat], [centerLon, centerLat]);
    return distance <= Math.PI / 2 + 1e-6;
}

function isUSVisible() {
    const centerLon = ((-state.mapRotation.lambda % 360) + 540) % 360 - 180;
    const centerLat = -state.mapRotation.phi;
    return centerLon >= US_FOCUS_LON_RANGE[0] && centerLon <= US_FOCUS_LON_RANGE[1] &&
           centerLat >= US_FOCUS_LAT_RANGE[0] && centerLat <= US_FOCUS_LAT_RANGE[1];
}

function computeMapBounds(path) {
    const bounds = path.bounds(WORLD_SPHERE);
    if (!bounds || !Array.isArray(bounds[0]) || !Array.isArray(bounds[1])) {
        return [[-Infinity, -Infinity], [Infinity, Infinity]];
    }
    const [[x0, y0], [x1, y1]] = bounds;
    return [
        [x0 - MAP_BOUNDARY_PADDING, y0 - MAP_BOUNDARY_PADDING],
        [x1 + MAP_BOUNDARY_PADDING, y1 + MAP_BOUNDARY_PADDING]
    ];
}

function updateProjection() {
    if (!state.mapProjection) return;
    state.mapRotation.lambda = ((state.mapRotation.lambda + 180) % 360 + 360) % 360 - 180;
    state.mapRotation.phi = Math.max(-ROTATION_LAT_CLAMP, Math.min(ROTATION_LAT_CLAMP, state.mapRotation.phi));
    const { width, height } = state.mapDimensions;
    state.mapProjection
        .translate([width / 2, height / 2])
        .scale(state.mapScale)
        .rotate([state.mapRotation.lambda, state.mapRotation.phi]);
    if (pathGenerator) {
        pathGenerator.projection(state.mapProjection);
    }
}

function renderCountries(fillByStage = true) {
    if (!state.mapCountries) return;
    const countryStages = {};
    if (fillByStage && state.firms.length) {
        state.firms.forEach(firm => {
            const country = CONFIG.CITY_TO_COUNTRY[firm.hqLocation];
            if (!country) return;
            if (!countryStages[country]) countryStages[country] = { total: 0, count: 0 };
            countryStages[country].total += firm.stage;
            countryStages[country].count += 1;
        });
    }

    state.mapCountries.selectAll('path')
        .attr('d', pathGenerator)
        .attr('fill', d => {
            if (!fillByStage) return 'rgba(30,41,59,0.5)';
            const country = CONFIG.COUNTRY_IDS[d.id];
            if (country && countryStages[country]) {
                const average = countryStages[country].total / countryStages[country].count;
                return `${getStageColor(Math.round(average))}40`;
            }
            return 'rgba(30,41,59,0.55)';
        });
}

function renderStates() {
    if (!state.mapStates) return;
    state.mapStates.selectAll('path')
        .attr('d', pathGenerator)
        .style('opacity', 1);
}

function drawStaticLayers(force = false) {
    const shouldShowCounties = isUSVisible() && state.mapZoomTransform?.k >= COUNTY_DISPLAY_ZOOM;
    const last = state.lastStaticRender;
    const lambdaDiff = last.lambda === null ? Infinity : Math.abs(state.mapRotation.lambda - last.lambda);
    const phiDiff = last.phi === null ? Infinity : Math.abs(state.mapRotation.phi - last.phi);
    const scaleDiff = last.scale === null ? Infinity : Math.abs(state.mapScale - last.scale);
    const countiesChanged = last.countiesVisible === null || last.countiesVisible !== shouldShowCounties;
    const needsUpdate = force || lambdaDiff > 0.5 || phiDiff > 0.5 || (last.scale === null ? true : scaleDiff / Math.max(1, last.scale) > 0.05) || countiesChanged;

    if (needsUpdate) {
        renderSphere();
        renderGraticule();
        renderStates();
        renderCountries();
        state.mapCounties
            .style('pointer-events', 'none')
            .style('opacity', shouldShowCounties ? 0.6 : 0)
            .selectAll('path')
            .attr('d', pathGenerator);

        state.lastStaticRender = {
            lambda: state.mapRotation.lambda,
            phi: state.mapRotation.phi,
            scale: state.mapScale,
            countiesVisible: shouldShowCounties
        };
    } else {
        state.mapCounties.style('opacity', shouldShowCounties ? 0.6 : 0);
    }
}

function renderGraticule() {
    if (!state.mapGraticule || !graticule) return;
    state.mapGraticule.attr('d', pathGenerator(graticule));
}

function renderSphere() {
    if (!state.mapSphere) return;
    state.mapSphere.attr('d', pathGenerator(WORLD_SPHERE));
}

function updateMapBubbles() {
    if (!state.mapBubblesGroup || !state.mapProjection) return;

    const geocoded = state.firms.filter(f => f.hqLocation && CONFIG.CITY_COORDS[f.hqLocation]);

    const locationGroups = new Map();
    geocoded.forEach(f => {
        const coords = CONFIG.CITY_COORDS[f.hqLocation];
        if (!coords) return;
        const key = `${coords[0]}_${coords[1]}`;
        if (!locationGroups.has(key)) {
            locationGroups.set(key, { coords, firms: [] });
        }
        locationGroups.get(key).firms.push(f);
    });

    const projected = [];
    const sizeRatio = 2;

    const zoomLevel = state.mapZoomTransform?.k || 1;
    const maxZoom = state.mapZoom?.scaleExtent()[1] || 240;
    const zoomRatio = maxZoom > 1 ? Math.min(1, Math.max(0, (zoomLevel - 1) / (maxZoom - 1))) : 0;
    const sizeScale = 1 + zoomRatio * 2; // up to 3x at max zoom

    locationGroups.forEach(({ coords, firms }) => {
        const [lat, lon] = coords;
        if (!isCoordinateVisible(lon, lat)) return;
        const basePoint = state.mapProjection([lon, lat]);
        if (!basePoint) return;

        const sorted = [...firms].sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0));
        const rawBaseRadius = Math.sqrt(sorted[0].aum || 1) * MAP_BUBBLE_FACTOR;
        const baseRadius = Math.max(
            MAP_BUBBLE_MIN_RADIUS,
            rawBaseRadius * sizeScale
        );
        const angleStep = sorted.length > 1 ? (Math.PI * 2) / sorted.length : 0;

        sorted.forEach((firm, index) => {
            const ratioRadius = baseRadius / Math.pow(sizeRatio, index);
            const radius = Math.max(MAP_BUBBLE_MIN_RADIUS, ratioRadius);
            let x = basePoint[0];
            let y = basePoint[1];
            if (index > 0) {
                const angle = angleStep * index;
                const offset = baseRadius * 0.9 + radius;
                x += Math.cos(angle) * offset;
                y += Math.sin(angle) * offset;
            }
            projected.push({
                ...firm,
                projected: [x, y],
                radius,
                labelBaseRadius: baseRadius
            });
        });
    });

    const groups = state.mapBubblesGroup.selectAll('.map-bubble-group')
        .data(projected, d => d.id);

    const groupsEnter = groups.enter().append('g')
        .attr('class', 'map-bubble-group');

    groupsEnter.append('circle')
        .attr('class', 'map-bubble');

    groupsEnter.append('text')
        .attr('class', 'map-bubble-label');

    const merged = groupsEnter.merge(groups);

    merged.attr('data-firm-id', d => d.id);

    merged.select('.map-bubble')
        .attr('r', d => d.radius)
        .attr('cx', d => d.projected[0])
        .attr('cy', d => d.projected[1])
        .style('fill', '#22c55e')
        .on('click', (event, d) => {
            event.stopPropagation();
            openFirmPanel(d);
        })
        .on('mouseover', function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('r', Math.max(d.radius * 1.25, MAP_BUBBLE_MIN_RADIUS * 1.5))
                .style('fill', '#4ade80');

            const content = `<strong>${d.name}</strong><br>
                AUM: $${d.aum.toFixed(1)}B<br>
                HQ: ${d.hqLocation}<br>
                Stage: ${getStageName(d.stage)}`;
            showTooltip(event, content);
        })
        .on('mouseout', function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('r', d.radius)
                .style('fill', '#22c55e');
            hideTooltip();
        });

    merged.select('.map-bubble-label')
        .attr('x', d => d.projected[0])
        .attr('y', d => d.projected[1] + d.radius + 8)
        .text(d => d.name);

    groups.exit().remove();
}

function scheduleGlobeRender(forceStatic = false) {
    if (forceStatic) forceStaticRender = true;
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
        renderScheduled = false;
        const force = forceStaticRender;
        forceStaticRender = false;
        renderGlobe(force);
    });
}

function renderGlobe(forceStatic = false) {
    if (!state.mapProjection) return;
    updateProjection();
    drawStaticLayers(forceStatic);
    updateMapBubbles();
}

function initializeZoom(container) {
    const zoomBehaviour = d3.zoom()
        .scaleExtent([0.7, 240])
        .translateExtent(state.mapBounds || [[-Infinity, -Infinity], [Infinity, Infinity]])
        .filter(event => {
            if (event.type === 'wheel') return true;
            if (event.type === 'touchstart' || event.type === 'touchmove') {
                return (event.touches?.length || 0) > 1;
            }
            return false;
        })
        .on('zoom', event => {
            state.mapZoomTransform = event.transform;
            state.mapScale = state.mapBaseScale * event.transform.k;
            scheduleGlobeRender();
        });

    state.mapZoom = zoomBehaviour;
    container.call(zoomBehaviour)
        .call(zoomBehaviour.transform, state.mapZoomTransform);
}

function initializeDrag(container) {
    container.call(
        d3.drag()
            .on('start', () => {
                state.isGlobeDragging = true;
            })
            .on('drag', event => {
                const zoomFactor = state.mapZoomTransform?.k || 1;
                const dragFactor = ROTATION_SENSITIVITY / Math.max(zoomFactor, 0.5);
                state.mapRotation.lambda += event.dx * dragFactor;
                state.mapRotation.phi = Math.max(
                    -ROTATION_LAT_CLAMP,
                    Math.min(ROTATION_LAT_CLAMP, state.mapRotation.phi - event.dy * dragFactor)
                );
                scheduleGlobeRender();
            })
            .on('end', () => {
                state.isGlobeDragging = false;
            })
    );
}

function setInitialDimensions() {
    const container = document.getElementById('map-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    state.mapDimensions = { width, height };
    state.mapBaseScale = Math.min(width, height) / 2.05;
    if (!state.mapScale) {
        state.mapScale = state.mapBaseScale;
    }
}

async function initMap() {
    if (typeof d3 === 'undefined') {
        console.warn('D3 library unavailable; map view will be disabled.');
        return;
    }

    if (typeof topojson === 'undefined') {
        console.warn('TopoJSON library unavailable; map view will be disabled.');
        return;
    }

    setInitialDimensions();

    state.mapSvg = d3.select('#world-map');
    state.mapSvg.selectAll('*').remove();

    state.mapG = state.mapSvg.append('g').attr('class', 'globe-root');
    state.mapSphere = state.mapG.append('path').attr('class', 'globe-sphere');
    state.mapGraticule = state.mapG.append('path').attr('class', 'map-graticule');
    state.mapCountries = state.mapG.append('g').attr('class', 'map-countries');
    state.mapStates = state.mapG.append('g').attr('class', 'map-states');
    state.mapCounties = state.mapG.append('g').attr('class', 'map-counties');
    state.mapCities = state.mapG.append('g').attr('class', 'map-cities');
    state.mapBubblesGroup = state.mapG.append('g').attr('class', 'map-bubbles');

    state.mapProjection = d3.geoOrthographic()
        .clipAngle(90)
        .clipExtent([[0, 0], [state.mapDimensions.width, state.mapDimensions.height]]);

    pathGenerator = d3.geoPath(state.mapProjection);
    graticule = d3.geoGraticule10();
    state.mapBounds = computeMapBounds(pathGenerator);

    try {
        const [world, usStates, usCounties] = await Promise.all([
            d3.json('data/countries-110m.json'),
            d3.json('data/us-states-10m.json'),
            d3.json('data/us-counties-10m.json')
        ]);

        countryFeatures = topojson.feature(world, world.objects.countries).features;
        stateFeatures = usStates?.objects?.states
            ? topojson.feature(usStates, usStates.objects.states).features
            : [];
        countyFeatures = usCounties?.objects?.counties
            ? topojson.feature(usCounties, usCounties.objects.counties).features
            : [];

        state.mapCountries.selectAll('path')
            .data(countryFeatures, d => d.id)
            .join('path')
            .attr('class', 'map-country');

        state.mapStates.selectAll('path')
            .data(stateFeatures, d => d.id)
            .join('path')
            .attr('class', 'map-state');

        state.mapCounties.selectAll('path')
            .data(countyFeatures, d => d.id)
            .join('path')
            .attr('class', 'map-county');

        if (!state.mapZoomTransform) {
            state.mapZoomTransform = d3.zoomIdentity;
        }

        state.mapScale = state.mapBaseScale * state.mapZoomTransform.k;

        initializeZoom(state.mapSvg);
        initializeDrag(state.mapSvg);

        scheduleGlobeRender(true);

        const resetBtn = document.getElementById('reset-globe');
        if (resetBtn) {
            resetBtn.onclick = resetGlobeOrientation;
        }
    } catch (e) {
        console.error('Error loading map:', e);
    }
}

function resizeGlobe() {
    if (!state.mapProjection) return;
    setInitialDimensions();
    state.mapProjection.clipExtent([[0, 0], [state.mapDimensions.width, state.mapDimensions.height]]);
    state.mapScale = state.mapBaseScale * state.mapZoomTransform.k;
    state.mapBounds = computeMapBounds(pathGenerator);
    initializeZoom(state.mapSvg);
    scheduleGlobeRender(true);
}

function animateToRotation(targetRotation, targetZoomK = 1.6, duration = 900, onComplete) {
    if (!state.mapSvg) return;
    const desiredLambda = targetRotation?.lambda ?? state.mapRotation.lambda;
    const desiredPhiRaw = targetRotation?.phi ?? state.mapRotation.phi;
    const desiredPhi = Math.max(-ROTATION_LAT_CLAMP, Math.min(ROTATION_LAT_CLAMP, desiredPhiRaw));
    const startRotation = { lambda: state.mapRotation.lambda, phi: state.mapRotation.phi };
    const desiredRotation = { lambda: desiredLambda, phi: desiredPhi };
    const rotationInterpolator = d3.interpolateObject(startRotation, desiredRotation);

    const scaleExtent = state.mapZoom ? state.mapZoom.scaleExtent() : [0.7, 240];
    const clampedZoom = Math.max(scaleExtent[0], Math.min(scaleExtent[1], targetZoomK));
    state.mapZoomTransform = d3.zoomIdentity.scale(clampedZoom);

    let pending = state.mapZoom ? 2 : 1;
    const complete = () => {
        pending -= 1;
        if (pending <= 0 && typeof onComplete === 'function') {
            onComplete();
        }
    };

    d3.transition()
        .duration(duration)
        .ease(d3.easeCubicInOut)
        .tween('rotate', () => t => {
            state.mapRotation.lambda = rotationInterpolator(t).lambda;
            state.mapRotation.phi = rotationInterpolator(t).phi;
            scheduleGlobeRender();
        })
        .on('end', () => {
            state.mapRotation = { lambda: desiredLambda, phi: desiredPhi };
            scheduleGlobeRender(true);
            complete();
        });

    if (state.mapZoom) {
        state.mapSvg.transition()
            .duration(duration)
            .ease(d3.easeCubicInOut)
            .call(state.mapZoom.transform, d3.zoomIdentity.scale(clampedZoom))
            .on('end', complete);
    } else {
        state.mapScale = state.mapBaseScale * clampedZoom;
        scheduleGlobeRender(true);
    }
}

function resetGlobeOrientation() {
    animateToRotation({ lambda: 0, phi: 0 }, 1, 600);
}

function zoomToLocation(firm, options = {}) {
    if (!firm?.hqLocation || !CONFIG.CITY_COORDS[firm.hqLocation]) return;
    const coords = CONFIG.CITY_COORDS[firm.hqLocation];
    const {
        zoom = 2,
        duration = 900,
        onComplete
    } = options;
    const target = {
        lambda: -coords[1],
        phi: Math.max(-60, Math.min(60, -coords[0]))
    };
    animateToRotation(target, zoom, duration, onComplete);
}

function findMapBubbleNode(firmId) {
    if (!state.mapBubblesGroup || !firmId) return null;
    let node = null;
    state.mapBubblesGroup.selectAll('.map-bubble').each(function(d) {
        if (d.id === firmId && !node) {
            node = this;
        }
    });
    return node;
}

function activateFirmBubble(firmId) {
    const bubbleNode = findMapBubbleNode(firmId);
    if (!bubbleNode) return false;
    bubbleNode.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
}

function focusFirmOnMap(firm, options = {}) {
    if (!firm) return;
    const {
        zoom = 6,
        duration = 900,
        activationAttempts = 3
    } = options;

    const tryActivate = attemptsLeft => {
        if (activateFirmBubble(firm.id)) return;
        if (attemptsLeft <= 0) {
            if (typeof openFirmPanel === 'function') {
                openFirmPanel(firm);
            }
            return;
        }
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => tryActivate(attemptsLeft - 1));
        } else {
            setTimeout(() => tryActivate(attemptsLeft - 1), 50);
        }
    };

    zoomToLocation(firm, {
        zoom,
        duration,
        onComplete: () => {
            if (typeof requestAnimationFrame !== 'function') {
                tryActivate(activationAttempts);
                return;
            }
            requestAnimationFrame(() => tryActivate(activationAttempts));
        }
    });
}

// Expose render helpers for other modules
window.renderGlobe = renderGlobe;
window.resizeGlobe = resizeGlobe;
window.animateToRotation = animateToRotation;
window.scheduleGlobeRender = scheduleGlobeRender;
window.focusFirmOnMap = focusFirmOnMap;
window.resetGlobeOrientation = resetGlobeOrientation;
window.zoomToLocation = zoomToLocation;
