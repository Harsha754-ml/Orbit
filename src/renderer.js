// ============================================
// ORBIT RENDERER — Click-Through Architecture
// Transparent window. Radial-only interaction.
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
    parallax: { x: 0, y: 0 },
    radialCenter: { x: 0, y: 0 }, // Where the radial spawned (pixel coords)
    cursorInBounds: false
};

// DOM REFS
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

    // IPC
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

    window.orbitAPI.onWindowShown((cursorPoint) => {
        // Position radial at cursor
        currentState.radialCenter.x = cursorPoint.x;
        currentState.radialCenter.y = cursorPoint.y;
        setRadialPosition(cursorPoint.x, cursorPoint.y);
        resetToRoot();
        expandMenu();
    });

    // ---- Events ----

    centerPiece.addEventListener('click', (e) => {
        if (currentState.isEditMode) return;
        if (e.detail === 1) {
            clickTimer = setTimeout(() => toggleMenu(), 250);
        }
    });

    centerPiece.addEventListener('dblclick', () => {
        if (currentState.isEditMode) return;
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        centerPiece.style.borderColor = 'var(--accent)';
        centerPiece.style.boxShadow = '0 0 50px var(--accent)';
        setTimeout(() => { centerPiece.style.borderColor = ''; centerPiece.style.boxShadow = ''; }, 200);
        openSettings();
    });

    centerPiece.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        centerPiece.style.transform = 'translate(-50%, -50%) scale(0.94)';
        setTimeout(() => centerPiece.style.transform = 'translate(-50%, -50%)', 120);
        openModal();
    });

    document.body.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.center-piece') || e.target.closest('.edit-modal-overlay')) return;
        e.preventDefault();
        goBack();
    });

    // Mouse tracking + hit detection for click-through
    document.addEventListener('mousemove', (e) => {
        currentState.mouseX = e.clientX;
        currentState.mouseY = e.clientY;
        updateHitDetection(e.clientX, e.clientY);
    });

    document.addEventListener('wheel', (e) => {
        if (currentState.state !== 'IDLE' && e.ctrlKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -10 : 10;
            const nr = Math.max(50, Math.min(300, (currentState.config.radius || 100) + delta));
            window.orbitAPI.updateRadius(nr);
        }
    }, { passive: false });

    editModalOverlay.addEventListener('click', (e) => {
        if (e.target === editModalOverlay) closeModal();
    });

    startParallaxLoop();
    renderOrbit();
}

// ============================================
// HIT DETECTION — Toggle click-through
// ============================================

function updateHitDetection(mx, my) {
    if (currentState.state === 'IDLE' && !currentState.isEditMode) {
        // Window should be fully click-through when idle
        if (currentState.cursorInBounds) {
            currentState.cursorInBounds = false;
            window.orbitAPI.setIgnoreMouse(true);
        }
        return;
    }

    // Edit mode — entire modal area is interactive
    if (currentState.isEditMode) {
        if (!currentState.cursorInBounds) {
            currentState.cursorInBounds = true;
            window.orbitAPI.setIgnoreMouse(false);
        }
        return;
    }

    // Active mode — check if cursor is within radial bounds
    const cx = currentState.radialCenter.x;
    const cy = currentState.radialCenter.y;
    const radius = currentState.levelStack.length > 0
        ? (currentState.config.groupRadius || 75)
        : (currentState.config.radius || 100);
    const hitRadius = radius + 60; // Extra padding for item hover

    const dist = Math.hypot(mx - cx, my - cy);
    const isInside = dist <= hitRadius;

    if (isInside && !currentState.cursorInBounds) {
        currentState.cursorInBounds = true;
        window.orbitAPI.setIgnoreMouse(false);
    } else if (!isInside && currentState.cursorInBounds) {
        currentState.cursorInBounds = false;
        window.orbitAPI.setIgnoreMouse(true);
        // Close menu when cursor leaves radial zone
        closeMenu();
    }
}

// ============================================
// RADIAL POSITIONING
// ============================================

function setRadialPosition(x, y) {
    const root = document.documentElement;
    root.style.setProperty('--radial-x', `${x}px`);
    root.style.setProperty('--radial-y', `${y}px`);
    root.style.setProperty('--overlay-active', '1');
}

function clearRadialPosition() {
    document.documentElement.style.setProperty('--overlay-active', '0');
}

// ============================================
// HARD REBUILD RENDERER
// ============================================

function renderOrbit() {
    if (!currentState.config) return;

    menuContainer.innerHTML = '';
    hideHoverLabel();

    const currentActions = currentState.levelStack.length > 0
        ? currentState.levelStack[currentState.levelStack.length - 1]
        : currentState.config.actions;

    if (currentState.state === 'IDLE') {
        clearRadialPosition();
        updateCenterState();
        updateDevOverlay();
        return;
    }

    const count = currentActions.length;
    const isNested = currentState.levelStack.length > 0;
    const radius = isNested
        ? (currentState.config.groupRadius || 75)
        : (currentState.config.radius || 100);

    const cx = currentState.radialCenter.x;
    const cy = currentState.radialCenter.y;

    currentActions.forEach((action, index) => {
        const item = document.createElement('div');
        item.className = `menu-item${isNested ? ' nested-item' : ''}`;

        // Dynamic Icon
        const iconEl = createIcon(action);
        item.appendChild(iconEl);

        // Position around radial center
        const angle = (index / count) * 2 * Math.PI - Math.PI / 2 + (-15 * Math.PI / 180);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        item.dataset.baseX = x;
        item.dataset.baseY = y;
        item.style.left = `${cx + x - 23}px`; // 23 = item-size/2
        item.style.top = `${cy + y - 23}px`;

        item.onmouseenter = () => {
            if (currentState.config.showHoverLabels) showHoverLabel(action.label);
        };
        item.onmouseleave = () => hideHoverLabel();

        item.onclick = (e) => {
            e.stopPropagation();
            handleItemClick(action, item);
        };

        menuContainer.appendChild(item);
        setTimeout(() => item.classList.add('visible'),
            index * 12 * (currentState.config.animationSpeed || 1.0));
    });

    updateCenterState();
    updateDevOverlay();
}

// ============================================
// DYNAMIC ICON SYSTEM
// ============================================

function createIcon(action) {
    const iconFile = action.icon;

    if (iconFile && iconFile !== 'default.svg') {
        const img = document.createElement('img');
        img.src = `assets/${iconFile}`;
        img.alt = action.label;
        img.draggable = false;
        img.onerror = () => {
            const glyph = createGlyph(action.label);
            img.replaceWith(glyph);
        };
        return img;
    }

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
        return;
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
    // Ensure mouse interaction is enabled
    currentState.cursorInBounds = true;
    window.orbitAPI.setIgnoreMouse(false);
    createRadialPulse();
    createPulseRing();
    renderOrbit();
    playSound('expand');
}

function closeMenu() {
    currentState.state = 'IDLE';
    currentState.levelStack = [];
    currentState.cursorInBounds = false;
    window.orbitAPI.setIgnoreMouse(true);
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
    window.orbitAPI.setIgnoreMouse(false);
}

function closeModal() {
    currentState.isEditMode = false;
    editModalOverlay.classList.remove('active');
    document.body.classList.remove('edit-mode');
    document.getElementById('action-label').value = '';
    document.getElementById('action-path').value = '';
    document.getElementById('action-icon').value = '';
    // Restore hit detection state
    updateHitDetection(currentState.mouseX, currentState.mouseY);
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
        devOverlay.textContent = `DEPTH:${currentState.levelStack.length} | ITEMS:${menuContainer.childElementCount} | THEME:${currentState.config.activeTheme} | R:${currentState.config.radius}px`;
    } else {
        devOverlay.style.display = 'none';
    }
}

// ============================================
// HOVER LABEL
// ============================================

function showHoverLabel(text) {
    if (!text) return;
    const cx = currentState.radialCenter.x;
    const cy = currentState.radialCenter.y;
    hoverLabel.style.left = `${cx}px`;
    hoverLabel.style.top = `${cy - 60}px`;
    hoverLabel.style.transform = 'translate(-50%, -100%)';
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
    pulse.style.left = `${currentState.radialCenter.x - 36}px`;
    pulse.style.top = `${currentState.radialCenter.y - 36}px`;
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
        const cx = currentState.radialCenter.x;
        const cy = currentState.radialCenter.y;

        currentState.parallax.x += (currentState.mouseX - cx - currentState.parallax.x) * 0.08;
        currentState.parallax.y += (currentState.mouseY - cy - currentState.parallax.y) * 0.08;

        const px = currentState.parallax.x / 60;
        const py = currentState.parallax.y / 60;

        // Center parallax
        if (!currentState.isEditMode && currentState.state !== 'IDLE') {
            centerPiece.style.left = `${cx + px}px`;
            centerPiece.style.top = `${cy + py}px`;
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

                if (dist < 100) {
                    scale = 1 + (100 - dist) / 600;
                    offset = (100 - dist) / 50;
                }

                const angle = Math.atan2(currentState.mouseY - iy, currentState.mouseX - ix);
                const dx = Math.cos(angle) * offset + px * 0.3;
                const dy = Math.sin(angle) * offset + py * 0.3;

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
