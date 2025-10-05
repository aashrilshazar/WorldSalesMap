// Global state management
const state = {
    firms: [],
    cities: [],
    currentFirm: null,
    currentSort: 'none',
    viewMode: 'map',
    canvas: null,
    ctx: null,
    camera: { x: 0, y: 0, zoom: 1 },
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    hoveredFirm: null,
    animationFrame: null,
    mapSvg: null,
    mapG: null,
    mapCountries: null,
    mapStates: null,
    mapCities: null,
    mapProjection: null,
    mapZoom: null
};
