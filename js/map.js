// Map view functionality
const MAP_BUBBLE_MIN_RADIUS = 3;
const MAP_BUBBLE_FACTOR = 0.3;
const MAP_BUBBLE_HOVER_FACTOR = 0.4;
const MAP_CITY_BASE_RADIUS = 2;
const MAP_CITY_MIN_RADIUS = 0.6;

async function initMap() {
    if (typeof d3 === 'undefined') {
        console.warn('D3 library unavailable; map view will be disabled.');
        return;
    }

    if (typeof topojson === 'undefined') {
        console.warn('TopoJSON library unavailable; map view will be disabled.');
        return;
    }

    const container = $('map-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    state.mapSvg = d3.select('#world-map');
    state.mapSvg.selectAll('*').remove();
    state.mapG = state.mapSvg.append('g');
    state.mapCountries = state.mapG.append('g').attr('class', 'map-countries');
    state.mapStates = state.mapG.append('g').attr('class', 'map-states');
    state.mapCities = state.mapG.append('g').attr('class', 'map-cities');
    state.mapProjection = d3.geoMercator()
        .scale((width / 2 / Math.PI) * 0.8)
        .translate([width / 2, height / 1.8]);
    
    const path = d3.geoPath().projection(state.mapProjection);
    
    state.mapZoom = d3.zoom()
        .scaleExtent([0.5, 20])
        .on('zoom', event => {
            state.mapG.attr('transform', event.transform);
            const scaleFactor = Math.sqrt(event.transform.k);
            state.mapG.selectAll('.map-bubble-label')
                .style('font-size', `${11 / scaleFactor}px`);
            if (state.mapCities) {
                const radius = Math.max(MAP_CITY_MIN_RADIUS, MAP_CITY_BASE_RADIUS / scaleFactor);
                state.mapCities.selectAll('.map-city')
                    .attr('r', radius);
            }
        });
    
    state.mapSvg.call(state.mapZoom);
    
    try {
        const [world, usStates, usCities] = await Promise.all([
            d3.json('data/countries-110m.json'),
            d3.json('data/us-states-10m.json'),
            d3.json('data/us-cities-top100.json')
        ]);
        const countries = topojson.feature(world, world.objects.countries);
        const states = usStates?.objects?.states
            ? topojson.feature(usStates, usStates.objects.states)
            : { features: [] };
        state.cities = Array.isArray(usCities) ? usCities : [];

        state.mapCountries.selectAll('.map-country')
            .data(countries.features)
            .join('path')
            .attr('class', 'map-country')
            .attr('d', path);

        state.mapStates.selectAll('.map-state')
            .data(states.features)
            .join('path')
            .attr('class', 'map-state')
            .attr('d', path);

        renderCities();
        
        updateMapBubbles();
    } catch (e) {
        console.error('Error loading map:', e);
    }
}

function renderCities() {
    if (typeof d3 === 'undefined') return;
    if (!state.mapCities || !state.mapProjection) return;
    const transform = state.mapSvg ? d3.zoomTransform(state.mapSvg.node()) : d3.zoomIdentity;
    const radius = Math.max(MAP_CITY_MIN_RADIUS, MAP_CITY_BASE_RADIUS / Math.sqrt(transform.k || 1));

    const cityData = (state.cities || []).filter(city =>
        Number.isFinite(city.lat) && Number.isFinite(city.lon)
    );

    const citySelection = state.mapCities.selectAll('.map-city')
        .data(cityData, city => `${city.city}-${city.state}`);

    const merged = citySelection.join(
        enter => {
            const circles = enter.append('circle')
                .attr('class', 'map-city');
            circles.append('title');
            return circles;
        },
        update => update,
        exit => exit.remove()
    );

    merged
        .attr('cx', city => state.mapProjection([city.lon, city.lat])[0])
        .attr('cy', city => state.mapProjection([city.lon, city.lat])[1])
        .attr('r', radius);

    merged.select('title')
        .text(city => {
            const stateLabel = city.state ? `, ${city.state}` : '';
            const population = city.population
                ? city.population.toLocaleString('en-US')
                : 'N/A';
            return `${city.city}${stateLabel}\nPopulation: ${population}`;
        });
}

function updateMapBubbles() {
    if (!state.mapG || !state.mapCountries) return;
    
    // Calculate country stages
    const countryStages = {};
    state.firms.forEach(f => {
        const country = CONFIG.CITY_TO_COUNTRY[f.hqLocation];
        if (country) {
            if (!countryStages[country]) countryStages[country] = { total: 0, count: 0 };
            countryStages[country].total += f.stage;
            countryStages[country].count++;
        }
    });
    
    Object.keys(countryStages).forEach(c => {
        countryStages[c].average = countryStages[c].total / countryStages[c].count;
    });
    
    // Update country shading
    state.mapCountries.selectAll('.map-country')
        .transition().duration(500)
        .style('fill', d => {
            const country = CONFIG.COUNTRY_IDS[d.id];
            if (country && countryStages[country]) {
                return getStageColor(Math.round(countryStages[country].average)) + '30';
            }
            return 'rgba(30,41,59,0.5)';
        });
    
    // Update bubbles
    const geocoded = state.firms.filter(f => f.hqLocation && CONFIG.CITY_COORDS[f.hqLocation]);
    
    state.mapG.selectAll('.map-bubble-group').remove();
    
    const groups = state.mapG.selectAll('.map-bubble-group')
        .data(geocoded)
        .enter().append('g')
        .attr('class', 'map-bubble-group');
    
    groups.append('circle')
        .attr('class', 'map-bubble')
        .attr('r', d => Math.max(MAP_BUBBLE_MIN_RADIUS, Math.sqrt(d.aum) * MAP_BUBBLE_FACTOR))
        .attr('cx', d => {
            const coords = CONFIG.CITY_COORDS[d.hqLocation];
            return state.mapProjection([coords[1], coords[0]])[0];
        })
        .attr('cy', d => {
            const coords = CONFIG.CITY_COORDS[d.hqLocation];
            return state.mapProjection([coords[1], coords[0]])[1];
        })
        .style('fill', d => getStageColor(d.stage))
        .on('click', (e, d) => {
            e.stopPropagation();
            openFirmPanel(d);
        })
        .on('mouseover', function(e, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('r', Math.max(MAP_BUBBLE_MIN_RADIUS * 1.5, Math.sqrt(d.aum) * MAP_BUBBLE_HOVER_FACTOR));
            
            const content = `<strong>${d.name}</strong><br>
                           AUM: $${d.aum.toFixed(1)}B<br>
                           HQ: ${d.hqLocation}<br>
                           Stage: ${getStageName(d.stage)}`;
            showTooltip(e, content);
        })
        .on('mouseout', function(e, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('r', Math.max(MAP_BUBBLE_MIN_RADIUS, Math.sqrt(d.aum) * MAP_BUBBLE_FACTOR));
            hideTooltip();
        });
    
    groups.append('text')
        .attr('class', 'map-bubble-label')
        .attr('x', d => {
            const coords = CONFIG.CITY_COORDS[d.hqLocation];
            return state.mapProjection([coords[1], coords[0]])[0];
        })
        .attr('y', d => {
            const coords = CONFIG.CITY_COORDS[d.hqLocation];
            const projected = state.mapProjection([coords[1], coords[0]]);
            return projected[1] + Math.max(MAP_BUBBLE_MIN_RADIUS, Math.sqrt(d.aum) * MAP_BUBBLE_FACTOR) + 8;
        })
        .text(d => d.name);
}
