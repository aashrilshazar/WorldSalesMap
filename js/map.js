// Map view functionality
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
    state.mapG = state.mapSvg.append('g');
    state.mapProjection = d3.geoMercator()
        .scale((width / 2 / Math.PI) * 0.8)
        .translate([width / 2, height / 1.8]);
    
    const path = d3.geoPath().projection(state.mapProjection);
    
    state.mapZoom = d3.zoom()
        .scaleExtent([0.5, 8])
        .on('zoom', event => {
            state.mapG.attr('transform', event.transform);
            state.mapG.selectAll('.map-bubble-label')
                .style('font-size', `${11 / Math.sqrt(event.transform.k)}px`);
        });
    
    state.mapSvg.call(state.mapZoom);
    
    try {
        const world = await d3.json('data/countries-110m.json');
        const countries = topojson.feature(world, world.objects.countries);

        state.mapG.selectAll('path')
            .data(countries.features)
            .join('path')
            .attr('class', 'map-country')
            .attr('d', path);
        
        updateMapBubbles();
    } catch (e) {
        console.error('Error loading map:', e);
    }
}

function updateMapBubbles() {
    if (!state.mapG) return;
    
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
    state.mapG.selectAll('.map-country')
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
        .attr('r', d => Math.max(4, Math.sqrt(d.aum) * 0.6))
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
                .attr('r', Math.max(6, Math.sqrt(d.aum) * 0.8));
            
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
                .attr('r', Math.max(4, Math.sqrt(d.aum) * 0.6));
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
            return projected[1] + Math.max(4, Math.sqrt(d.aum) * 0.6) + 12;
        })
        .text(d => d.name);
}
