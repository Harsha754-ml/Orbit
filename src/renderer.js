// Single Source of Truth
let currentState = {
    config: null,
    themes: [],
    levelStack: [], // Stack of action arrays (nesting history)
    state: 'IDLE',  // IDLE, ACTIVE, TRANSITIONING
    mouseX: 0,
    mouseY: 0,
    parallax: { x: 0, y: 0 },
    activeHoverItem: null
};

const menuContainer = document.getElementById('radial-menu');
const centerPiece = document.getElementById('center-piece');
const rippleContainer = document.getElementById('ripple-container');
const devOverlay = document.getElementById('dev-overlay');
const hoverLabel = document.getElementById('hover-label');

let animationFrame = null;
let clickTimer = null;

async function init() {
    currentState.config = await window.orbitAPI.getConfig();
    currentState.themes = await window.orbitAPI.getThemes();
    
    applyTheme(currentState.config.activeTheme);
    centerPiece.classList.add('idle');

    // Register IPC Triggers
    window.orbitAPI.onConfigUpdated((newConfig) => {
        currentState.config = { ...currentState.config, ...newConfig };
        resetToRoot(); // Hard reset on config change
    });
    
    window.orbitAPI.onThemesUpdated((newThemes) => {
        currentState.themes = newThemes;
        applyTheme(currentState.config.activeTheme);
        renderOrbit(); // Rebuild with new theme colors
    });

    window.orbitAPI.onWindowShown(() => {
        resetToRoot();
    });

    // Centralized Interaction Handlers
    centerPiece.addEventListener('click', (e) => {
        if (e.detail === 1) {
            clickTimer = setTimeout(() => {
                toggleMenu();
            }, 250);
        }
    });
    
    centerPiece.addEventListener('dblclick', (e) => {
        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
        }
        // Visual Feedback
        centerPiece.style.borderColor = 'var(--accent)';
        centerPiece.style.boxShadow = '0 0 50px var(--accent)';
        setTimeout(() => {
            centerPiece.style.borderColor = '';
            centerPiece.style.boxShadow = '';
        }, 200);
        
        openSettings();
    });

    centerPiece.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        centerPiece.style.transform = 'scale(0.95)';
        setTimeout(() => centerPiece.style.transform = '', 100);
        openModal();
    });

    document.body.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.center-piece')) return;
        e.preventDefault();
        goBack();
    });

    document.addEventListener('mousemove', (e) => {
        currentState.mouseX = e.clientX;
        currentState.mouseY = e.clientY;
    });

    document.addEventListener('wheel', (e) => {
        if (currentState.state !== 'IDLE' && e.ctrlKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -10 : 10;
            const newRadius = Math.max(50, Math.min(300, (currentState.config.radius || 100) + delta));
            window.orbitAPI.updateRadius(newRadius);
            // Config update will trigger full rebuild
        }
    }, { passive: false });

    startParallaxLoop();
    renderOrbit(); // Initial empty render
}

// HARD REBUILD RENDERER
function renderOrbit() {
    if (!currentState.config) return;

    // 1. Wipe everything
    menuContainer.innerHTML = '';
    hideHoverLabel();

    // 2. Identify Current Actions
    const currentActions = currentState.levelStack.length > 0 
        ? currentState.levelStack[currentState.levelStack.length - 1] 
        : currentState.config.actions;

    if (currentState.state === 'IDLE') {
        updateCenterState();
        updateOrbitalPaths();
        updateDevOverlay();
        return;
    }

    // 3. Render Items from Scratch
    const count = currentActions.length;
    const radius = currentState.levelStack.length > 0 
        ? (currentState.config.groupRadius || 75) 
        : (currentState.config.radius || 100);

    currentActions.forEach((action, index) => {
        const item = document.createElement('div');
        item.className = `menu-item ${currentState.levelStack.length > 0 ? 'nested-item' : ''}`;
        
        const icon = document.createElement('img');
        const iconPath = `assets/${action.icon || 'default.svg'}`;
        icon.src = iconPath;
        icon.onerror = () => { icon.src = 'assets/terminal.svg'; };
        item.appendChild(icon);
        
        if (currentState.config.devMode) {
            const label = document.createElement('div');
            label.className = 'item-label';
            label.textContent = action.label;
            item.appendChild(label);
        }

        const angle = (index / count) * 2 * Math.PI - Math.PI / 2 + (-15 * Math.PI / 180);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        
        item.dataset.baseX = x;
        item.dataset.baseY = y;
        item.style.left = `calc(50% + ${x}px - var(--item-size)/2)`;
        item.style.top = `calc(50% + ${y}px - var(--item-size)/2)`;
        
        item.onmouseenter = () => {
            if (currentState.config.showHoverLabels) showHoverLabel(action.label);
            currentState.activeHoverItem = item;
        };
        item.onmouseleave = () => {
            hideHoverLabel();
            currentState.activeHoverItem = null;
        };
        
        item.onclick = (e) => {
            e.stopPropagation();
            handleItemClick(action, item);
        };
        
        menuContainer.appendChild(item);
        
        // Finalize appearance
        setTimeout(() => item.classList.add('visible'), index * 10 * (currentState.config.animationSpeed || 1.0));
    });

    // 4. Update UI Context
    updateCenterState();
    updateOrbitalPaths();
    updateDevOverlay();
}

function handleItemClick(action, element) {
    if (action.command === 'ui:open-add-action') {
        openModal();
        return;
    }

    if (action.command && action.command.startsWith('ui:toggle-')) {
        window.orbitAPI.executeAction(action);
        return; // Config change will trigger rebuild
    }

    if (action.type === 'group') {
        if (!action.children || action.children.length === 0) {
            element.classList.add('shake');
            setTimeout(() => element.classList.remove('shake'), 400);
            return;
        }
        enterGroup(action.children);
    } else {
        window.orbitAPI.executeAction(action);
        playSound('execute');
    }
}

// NAVIGATION MODEL
function enterGroup(children) {
    currentState.levelStack.push(children);
    renderOrbit(); // Hard rebuild for nested level
}

function goBack() {
    if (currentState.levelStack.length > 0) {
        currentState.levelStack.pop();
        renderOrbit();
        playSound('collapse');
    } else if (currentState.state !== 'IDLE') {
        closeMenu();
    }
}

function toggleMenu() {
    if (currentState.state === 'IDLE') {
        expandMenu();
    } else {
        closeMenu();
    }
}

function expandMenu() {
    currentState.state = 'ACTIVE';
    createRadialPulse();
    createPulseRing();
    renderOrbit(); // Full reconstruction
    playSound('expand');
}

function closeMenu() {
    currentState.state = 'IDLE';
    currentState.levelStack = [];
    renderOrbit(); // Full reconstruction to empty state
    playSound('collapse');
}

function resetToRoot() {
    currentState.levelStack = [];
    currentState.state = currentState.state === 'IDLE' ? 'IDLE' : 'ACTIVE';
    renderOrbit();
}

function applyTheme(themeName) {
    const theme = currentState.themes.find(t => t.name === themeName);
    if (!theme) return;
    
    const root = document.documentElement;
    root.style.setProperty('--bg-base', theme.base);
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--glow-idle', `rgba(${hexToRgb(theme.accent)}, 0.15)`);
    root.style.setProperty('--glow-primary', `rgba(${hexToRgb(theme.accent)}, 0.5)`);
    root.style.setProperty('--glow-nested', `rgba(${hexToRgb(theme.accent)}, 0.25)`);
    root.style.setProperty('--glow-peak', `rgba(${hexToRgb(theme.accent)}, 0.9)`);
    root.style.setProperty('--blur', theme.blur);
    root.style.setProperty('--anim-speed', theme.speed);
    
    document.documentElement.style.setProperty('--primary-radius', `${currentState.config.primaryRadius || 100}px`);
    document.documentElement.style.setProperty('--group-radius', `${currentState.config.groupRadius || 75}px`);
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0, 191, 255';
}

function updateCenterState() {
    centerPiece.classList.remove('idle', 'expanded', 'child-view');
    if (currentState.state === 'IDLE') {
        centerPiece.classList.add('idle');
    } else if (currentState.levelStack.length > 0) {
        centerPiece.classList.add('child-view');
    } else {
        centerPiece.classList.add('expanded');
    }
}

function updateOrbitalPaths() {
    const primaryPath = document.getElementById('orbital-path-primary');
    const nestedPath = document.getElementById('orbital-path-nested');
    if (!primaryPath || !nestedPath) return;

    if (currentState.state === 'IDLE') {
        primaryPath.classList.remove('visible');
        nestedPath.classList.remove('visible');
    } else if (currentState.levelStack.length > 0) {
        primaryPath.classList.remove('visible');
        nestedPath.classList.add('visible');
    } else {
        primaryPath.classList.add('visible');
        nestedPath.classList.remove('visible');
    }
}

function startParallaxLoop() {
    const loop = () => {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        currentState.parallax.x += (currentState.mouseX - centerX - currentState.parallax.x) * 0.1;
        currentState.parallax.y += (currentState.mouseY - centerY - currentState.parallax.y) * 0.1;
        
        const px = currentState.parallax.x / 50;
        const py = currentState.parallax.y / 50;
        
        centerPiece.style.transform = `translate(${px}px, ${py}px)${currentState.state === 'IDLE' ? '' : ' scale(1)'}`;
        
        if (currentState.state === 'ACTIVE') {
            const items = menuContainer.querySelectorAll('.menu-item');
            items.forEach(item => {
                const bx = parseFloat(item.dataset.baseX);
                const by = parseFloat(item.dataset.baseY);
                const itemX = centerX + bx;
                const itemY = centerY + by;
                const dist = Math.hypot(currentState.mouseX - itemX, currentState.mouseY - itemY);
                
                let scale = 1;
                let offset = 0;
                
                if (dist < 120) {
                    scale = 1 + (120 - dist) / 600;
                    offset = (120 - dist) / 40;
                }
                
                const angle = Math.atan2(currentState.mouseY - itemY, currentState.mouseX - itemX);
                const dx = Math.cos(angle) * offset + px * 0.5;
                const dy = Math.sin(angle) * offset + py * 0.5;
                
                item.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
            });
        }
        
        animationFrame = requestAnimationFrame(loop);
    };
    loop();
}

function updateDevOverlay() {
    if (currentState.config && currentState.config.devMode) {
        devOverlay.style.display = 'block';
        devOverlay.innerHTML = `
            DEPTH: ${currentState.levelStack.length} | 
            ACTIONS: ${menuContainer.childElementCount} | 
            THEME: ${currentState.config.activeTheme} | 
            RADIUS: ${currentState.config.radius}px
        `;
    } else {
        devOverlay.style.display = 'none';
    }
}

function openSettings() {
    const settingsGroup = currentState.config.actions.find(a => a.label === 'Settings');
    if (settingsGroup) {
        if (currentState.state === 'IDLE') expandMenu();
        setTimeout(() => {
            currentState.levelStack = [settingsGroup.children];
            renderOrbit();
        }, 100);
    }
}

// UI Utilities
function showHoverLabel(text) {
    if (!text) return;
    hoverLabel.textContent = text;
    hoverLabel.classList.add('visible');
}

function hideHoverLabel() {
    hoverLabel.classList.remove('visible');
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

function playSound(type) {
    if (!currentState.config.enableSoundEffects) return;
    const audio = document.getElementById(`sound-${type}`);
    if (audio) {
        audio.currentTime = 0;
        audio.volume = 0.5;
        audio.play().catch(() => {});
    }
}

// Dev Modal Handlers
function openModal() { document.getElementById('modal-overlay').style.display = 'flex'; }
function closeModal() { document.getElementById('modal-overlay').style.display = 'none'; }
function submitAction() {
    const label = document.getElementById('action-label').value;
    const path = document.getElementById('action-path').value;
    const icon = document.getElementById('action-icon').value;
    if (!label || !path) return;

    window.orbitAPI.addAction({
        type: 'custom',
        label: label,
        path: path,
        icon: icon || 'terminal.svg'
    });
    closeModal();
}

init();
