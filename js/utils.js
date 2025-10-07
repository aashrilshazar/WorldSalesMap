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
    const container = document.getElementById('map-container');
    if (!tooltip || !container) return;

    tooltip.innerHTML = content;

    const rect = container.getBoundingClientRect();
    const offset = 16;
    const cursorX = (e.clientX ?? 0) - rect.left;
    const cursorY = (e.clientY ?? 0) - rect.top;

    let left = cursorX + offset;
    let top = cursorY + offset;

    const tooltipWidth = tooltip.offsetWidth || 0;
    const tooltipHeight = tooltip.offsetHeight || 0;
    const maxWidth = rect.width - offset - tooltipWidth;
    const maxHeight = rect.height - offset - tooltipHeight;

    if (left > maxWidth) left = Math.max(offset, maxWidth);
    if (top > maxHeight) top = Math.max(offset, maxHeight);

    tooltip.style.left = `${Math.max(offset, left)}px`;
    tooltip.style.top = `${Math.max(offset, top)}px`;
    tooltip.classList.add('visible');
}

function hideTooltip() {
    const tooltip = document.querySelector('.map-tooltip');
    if (!tooltip) return;
    tooltip.classList.remove('visible');
}
