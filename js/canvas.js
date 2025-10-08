// Canvas/Scatter view functionality
function setupCanvas() {
    state.canvas = $('main-canvas');
    state.ctx = state.canvas.getContext('2d');
    resizeCanvas();
}

function resizeCanvas() {
    const container = $('canvas-container');
    state.canvas.width = container.clientWidth;
    state.canvas.height = container.clientHeight;
}

function startAnimation() {
    if (!state.animationFrame) {
        state.animationFrame = requestAnimationFrame(animate);
    }
}

function stopAnimation() {
    if (state.animationFrame) {
        cancelAnimationFrame(state.animationFrame);
        state.animationFrame = null;
    }
}

function animate() {
    if (state.viewMode !== 'scatter') {
        stopAnimation();
        return;
    }
    
    const { ctx, canvas, camera, firms } = state;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-canvas.width / 2 + camera.x, -canvas.height / 2 + camera.y);
    
    firms.forEach(firm => drawFirm(firm));
    
    ctx.restore();
    state.animationFrame = requestAnimationFrame(animate);
}

function drawFirm(firm) {
    const { ctx } = state;
    const radius = Math.sqrt(firm.aum) * 5;
    const isHovered = state.hoveredFirm?.id === firm.id;
    const scale = isHovered ? 1.1 : 1;
    
    ctx.save();
    ctx.translate(firm.x, firm.y);
    ctx.scale(scale, scale);
    
    // Gradient bubble
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    const color = getStageColor(firm.stage);
    gradient.addColorStop(0, color + '80');
    gradient.addColorStop(1, color + '20');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Firm name
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `${Math.min(14, radius / 3)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(firm.name, 0, -5);
    
    // AUM
    ctx.fillStyle = '#94a3b8';
    ctx.font = `${Math.min(11, radius / 4)}px sans-serif`;
    ctx.fillText(`${firm.aum.toFixed(1)}B`, 0, 10);
    
    ctx.restore();
}

function sortBy(type) {
    if (state.viewMode !== 'scatter') return;
    state.currentSort = type;
    
    if (type === 'none') {
        state.firms = state.firms.map(f => ({ ...f, x: f.baseX, y: f.baseY }));
        state.mapBubbleLayoutDirty = true;
    } else {
        const sortKey = type === 'people' ? 'peopleCount' : type;
        state.firms.sort((a, b) => b[sortKey] - a[sortKey]);
        const cols = Math.ceil(Math.sqrt(state.firms.length));
        state.firms.forEach((f, i) => {
            f.x = 100 + (i % cols) * 150;
            f.y = 100 + Math.floor(i / cols) * 150;
        });
    }
    
    document.querySelectorAll('[data-sort]').forEach(b => {
        b.classList.toggle('active', b.dataset.sort === type);
    });
    persistFirms();
}
