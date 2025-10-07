// Utility functions
const $ = id => document.getElementById(id);

const normalizeStage = v => Math.min(Math.max(parseInt(v, 10) || 1, 1), CONFIG.STAGE_NAMES.length);

const getStageName = s => CONFIG.STAGE_NAMES[s - 1] || 'Unknown';

const getStageColor = s => CONFIG.STAGE_COLORS[normalizeStage(s) - 1];

function withBasePosition(firm) {
    const baseX = firm.baseX ?? firm.x ?? Math.random() * 2000 - 1000;
    const baseY = firm.baseY ?? firm.y ?? Math.random() * 2000 - 1000;
    return {
        ...firm,
        stage: normalizeStage(firm.stage),
        baseX,
        baseY,
        x: firm.x ?? baseX,
        y: firm.y ?? baseY
    };
}

function showTooltip(e, content) {
    const tooltip = document.querySelector('.map-tooltip');
    tooltip.innerHTML = content;
    tooltip.style.left = (e.pageX + 10) + 'px';
    tooltip.style.top = (e.pageY - 10) + 'px';
    tooltip.classList.add('visible');
}

function hideTooltip() {
    document.querySelector('.map-tooltip').classList.remove('visible');
}