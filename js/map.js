// Globe-based map view functionality
const MAP_BUBBLE_MIN_RADIUS = 2;
const MAP_BUBBLE_FACTOR = 0.3;
const MAP_BUBBLE_HOVER_FACTOR = 0.45;
const MAP_BUBBLE_SIZE_RATIO = 2;
const MAP_CITY_BASE_RADIUS = 1.6;
const MAP_CITY_MIN_RADIUS = 0.5;
const MAP_BOUNDARY_PADDING = 20;
const ROTATION_SENSITIVITY = 0.25;
const ROTATION_LAT_CLAMP = 75;
const WORLD_SPHERE = { type: 'Sphere' };
const US_FOCUS_LON_RANGE = [-170, -50];
const US_FOCUS_LAT_RANGE = [15, 75];
const COUNTY_DISPLAY_ZOOM = 1.5;
const NEWS_HIGHLIGHT_COLOR = '#c026d3';
const NEWS_HIGHLIGHT_STROKE = '#f5d0fe';
const NEWS_HIGHLIGHT_STROKE_HOVER = '#fae8ff';
const NEWS_HIGHLIGHT_STROKE_HIGHLIGHT = '#fdf4ff';
const NEWS_HIGHLIGHT_GLOW =
    'drop-shadow(0 0 12px rgba(192,38,211,0.85)) drop-shadow(0 0 6px rgba(192,38,211,0.6))';
const DEFAULT_BUBBLE_STROKE = 'rgba(255,255,255,0.2)';

function hexToRgb(hex) {
    if (typeof hex !== 'string') return null;
    const trimmed = hex.trim().replace('#', '');
    if (trimmed.length !== 3 && trimmed.length !== 6) return null;
    const normalized = trimmed.length === 3
        ? trimmed.split('').map(ch => ch + ch).join('')
        : trimmed;
    const num = Number.parseInt(normalized, 16);
    if (Number.isNaN(num)) return null;
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
}

function rgbChannelToHex(value) {
    const clamped = Math.max(0, Math.min(255, Math.round(value)));
    return clamped.toString(16).padStart(2, '0');
}

function rgbToHex(rgb) {
    if (!rgb) return null;
    return `#${rgbChannelToHex(rgb.r)}${rgbChannelToHex(rgb.g)}${rgbChannelToHex(rgb.b)}`;
}

function adjustColor(hex, amount = 0.2) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const factor = Math.max(-1, Math.min(1, amount));
    const apply = channel => {
        if (factor >= 0) {
            return channel + (255 - channel) * factor;
        }
        return channel * (1 + factor);
    };
    return rgbToHex({
        r: apply(rgb.r),
        g: apply(rgb.g),
        b: apply(rgb.b)
    }) || hex;
}

function getStageBaseColor(stage) {
    return getStageColor(stage) || '#22c55e';
}

function getStageHoverColor(stage) {
    return adjustColor(getStageBaseColor(stage), 0.18);
}

function getStageHighlightColor(stage) {
    return adjustColor(getStageBaseColor(stage), 0.32);
}

function ensureNewsHighlightSet() {
    if (!(state.newsHighlightedFirmIds instanceof Set)) {
        state.newsHighlightedFirmIds = new Set();
    }
    return state.newsHighlightedFirmIds;
}

function isFirmNewsHighlighted(firmId) {
    if (!firmId) return false;
    return ensureNewsHighlightSet().has(firmId);
}

function getBubbleBaseColor(datum) {
    return isFirmNewsHighlighted(datum?.id)
        ? NEWS_HIGHLIGHT_COLOR
        : getStageBaseColor(datum?.stage);
}

function getBubbleHoverColor(datum) {
    return isFirmNewsHighlighted(datum?.id)
        ? adjustColor(NEWS_HIGHLIGHT_COLOR, 0.18)
        : getStageHoverColor(datum?.stage);
}

function getBubbleHighlightColor(datum) {
    return isFirmNewsHighlighted(datum?.id)
        ? adjustColor(NEWS_HIGHLIGHT_COLOR, 0.32)
        : getStageHighlightColor(datum?.stage);
}

function getBubbleStroke(datum, mode = 'base') {
    if (isFirmNewsHighlighted(datum?.id)) {
        if (mode === 'highlight') return NEWS_HIGHLIGHT_STROKE_HIGHLIGHT;
        if (mode === 'hover') return NEWS_HIGHLIGHT_STROKE_HOVER;
        return NEWS_HIGHLIGHT_STROKE;
    }
    if (mode === 'highlight') return 'rgba(255,255,255,0.35)';
    if (mode === 'hover') return 'rgba(255,255,255,0.28)';
    return DEFAULT_BUBBLE_STROKE;
}

function getBubbleStrokeWidth(datum, mode = 'base') {
    if (isFirmNewsHighlighted(datum?.id)) {
        if (mode === 'highlight') return 1.6;
        if (mode === 'hover') return 1.4;
        return 1.2;
    }
    if (mode === 'highlight') return 0.8;
    if (mode === 'hover') return 0.7;
    return 0.5;
}

function getBubbleFilter(datum) {
    return isFirmNewsHighlighted(datum?.id) ? NEWS_HIGHLIGHT_GLOW : null;
}

function applyBubbleStyle(node, datum, mode = 'base') {
    if (!node) return;
    const data = datum || d3.select(node).datum();
    if (!data) return;
    const selection = d3.select(node);
    selection
        .style('fill', mode === 'highlight'
            ? getBubbleHighlightColor(data)
            : mode === 'hover'
                ? getBubbleHoverColor(data)
                : getBubbleBaseColor(data))
        .style('stroke', getBubbleStroke(data, mode))
        .style('stroke-width', getBubbleStrokeWidth(data, mode))
        .style('filter', getBubbleFilter(data) || null);
}

function prepareMapBubbleLayout() {
    if (!state.mapBubbleLayoutDirty && Array.isArray(state.mapBubbleLayout)) {
        return;
    }

    const locationGroups = new Map();
    state.firms.forEach(firm => {
        if (!firm?.hqLocation) return;
        const coords = CONFIG.CITY_COORDS[firm.hqLocation];
        if (!coords) return;
        const key = `${coords[0]}_${coords[1]}`;
        if (!locationGroups.has(key)) {
            locationGroups.set(key, { coords, firms: [] });
        }
        locationGroups.get(key).firms.push(firm);
    });

    const layout = [];

    locationGroups.forEach(({ coords, firms }) => {
        if (!firms.length) return;
        const sorted = [...firms].sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0));
        const topFirm = sorted[0];
        const baseMagnitude = Math.sqrt((topFirm?.aum ?? 1) || 1) * MAP_BUBBLE_FACTOR;
        const rawBaseRadius = Number.isFinite(baseMagnitude) && baseMagnitude > 0
            ? baseMagnitude
            : MAP_BUBBLE_MIN_RADIUS;
        const angleStep = sorted.length > 1 ? (Math.PI * 2) / sorted.length : 0;

        sorted.forEach((firm, index) => {
            layout.push({
                firm,
                coords,
                index,
                angle: angleStep * index,
                rawBaseRadius,
                radiusScale: 1 / Math.pow(MAP_BUBBLE_SIZE_RATIO, index),
                projected: [0, 0],
                radius: MAP_BUBBLE_MIN_RADIUS
            });
        });
    });

    state.mapBubbleLayout = layout;
    state.mapBubbleLayoutDirty = false;
}

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

    prepareMapBubbleLayout();
    const layout = Array.isArray(state.mapBubbleLayout) ? state.mapBubbleLayout : [];
    const visible = state.mapVisibleBubbles ?? (state.mapVisibleBubbles = []);
    visible.length = 0;

    const zoomLevel = state.mapZoomTransform?.k || 1;
    const maxZoom = state.mapZoom?.scaleExtent()[1] || 240;
    const zoomRatio = maxZoom > 1 ? Math.min(1, Math.max(0, (zoomLevel - 1) / (maxZoom - 1))) : 0;
    const sizeScale = 1 + zoomRatio * 2; // up to 3x at max zoom

    layout.forEach(entry => {
        const { firm, coords } = entry;
        if (!firm || !coords) return;

        const [lat, lon] = coords;
        if (!isCoordinateVisible(lon, lat)) return;
        const basePoint = state.mapProjection([lon, lat]);
        if (!basePoint) return;

        const baseRadius = Math.max(
            MAP_BUBBLE_MIN_RADIUS,
            entry.rawBaseRadius * sizeScale
        );
        const ratioRadius = baseRadius * entry.radiusScale;
        const radius = Math.max(MAP_BUBBLE_MIN_RADIUS, ratioRadius);
        let x = basePoint[0];
        let y = basePoint[1];
        if (entry.index > 0) {
            const offset = baseRadius * 0.9 + radius;
            x += Math.cos(entry.angle) * offset;
            y += Math.sin(entry.angle) * offset;
        }

        entry.id = firm.id;
        entry.name = firm.name;
        const aumValue = Number(firm.aum);
        entry.aum = Number.isFinite(aumValue) ? aumValue : 0;
        entry.stage = firm.stage;
        entry.hqLocation = firm.hqLocation;
        entry.projected[0] = x;
        entry.projected[1] = y;
        entry.radius = radius;

        visible.push(entry);
    });

    const groups = state.mapBubblesGroup.selectAll('.map-bubble-group')
        .data(visible, d => d.id);

    const groupsEnter = groups.enter().append('g')
        .attr('class', 'map-bubble-group');

    groupsEnter.append('circle')
        .attr('class', 'map-bubble');

    groupsEnter.append('text')
        .attr('class', 'map-bubble-label');

    const merged = groupsEnter.merge(groups);

    merged
        .attr('data-firm-id', d => d.id)
        .classed('map-bubble-group--news', d => isFirmNewsHighlighted(d.id));

    merged.select('.map-bubble')
        .attr('r', d => d.radius)
        .attr('cx', d => d.projected[0])
        .attr('cy', d => d.projected[1])
        .each(function(d) {
            applyBubbleStyle(this, d, 'base');
        })
        .on('click', (event, d) => {
            event.stopPropagation();
            const firmData = d.firm || d;
            if (typeof focusFirmOnMap === 'function') {
                focusFirmOnMap(firmData);
            } else if (typeof openFirmPanel === 'function') {
                openFirmPanel(firmData);
            }
        })
        .on('mouseover', function(event, d) {
            const bubble = d3.select(this);
            if (state.activeFirmId === d.id) {
                bubble.interrupt('highlight');
                applyBubbleStyle(this, d, 'highlight');
            } else {
                bubble.transition()
                    .duration(200)
                    .attr('r', Math.max(d.radius * 1.25, MAP_BUBBLE_MIN_RADIUS * 1.5));
                applyBubbleStyle(this, d, 'hover');
            }

            const content = `<strong>${d.name}</strong><br>
                AUM: $${d.aum.toFixed(1)}B<br>
                HQ: ${d.hqLocation}<br>
                Stage: ${getStageName(d.stage)}`;
            showTooltip(event, content);
        })
        .on('mouseout', function(event, d) {
            const bubble = d3.select(this);
            if (state.activeFirmId === d.id) {
                bubble.interrupt('highlight');
                applyBubbleStyle(this, d, 'highlight');
            } else {
                bubble.transition()
                    .duration(200)
                    .attr('r', d.radius);
                applyBubbleStyle(this, d, 'base');
            }
            hideTooltip();
        });

    merged.select('.map-bubble-label')
        .attr('x', d => d.projected[0])
        .attr('y', d => d.projected[1] + d.radius + 8)
        .text(d => d.name)
        .classed('map-bubble-label--news', d => isFirmNewsHighlighted(d.id));

    groups.exit().remove();

    restoreActiveBubbleHighlight();
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

function animateBubbleRadius(bubbleNode, radius, ease = d3.easeCubicOut) {
    d3.select(bubbleNode)
        .interrupt('highlight')
        .transition('highlight')
        .duration(320)
        .ease(ease)
        .attr('r', radius);
}

function resetBubbleAppearance(bubbleNode, { smooth = true } = {}) {
    if (!bubbleNode) return;
    const datum = d3.select(bubbleNode).datum();
    const originalRadius = bubbleNode.dataset.originalRadius
        ? Number(bubbleNode.dataset.originalRadius)
        : Number(bubbleNode.getAttribute('r'));
    if (Number.isNaN(originalRadius)) return;

    applyBubbleStyle(bubbleNode, datum, 'base');
    bubbleNode.classList.remove('highlighted');

    if (smooth) {
        d3.select(bubbleNode)
            .interrupt('highlight')
            .transition('highlight')
            .duration(320)
            .ease(d3.easeCubicInOut)
            .attr('r', originalRadius)
            .on('end', () => {
                delete bubbleNode.dataset.originalRadius;
            });
    } else {
        bubbleNode.setAttribute('r', originalRadius);
        delete bubbleNode.dataset.originalRadius;
    }
}

function applyHighlightToBubble(bubbleNode, { smooth = true } = {}) {
    if (!bubbleNode) return;
    const currentRadius = Number(bubbleNode.getAttribute('r'));
    if (Number.isNaN(currentRadius)) return;

    if (!bubbleNode.dataset.originalRadius) {
        bubbleNode.dataset.originalRadius = String(currentRadius);
    }
    const originalRadius = Number(bubbleNode.dataset.originalRadius || currentRadius);
    const targetRadius = Math.max(originalRadius * 1.55, MAP_BUBBLE_MIN_RADIUS * 1.8);

    if (smooth) {
        animateBubbleRadius(bubbleNode, targetRadius);
    } else {
        bubbleNode.setAttribute('r', targetRadius);
    }

    const datum = d3.select(bubbleNode).datum();
    applyBubbleStyle(bubbleNode, datum, 'highlight');
    bubbleNode.classList.add('highlighted');
}

function clearActiveFirmHighlight({ smooth = true } = {}) {
    if (state.activeHighlightTimeout) {
        clearTimeout(state.activeHighlightTimeout);
        state.activeHighlightTimeout = null;
    }
    if (!state.activeFirmId) return;
    const bubbleNode = findMapBubbleNode(state.activeFirmId);
    resetBubbleAppearance(bubbleNode, { smooth });
    state.activeFirmId = null;
}

function scheduleActiveHighlightExpiry(firmId) {
    if (state.activeHighlightTimeout) {
        clearTimeout(state.activeHighlightTimeout);
        state.activeHighlightTimeout = null;
    }

    state.activeHighlightTimeout = setTimeout(() => {
        state.activeHighlightTimeout = null;
        if (state.activeFirmId === firmId) {
            clearActiveFirmHighlight({ smooth: true });
        }
    }, 60 * 1000);
}

function highlightFirmSelection(firm, { openPanel = true, smooth = true } = {}) {
    if (!firm) return false;
    const bubbleNode = findMapBubbleNode(firm.id);
    if (!bubbleNode) return false;

    if (state.activeFirmId && state.activeFirmId !== firm.id) {
        clearActiveFirmHighlight({ smooth });
    }

    state.activeFirmId = firm.id;
    applyHighlightToBubble(bubbleNode, { smooth });
    scheduleActiveHighlightExpiry(firm.id);

    if (openPanel && typeof openFirmPanel === 'function') {
        openFirmPanel(firm);
    }

    return true;
}

function restoreActiveBubbleHighlight() {
    if (!state.activeFirmId) return;
    const bubbleNode = findMapBubbleNode(state.activeFirmId);
    if (!bubbleNode) return;
    applyHighlightToBubble(bubbleNode, { smooth: false });
}

function setsEqual(a, b) {
    if (!(a instanceof Set) || !(b instanceof Set)) return false;
    if (a.size !== b.size) return false;
    for (const value of a) {
        if (!b.has(value)) {
            return false;
        }
    }
    return true;
}

function setNewsHighlightedFirms(firmIds) {
    const incoming = Array.isArray(firmIds) ? firmIds.filter(Boolean) : [];
    const nextSet = new Set(incoming);
    const current = ensureNewsHighlightSet();
    if (setsEqual(current, nextSet)) return;
    state.newsHighlightedFirmIds = nextSet;
    scheduleGlobeRender();
}

function focusFirmOnMap(firm, options = {}) {
    if (!firm) return;
    const {
        zoom = 8,
        duration = 900,
        highlightAttempts = 4,
        openPanel = true
    } = options;

    const schedule = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (fn => setTimeout(fn, 50));

    const attemptHighlight = attemptsLeft => {
        if (highlightFirmSelection(firm, { openPanel, smooth: attemptsLeft !== highlightAttempts })) {
            return;
        }
        if (attemptsLeft <= 0) {
            if (openPanel && typeof openFirmPanel === 'function') {
                openFirmPanel(firm);
            }
            return;
        }
        schedule(() => attemptHighlight(attemptsLeft - 1));
    };

    zoomToLocation(firm, {
        zoom,
        duration,
        onComplete: () => schedule(() => attemptHighlight(highlightAttempts))
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
window.setNewsHighlightedFirms = setNewsHighlightedFirms;
