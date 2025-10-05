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

let pathGenerator = null;
let graticule = null;
let countryFeatures = [];
let stateFeatures = [];

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

function renderCities() {
    if (!state.mapCities || !Array.isArray(state.cities)) return;
    const radius = Math.max(MAP_CITY_MIN_RADIUS, MAP_CITY_BASE_RADIUS * (state.mapScale / state.mapBaseScale));

    const projected = state.cities
        .map(city => {
            const coords = state.mapProjection([city.lon, city.lat]);
            if (!coords) return null;
            return { ...city, projected: coords };
        })
        .filter(Boolean);

    const citySelection = state.mapCities.selectAll('circle')
        .data(projected, d => `${d.city}-${d.state}`);

    const cityEnter = citySelection.enter()
        .append('circle')
        .attr('class', 'map-city')
        .attr('r', radius);

    cityEnter.append('title');

    const merged = cityEnter.merge(citySelection);

    merged
        .attr('cx', d => d.projected[0])
        .attr('cy', d => d.projected[1])
        .attr('r', radius);

    merged.select('title')
        .text(d => {
            const stateLabel = d.state ? `, ${d.state}` : '';
            const population = d.population ? d.population.toLocaleString('en-US') : 'N/A';
            return `${d.city}${stateLabel}\nPopulation: ${population}`;
        });

    citySelection.exit().remove();
}

function updateMapBubbles() {
    if (!state.mapBubblesGroup || !state.mapProjection) return;

    renderCountries();

    const geocoded = state.firms.filter(f => f.hqLocation && CONFIG.CITY_COORDS[f.hqLocation]);

    const projected = geocoded
        .map(f => {
            const coords = CONFIG.CITY_COORDS[f.hqLocation];
            const projectedCoords = state.mapProjection([coords[1], coords[0]]);
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
        .style('fill', d => getStageColor(d.stage))
        .on('click', (event, d) => {
            event.stopPropagation();
            openFirmPanel(d);
        })
        .on('mouseover', function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('r', Math.max(MAP_BUBBLE_MIN_RADIUS * 1.5, Math.sqrt(d.aum) * MAP_BUBBLE_HOVER_FACTOR));

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
                .attr('r', Math.max(MAP_BUBBLE_MIN_RADIUS, Math.sqrt(d.aum) * MAP_BUBBLE_FACTOR));
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
    renderCountries();
    renderStates();
    renderCities();
    updateMapBubbles();
}

function initializeZoom(container) {
    const zoomBehaviour = d3.zoom()
        .scaleExtent([0.7, 4])
        .translateExtent(state.mapBounds || [[-Infinity, -Infinity], [Infinity, Infinity]])
        .filter(event => {
            if (event.type === 'wheel') return true;
            if (event.type === 'mousedown' && event.button === 0) return true;
            return false;
        })
        .on('zoom', event => {
            const { sourceEvent, transform } = event;

            if (sourceEvent && sourceEvent.type === 'wheel') {
                const isPinch = sourceEvent.ctrlKey || sourceEvent.metaKey;
                if (!isPinch) {
                    const factor = ROTATION_SENSITIVITY * 0.12;
                    state.mapRotation.lambda += sourceEvent.deltaX * factor;
                    state.mapRotation.phi = Math.max(
                        -ROTATION_LAT_CLAMP,
                        Math.min(ROTATION_LAT_CLAMP, state.mapRotation.phi - sourceEvent.deltaY * factor)
                    );

                    const k = state.mapZoomTransform.k;
                    state.mapZoomTransform = d3.zoomIdentity.scale(k);
                    container.call(zoomBehaviour.transform, state.mapZoomTransform);
                    renderGlobe();
                    return;
                }
            }

            state.mapZoomTransform = transform;
            state.mapScale = state.mapBaseScale * transform.k;
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
                state.mapRotation.lambda += event.dx * ROTATION_SENSITIVITY;
                state.mapRotation.phi = Math.max(
                    -ROTATION_LAT_CLAMP,
                    Math.min(ROTATION_LAT_CLAMP, state.mapRotation.phi - event.dy * ROTATION_SENSITIVITY)
                );
                renderGlobe();
            })
            .on('end', () => {
                state.isGlobeDragging = false;
            })
    );

    container.on('click.globe-focus', event => {
        if (state.isGlobeDragging) return;
        if (event.defaultPrevented) return;
        if (event.target.closest('.map-bubble')) return;

        const point = d3.pointer(event, container.node());
        const inverted = state.mapProjection.invert(point);
        if (!inverted) return;

        const [lon, lat] = inverted;
        animateToRotation({
            lambda: -lon,
            phi: Math.max(-ROTATION_LAT_CLAMP, Math.min(ROTATION_LAT_CLAMP, -lat))
        }, state.mapZoomTransform.k, 700);
    });
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
    state.mapCities = state.mapG.append('g').attr('class', 'map-cities');
    state.mapBubblesGroup = state.mapG.append('g').attr('class', 'map-bubbles');

    state.mapProjection = d3.geoOrthographic()
        .clipAngle(90)
        .clipExtent([[0, 0], [state.mapDimensions.width, state.mapDimensions.height]]);

    pathGenerator = d3.geoPath(state.mapProjection);
    graticule = d3.geoGraticule10();
    state.mapBounds = computeMapBounds(pathGenerator);

    try {
        const [world, usStates, usCities] = await Promise.all([
            d3.json('data/countries-110m.json'),
            d3.json('data/us-states-10m.json'),
            d3.json('data/us-cities-top100.json')
        ]);

        countryFeatures = topojson.feature(world, world.objects.countries).features;
        stateFeatures = usStates?.objects?.states
            ? topojson.feature(usStates, usStates.objects.states).features
            : [];
        state.cities = Array.isArray(usCities) ? usCities : [];

        state.mapCountries.selectAll('path')
            .data(countryFeatures, d => d.id)
            .join('path')
            .attr('class', 'map-country');

        state.mapStates.selectAll('path')
            .data(stateFeatures, d => d.id)
            .join('path')
            .attr('class', 'map-state');

        if (!state.mapZoomTransform) {
            state.mapZoomTransform = d3.zoomIdentity;
        }

        state.mapScale = state.mapBaseScale * state.mapZoomTransform.k;

        initializeZoom(state.mapSvg);
        initializeDrag(state.mapSvg);

        renderGlobe();
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
    const startRotation = { ...state.mapRotation };
    const rotationInterpolator = d3.interpolateObject(startRotation, targetRotation);

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
            state.mapRotation = { ...targetRotation };
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

// Override existing zoomToLocation behaviour
function zoomToLocation(firm) {
    if (!firm?.hqLocation || !CONFIG.CITY_COORDS[firm.hqLocation]) return;
    const [lat, lon] = CONFIG.CITY_COORDS[firm.hqLocation];
    const target = {
        lambda: -lon,
        phi: Math.max(-ROTATION_LAT_CLAMP, Math.min(ROTATION_LAT_CLAMP, -lat))
    };
    animateToRotation(target, 2);
}

window.zoomToLocation = zoomToLocation;
