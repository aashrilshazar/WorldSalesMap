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

function renderCounties() {
    if (!state.mapCounties) return;
    const shouldShow = isUSVisible() && state.mapZoomTransform?.k >= COUNTY_DISPLAY_ZOOM;
    state.mapCounties
        .style('opacity', shouldShow ? 0.6 : 0)
        .style('pointer-events', 'none')
        .selectAll('path')
        .attr('d', pathGenerator);
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

    renderCountries();
    renderCounties();

    const geocoded = state.firms.filter(f => f.hqLocation && CONFIG.CITY_COORDS[f.hqLocation]);

    const projected = geocoded
        .map(f => {
            const coords = CONFIG.CITY_COORDS[f.hqLocation];
            const lon = coords[1];
            const lat = coords[0];
            if (!isCoordinateVisible(lon, lat)) return null;
            const projectedCoords = state.mapProjection([lon, lat]);
            if (!projectedCoords) return null;
            return { ...f, projected: projectedCoords };
        })
        .filter(Boolean);

    const groups = state.mapBubblesGroup.selectAll('.map-bubble-group')
        .data(projected, d => d.id);

    const groupsEnter = groups.enter().append('g')
        .attr('class', 'map-bubble-group');

    groupsEnter.append('circle')
        .attr('class', 'map-bubble');

    groupsEnter.append('text')
        .attr('class', 'map-bubble-label');

    const merged = groupsEnter.merge(groups);

    merged.select('.map-bubble')
        .attr('r', d => Math.max(MAP_BUBBLE_MIN_RADIUS, Math.sqrt(d.aum) * MAP_BUBBLE_FACTOR))
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
                .attr('r', Math.max(MAP_BUBBLE_MIN_RADIUS * 1.5, Math.sqrt(d.aum) * MAP_BUBBLE_HOVER_FACTOR))
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
                .attr('r', Math.max(MAP_BUBBLE_MIN_RADIUS, Math.sqrt(d.aum) * MAP_BUBBLE_FACTOR))
                .style('fill', '#22c55e');
            hideTooltip();
        });

    merged.select('.map-bubble-label')
        .attr('x', d => d.projected[0])
        .attr('y', d => d.projected[1] + Math.max(MAP_BUBBLE_MIN_RADIUS, Math.sqrt(d.aum) * MAP_BUBBLE_FACTOR) + 8)
        .text(d => d.name);

    groups.exit().remove();
}

function renderGlobe() {
    if (!state.mapProjection) return;
    updateProjection();
    renderSphere();
    renderGraticule();
    renderStates();
    updateMapBubbles();
}

function initializeZoom(container) {
    const zoomBehaviour = d3.zoom()
        .scaleExtent([0.7, 24])
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
            renderGlobe();
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
                renderGlobe();
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

        renderGlobe();

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
    renderGlobe();
}

function animateToRotation(targetRotation, targetZoomK = 1.6, duration = 900) {
    if (!state.mapSvg) return;
    const desiredLambda = targetRotation?.lambda ?? state.mapRotation.lambda;
    const desiredPhiRaw = targetRotation?.phi ?? state.mapRotation.phi;
    const desiredPhi = Math.max(-ROTATION_LAT_CLAMP, Math.min(ROTATION_LAT_CLAMP, desiredPhiRaw));
    const startRotation = { lambda: state.mapRotation.lambda, phi: state.mapRotation.phi };
    const desiredRotation = { lambda: desiredLambda, phi: desiredPhi };
    const rotationInterpolator = d3.interpolateObject(startRotation, desiredRotation);

    const scaleExtent = state.mapZoom ? state.mapZoom.scaleExtent() : [0.7, 4];
    const clampedZoom = Math.max(scaleExtent[0], Math.min(scaleExtent[1], targetZoomK));
    state.mapZoomTransform = d3.zoomIdentity.scale(clampedZoom);

    d3.transition()
        .duration(duration)
        .ease(d3.easeCubicInOut)
        .tween('rotate', () => t => {
            state.mapRotation.lambda = rotationInterpolator(t).lambda;
            state.mapRotation.phi = rotationInterpolator(t).phi;
            renderGlobe();
        })
        .on('end', () => {
            state.mapRotation = { lambda: desiredLambda, phi: desiredPhi };
        });

    if (state.mapZoom) {
        state.mapSvg.transition()
            .duration(duration)
            .ease(d3.easeCubicInOut)
            .call(state.mapZoom.transform, d3.zoomIdentity.scale(clampedZoom));
    } else {
        state.mapScale = state.mapBaseScale * clampedZoom;
        renderGlobe();
    }
}

// Expose render helpers for other modules
window.renderGlobe = renderGlobe;
window.resizeGlobe = resizeGlobe;
window.animateToRotation = animateToRotation;

function resetGlobeOrientation() {
    const currentZoom = state.mapZoomTransform?.k || 1;
    animateToRotation({ lambda: 0, phi: 0 }, currentZoom, 600);
}

window.resetGlobeOrientation = resetGlobeOrientation;

// Override existing zoomToLocation behaviour
function zoomToLocation(firm) {
    if (!firm?.hqLocation || !CONFIG.CITY_COORDS[firm.hqLocation]) return;
    const coords = CONFIG.CITY_COORDS[firm.hqLocation];
    const target = {
        lambda: -coords[1],
        phi: -coords[0]
    };
    animateToRotation(target, 2);
}

window.zoomToLocation = zoomToLocation;
