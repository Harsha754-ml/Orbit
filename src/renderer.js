let config = null;
let themes = [];
let currentGroup = null;
let history = [];
let state = 'IDLE'; // IDLE, EXPANDING, ACTIVE, COLLAPSING

let mouseX = 0, mouseY = 0;
let parallaxX = 0, parallaxY = 0;
let animationFrame = null;

const menuContainer = document.getElementById('radial-menu');
const centerPiece = document.getElementById('center-piece');
const rippleContainer = document.getElementById('ripple-container');
const devOverlay = document.getElementById('dev-overlay');

async function init() {
    config = await window.orbitAPI.getConfig();
    themes = await window.orbitAPI.getThemes();
    
    // Set initial radii if not defined
    if (!config.primaryRadius) config.primaryRadius = 120;
    if (!config.groupRadius) config.groupRadius = 100;

    applyTheme(config.activeTheme);
    centerPiece.classList.add('idle');

    window.orbitAPI.onConfigUpdated((newConfig) => {
        config = { ...config, ...newConfig };
        updateDevOverlay();
        applyTheme(config.activeTheme);
    });
    
    window.orbitAPI.onThemesUpdated((newThemes) => {
        themes = newThemes;
        applyTheme(config.activeTheme);
    });

    window.orbitAPI.onWindowShown(() => {
        resetToRoot();
    });

    centerPiece.addEventListener('click', toggleMenu);
    document.body.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        goBack();
    });

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    startParallaxLoop();
    updateDevOverlay();
}

function applyTheme(themeName) {
    const theme = themes.find(t => t.name === themeName);
    if (!theme) return;
    
    const root = document.documentElement;
    root.style.setProperty('--bg-base', theme.base);
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--glow-idle', `rgba(${hexToRgb(theme.accent)}, 0.2)`);
    root.style.setProperty('--glow-hover', `rgba(${hexToRgb(theme.accent)}, 0.6)`);
    root.style.setProperty('--glow-peak', `rgba(${hexToRgb(theme.accent)}, 0.9)`);
    root.style.setProperty('--blur', theme.blur);
    root.style.setProperty('--anim-speed', theme.speed);
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0, 191, 255';
}

function updateCenterState() {
    centerPiece.classList.remove('idle', 'expanded', 'child-view');
    if (state === 'IDLE') {
        centerPiece.classList.add('idle');
    } else if (history.length > 0) {
        centerPiece.classList.add('child-view');
    } else {
        centerPiece.classList.add('expanded');
    }
}

function toggleMenu() {
    if (state === 'IDLE') {
        expandMenu();
    } else {
        closeMenu();
    }
}

function expandMenu() {
    createRadialPulse();
    createPulseRing();
    renderGroup(config.actions, config.primaryRadius);
    playSound('expand');
    updateCenterState();
}

function renderGroup(actions, radius, isMorphing = false) {
    state = isMorphing ? state : 'EXPANDING';
    
    // Clear item-level parallax and scale before re-rendering
    menuContainer.innerHTML = '';
    currentGroup = actions;
    
    const count = actions.length;
    
    actions.forEach((action, index) => {
        const item = document.createElement('div');
        item.className = 'menu-item';
        
        const icon = document.createElement('img');
        icon.src = `assets/${action.icon || 'default.svg'}`;
        item.appendChild(icon);
        
        if (config.devMode) {
            const label = document.createElement('div');
            label.className = 'item-label';
            label.textContent = action.label;
            item.appendChild(label);
        }
        
        const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        
        item.dataset.baseX = x;
        item.dataset.baseY = y;
        item.style.left = `calc(50% + ${x}px - var(--item-size)/2)`;
        item.style.top = `calc(50% + ${y}px - var(--item-size)/2)`;
        
        item.onclick = () => handleItemClick(action);
        
        menuContainer.appendChild(item);
        
        // Staggered entry
        setTimeout(() => {
            item.classList.add('visible');
            if (index === count - 1) state = 'ACTIVE';
        }, index * 12 * (config.animationSpeed || 1.0));
    });
}

function handleItemClick(action) {
    if (action.type === 'group') {
        history.push(currentGroup);
        if (history.length > (config.nestingDepthLimit || 5)) return;
        morphToGroup(action.children);
    } else {
        window.orbitAPI.executeAction(action);
        playSound('execute');
    }
}

function morphToGroup(children) {
    state = 'COLLAPSING';
    const items = menuContainer.querySelectorAll('.menu-item');
    
    // Apple-style morph: current items shrink and fade
    items.forEach(item => {
        item.classList.remove('visible');
        item.classList.add('parent-morph');
    });
    
    setTimeout(() => {
        renderGroup(children, config.groupRadius, true);
        updateCenterState();
    }, 150 * (config.animationSpeed || 1.0));
}

function goBack() {
    if (history.length > 0) {
        const previous = history.pop();
        morphToGroup(previous);
        playSound('collapse');
    } else if (state !== 'IDLE') {
        closeMenu();
    }
}

function closeMenu() {
    state = 'COLLAPSING';
    const items = menuContainer.querySelectorAll('.menu-item');
    items.forEach(item => {
        item.classList.remove('visible');
        item.classList.add('collapsing');
    });
    
    setTimeout(() => {
        menuContainer.innerHTML = '';
        state = 'IDLE';
        history = [];
        updateCenterState();
    }, 200 * (config.animationSpeed || 1.0));
    playSound('collapse');
}

function resetToRoot() {
    menuContainer.innerHTML = '';
    state = 'IDLE';
    history = [];
    updateCenterState();
    expandMenu();
}

function createRadialPulse() {
    const pulse = document.createElement('div');
    pulse.className = 'radial-ripple';
    rippleContainer.appendChild(pulse);
    setTimeout(() => pulse.remove(), 250);
}

function createPulseRing() {
    const ring = document.createElement('div');
    ring.className = 'pulse-ring';
    ring.style.width = 'var(--center-size)';
    ring.style.height = 'var(--center-size)';
    centerPiece.appendChild(ring);
    setTimeout(() => ring.remove(), 350);
}

function startParallaxLoop() {
    const loop = () => {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        // Soften the parallax transition
        parallaxX += (mouseX - centerX - parallaxX) * 0.1;
        parallaxY += (mouseY - centerY - parallaxY) * 0.1;
        
        const px = parallaxX / 50;
        const py = parallaxY / 50;
        
        // Center parallax
        centerPiece.style.transform = `translate(${px}px, ${py}px)${state === 'IDLE' ? '' : ' scale(1)'}`;
        
        if (state === 'ACTIVE' || state === 'EXPANDING') {
            const items = menuContainer.querySelectorAll('.menu-item:not(.parent-morph):not(.collapsing)');
            items.forEach(item => {
                const bx = parseFloat(item.dataset.baseX);
                const by = parseFloat(item.dataset.baseY);
                
                // Micro-parallax logic (2-4px)
                const itemX = centerX + bx;
                const itemY = centerY + by;
                const dist = Math.hypot(mouseX - itemX, mouseY - itemY);
                
                let scale = 1;
                let offset = 0;
                
                if (dist < 120) {
                    scale = 1 + (120 - dist) / 600;
                    offset = (120 - dist) / 40; // 3px max
                }
                
                const angle = Math.atan2(mouseY - itemY, mouseX - itemX);
                const dx = Math.cos(angle) * offset + px * 0.5;
                const dy = Math.sin(angle) * offset + py * 0.5;
                
                item.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
            });
        }
        
        animationFrame = requestAnimationFrame(loop);
    };
    loop();
}

function playSound(type) {
    if (config.enableSoundEffects) {
        window.orbitAPI.playSound(type);
    }
}

function updateDevOverlay() {
    if (config && config.devMode) {
        devOverlay.style.display = 'block';
        devOverlay.innerHTML = `STATE: ${state} | DEPTH: ${history.length} | PARALLAX: ${parallaxX.toFixed(1)},${parallaxY.toFixed(1)}`;
    } else {
        devOverlay.style.display = 'none';
    }
}

init();
