// ============================================
// ORBIT RENDERER — Hard Rebuild Architecture
// Single Source of Truth. Clean. Immersive.
// ============================================

// STATE
let currentState = {
    config: null,
    themes: [],
    levelStack: [],
    state: 'IDLE',
    isEditMode: false,
    mouseX: 0,
    mouseY: 0,
    parallax: { x: 0, y: 0 }
};

// DOM REFS (Clean DOM Contract)
const overlay = document.getElementById('orbit-overlay');
const menuContainer = document.getElementById('radial-menu');
const centerPiece = document.getElementById('center-piece');
const rippleContainer = document.getElementById('ripple-container');
const devOverlay = document.getElementById('dev-overlay');
const hoverLabel = document.getElementById('hover-label');
const editModalOverlay = document.getElementById('edit-modal-overlay');

let animationFrame = null;
let clickTimer = null;

// ============================================
// INIT
// ============================================

async function init() {
    currentState.config = await window.orbitAPI.getConfig();
    currentState.themes = await window.orbitAPI.getThemes();

    applyTheme(currentState.config.activeTheme);
    centerPiece.classList.add('idle');

    // IPC Triggers → Hard Rebuild
    window.orbitAPI.onConfigUpdated((newConfig) => {
        currentState.config = { ...currentState.config, ...newConfig };
        applyTheme(currentState.config.activeTheme);
        resetToRoot();
    });

    window.orbitAPI.onThemesUpdated((newThemes) => {
        currentState.themes = newThemes;
        applyTheme(currentState.config.activeTheme);
        renderOrbit();
    });

    window.orbitAPI.onWindowShown(() => {
        resetToRoot();
    });

    // ---- Interaction Handlers ----

    // Single click = toggle menu
    centerPiece.addEventListener('click', (e) => {
        if (currentState.isEditMode) return;
        if (e.detail === 1) {
            clickTimer = setTimeout(() => toggleMenu(), 250);
        }
    });

    // Double click = open settings
    centerPiece.addEventListener('dblclick', () => {
        if (currentState.isEditMode) return;
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        centerPiece.style.borderColor = 'var(--accent)';
        centerPiece.style.boxShadow = '0 0 50px var(--accent)';
        setTimeout(() => { centerPiece.style.borderColor = ''; centerPiece.style.boxShadow = ''; }, 200);
        openSettings();
    });

    // Right click center = open add action modal
    centerPiece.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        centerPiece.style.transform = 'scale(0.94)';
        setTimeout(() => centerPiece.style.transform = '', 120);
        openModal();
    });

    // Right click anywhere else = go back
    document.body.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.center-piece') || e.target.closest('.edit-modal-overlay')) return;
        e.preventDefault();
        goBack();
    });

    // Mouse tracking
    document.addEventListener('mousemove', (e) => {
        currentState.mouseX = e.clientX;
        currentState.mouseY = e.clientY;
    });

    // Ctrl+Wheel = radius adjustment
    document.addEventListener('wheel', (e) => {
        if (currentState.state !== 'IDLE' && e.ctrlKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -10 : 10;
            const nr = Math.max(50, Math.min(300, (currentState.config.radius || 100) + delta));
            window.orbitAPI.updateRadius(nr);
        }
    }, { passive: false });

    // Close modal on overlay click
    editModalOverlay.addEventListener('click', (e) => {
        if (e.target === editModalOverlay) closeModal();
    });

    startParallaxLoop();
    renderOrbit();
}

// ============================================
// HARD REBUILD RENDERER
// ============================================

function renderOrbit() {
    if (!currentState.config) return;

    // 1. Wipe everything
    menuContainer.innerHTML = '';
    hideHoverLabel();

    // 2. Current actions based on levelStack
    const currentActions = currentState.levelStack.length > 0
        ? currentState.levelStack[currentState.levelStack.length - 1]
        : currentState.config.actions;

    // 3. If idle, just update context and bail
    if (currentState.state === 'IDLE') {
        updateCenterState();
        updateDevOverlay();
        return;
    }

    // 4. Render all items from scratch
    const count = currentActions.length;
    const isNested = currentState.levelStack.length > 0;
    const radius = isNested
        ? (currentState.config.groupRadius || 75)
        : (currentState.config.radius || 100);

    currentActions.forEach((action, index) => {
        const item = document.createElement('div');
        item.className = `menu-item${isNested ? ' nested-item' : ''}`;

        // Dynamic Icon System
        const iconEl = createIcon(action);
        item.appendChild(iconEl);

        // Position calculation
        const angle = (index / count) * 2 * Math.PI - Math.PI / 2 + (-15 * Math.PI / 180);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        item.dataset.baseX = x;
        item.dataset.baseY = y;
        item.style.left = `calc(50% + ${x}px - var(--item-size) / 2)`;
        item.style.top = `calc(50% + ${y}px - var(--item-size) / 2)`;

        // Hover label
        item.onmouseenter = () => {
            if (currentState.config.showHoverLabels) showHoverLabel(action.label);
        };
        item.onmouseleave = () => hideHoverLabel();

        // Click
        item.onclick = (e) => {
            e.stopPropagation();
            handleItemClick(action, item);
        };

        menuContainer.appendChild(item);

        // Staggered entrance
        setTimeout(() => item.classList.add('visible'),
            index * 12 * (currentState.config.animationSpeed || 1.0));
    });

    // 5. Update context
    updateCenterState();
    updateDevOverlay();
}

// ============================================
// DYNAMIC ICON SYSTEM
// SVG file → fallback to first-letter glyph
// ============================================

function createIcon(action) {
    const iconFile = action.icon;

    // If icon file specified, try loading it
    if (iconFile && iconFile !== 'default.svg') {
        const img = document.createElement('img');
        img.src = `assets/${iconFile}`;
        img.alt = action.label;
        img.draggable = false;

        // On error: replace with glyph
        img.onerror = () => {
            const glyph = createGlyph(action.label);
            img.replaceWith(glyph);
        };

        return img;
    }

    // No icon → generate glyph
    return createGlyph(action.label);
}

function createGlyph(label) {
    const glyph = document.createElement('div');
    glyph.className = 'glyph-icon';
    glyph.textContent = (label || '?').charAt(0).toUpperCase();
    return glyph;
}

// ============================================
// ACTION HANDLER
// ============================================

function handleItemClick(action, element) {
    if (action.command === 'ui:open-add-action') {
        openModal();
        return;
    }

    if (action.command && action.command.startsWith('ui:toggle-')) {
        window.orbitAPI.executeAction(action);
        return; // Config update triggers rebuild
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

// ============================================
// NAVIGATION
// ============================================

function enterGroup(children) {
    currentState.levelStack.push(children);
    renderOrbit();
}

function goBack() {
    if (currentState.isEditMode) { closeModal(); return; }
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
    renderOrbit();
    playSound('expand');
}

function closeMenu() {
    currentState.state = 'IDLE';
    currentState.levelStack = [];
    renderOrbit();
    playSound('collapse');
}

function resetToRoot() {
    currentState.levelStack = [];
    if (currentState.state !== 'IDLE') currentState.state = 'ACTIVE';
    renderOrbit();
}

// ============================================
// EDIT MODE
// ============================================

function openModal() {
    currentState.isEditMode = true;
    editModalOverlay.classList.add('active');
    document.body.classList.add('edit-mode');
}

function closeModal() {
    currentState.isEditMode = false;
    editModalOverlay.classList.remove('active');
    document.body.classList.remove('edit-mode');
    // Clear inputs
    document.getElementById('action-label').value = '';
    document.getElementById('action-path').value = '';
    document.getElementById('action-icon').value = '';
}

function submitAction() {
    const label = document.getElementById('action-label').value.trim();
    const path = document.getElementById('action-path').value.trim();
    const icon = document.getElementById('action-icon').value.trim();
    if (!label || !path) return;

    window.orbitAPI.addAction({
        type: 'custom',
        label: label,
        path: path,
        icon: icon || ''
    });
    closeModal();
}

// ============================================
// SETTINGS
// ============================================

function openSettings() {
    const settingsGroup = currentState.config.actions.find(a => a.label === 'Settings');
    if (!settingsGroup) return;
    if (currentState.state === 'IDLE') expandMenu();
    setTimeout(() => {
        currentState.levelStack = [settingsGroup.children];
        renderOrbit();
    }, 100);
}

// ============================================
// THEME
// ============================================

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
    root.style.setProperty('--primary-radius', `${currentState.config.primaryRadius || 100}px`);
    root.style.setProperty('--group-radius', `${currentState.config.groupRadius || 75}px`);
}

function hexToRgb(hex) {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? `${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}` : '0, 191, 255';
}

// ============================================
// UI STATE
// ============================================

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

function updateDevOverlay() {
    if (currentState.config && currentState.config.devMode) {
        devOverlay.style.display = 'block';
        const depth = currentState.levelStack.length;
        const count = menuContainer.childElementCount;
        const theme = currentState.config.activeTheme;
        const radius = currentState.config.radius;
        devOverlay.textContent = `DEPTH:${depth} | ITEMS:${count} | THEME:${theme} | R:${radius}px`;
    } else {
        devOverlay.style.display = 'none';
    }
}

// ============================================
// HOVER LABEL
// ============================================

function showHoverLabel(text) {
    if (!text) return;
    hoverLabel.textContent = text;
    hoverLabel.classList.add('visible');
}

function hideHoverLabel() {
    hoverLabel.classList.remove('visible');
}

// ============================================
// EFFECTS
// ============================================

function createRadialPulse() {
    const pulse = document.createElement('div');
    pulse.className = 'radial-ripple';
    rippleContainer.appendChild(pulse);
    setTimeout(() => pulse.remove(), 300);
}

function createPulseRing() {
    const ring = document.createElement('div');
    ring.className = 'pulse-ring';
    ring.style.width = 'var(--center-size)';
    ring.style.height = 'var(--center-size)';
    centerPiece.appendChild(ring);
    setTimeout(() => ring.remove(), 400);
}

function playSound(type) {
    if (!currentState.config || !currentState.config.enableSoundEffects) return;
    const audio = document.getElementById(`sound-${type}`);
    if (audio) {
        audio.currentTime = 0;
        audio.volume = 0.4;
        audio.play().catch(() => {});
    }
}

// ============================================
// PARALLAX LOOP
// ============================================

function startParallaxLoop() {
    const loop = () => {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;

        currentState.parallax.x += (currentState.mouseX - cx - currentState.parallax.x) * 0.08;
        currentState.parallax.y += (currentState.mouseY - cy - currentState.parallax.y) * 0.08;

        const px = currentState.parallax.x / 50;
        const py = currentState.parallax.y / 50;

        // Center parallax
        if (!currentState.isEditMode) {
            centerPiece.style.transform = `translate(${px}px, ${py}px)`;
        }

        // Item proximity scaling
        if (currentState.state === 'ACTIVE' && !currentState.isEditMode) {
            const items = menuContainer.querySelectorAll('.menu-item');
            items.forEach(item => {
                const bx = parseFloat(item.dataset.baseX);
                const by = parseFloat(item.dataset.baseY);
                const ix = cx + bx;
                const iy = cy + by;
                const dist = Math.hypot(currentState.mouseX - ix, currentState.mouseY - iy);

                let scale = 1;
                let offset = 0;

                if (dist < 110) {
                    scale = 1 + (110 - dist) / 600;
                    offset = (110 - dist) / 45;
                }

                const angle = Math.atan2(currentState.mouseY - iy, currentState.mouseX - ix);
                const dx = Math.cos(angle) * offset + px * 0.4;
                const dy = Math.sin(angle) * offset + py * 0.4;

                item.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
            });
        }

        animationFrame = requestAnimationFrame(loop);
    };
    loop();
}

// ============================================
// BOOT
// ============================================

init();
