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
    currentContext: 'unknown',
    isEditMode: false,
    mouseX: 0,
    mouseY: 0,
    parallax: { x: 0, y: 0 },
    radialCenter: { x: 0, y: 0 }, // Where the radial spawned (pixel coords)
    cursorInBounds: false,
    contextMenu: {
        visible: false,
        selectedAction: null,
        targetElement: null
    },
    palette: {
        visible: false,
        results: [],
        selectedIndex: 0
    },
    gestures: {
        startX: 0,
        startY: 0,
        startTime: 0,
        tracking: false
    }
};

// DOM REFS
const overlay = document.getElementById('orbit-overlay');
const menuContainer = document.getElementById('radial-menu');
const centerPiece = document.getElementById('center-piece');
const rippleContainer = document.getElementById('ripple-container');
const devOverlay = document.getElementById('dev-overlay');
const hoverLabel = document.getElementById('hover-label');
const editModalOverlay = document.getElementById('edit-modal-overlay');
const iconContextMenu = document.getElementById('icon-context-menu');

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

    // Orbit 2.0 Context Updates
    window.ipcRenderer?.on('context-update', (event, data) => {
        currentState.currentContext = data.processName;
        if (currentState.config.devMode) updateDebugOverlay();
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
        if (e.target.closest('.center-piece') || 
            e.target.closest('.menu-item') || 
            e.target.closest('.icon-context-menu') || 
            e.target.closest('.edit-modal-overlay')) {
            return;
        }
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
    // Initial state setup
    window.orbitAPI.setState('idle');

    document.addEventListener('mousemove', (e) => {
        currentState.mouseX = e.clientX;
        currentState.mouseY = e.clientY;
        updateHitDetection(e.clientX, e.clientY);
        
        if (currentState.config.devMode) {
            updateDebugOverlay();
        }
    });

    document.addEventListener('mousedown', (e) => {
        if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
            // Hotkey logic handled by AHK, but can be simulated here
        }
    });

    window.orbitAPI.onWindowShown((data) => {
        const { x, y } = data;
        currentState.radialCenter = { x, y };
        currentState.gestures.startX = x;
        currentState.gestures.startY = y;
        currentState.gestures.startTime = Date.now();
        currentState.gestures.tracking = true;
        expandMenu();
    });

    window.addEventListener('mousemove', (e) => {
        if (currentState.gestures.tracking && currentState.state === 'EXPANDING') {
            handleGesture(e.clientX, e.clientY);
        }
    });

    function handleGesture(x, y) {
        const dx = x - currentState.gestures.startX;
        const dy = y - currentState.gestures.startY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const elapsed = Date.now() - currentState.gestures.startTime;

        if (dist > 80 && elapsed < 250) {
            // Fast swipe detected
            currentState.gestures.tracking = false;
            const angle = Math.atan2(dy, dx);
            triggerSwipeAction(angle);
        }
    }

    function triggerSwipeAction(angle) {
        // Find closest item by angle
        const items = document.querySelectorAll('.menu-item');
        let closest = null;
        let minDist = Infinity;

        items.forEach(item => {
            const ix = parseFloat(item.dataset.baseX);
            const iy = parseFloat(item.dataset.baseY);
            const iAngle = Math.atan2(iy, ix);
            let diff = Math.abs(angle - iAngle);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            
            if (diff < minDist) {
                minDist = diff;
                closest = item;
            }
        });

        if (closest && minDist < 0.6) {
            closest.click();
            logger.info('gesture_triggered', { angle: angle.toFixed(2) });
        }
    }

    window.ipcRenderer?.on('ping-health', () => {
        window.ipcRenderer.send('pong-health');
    });

    editModalOverlay.addEventListener('click', (e) => {
        if (e.target === editModalOverlay) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && e.ctrlKey) {
            e.preventDefault();
            togglePalette();
        }
        if (currentState.palette.visible) {
            handlePaletteKey(e);
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.icon-context-menu') && !e.target.closest('.palette-container')) {
             hideContextMenu();
             if (currentState.palette.visible) hidePalette();
        }
    });

    document.addEventListener('scroll', () => hideContextMenu(), { capture: true });

    startParallaxLoop();
    renderOrbit();
}

function updateDebugOverlay() {
    const debugPanel = document.getElementById('debug-panel');
    if (!debugPanel) return;
    
    debugPanel.classList.add('active');
    debugPanel.innerHTML = `
        <div class="debug-title">Orbit State Telemetry</div>
        <div class="debug-row"><span>State:</span> <b>${currentState.state}</b></div>
        <div class="debug-row"><span>Context:</span> ${currentState.currentContext}</div>
        <div class="debug-row"><span>X:</span> ${currentState.mouseX}</div>
        <div class="debug-row"><span>Y:</span> ${currentState.mouseY}</div>
        <div class="debug-row"><span>InBounds:</span> ${currentState.cursorInBounds}</div>
    `;
}

// ============================================
// HIT DETECTION — Toggle click-through
// ============================================

function updateHitDetection(mx, my) {
    // Determine if window should be interactive
    let shouldIgnore = true;

    if (currentState.isEditMode || currentState.contextMenu.visible) {
        shouldIgnore = false;
    } else if (currentState.state !== 'IDLE') {
        // Active mode — check if cursor is within radial bounds
        const cx = currentState.radialCenter.x;
        const cy = currentState.radialCenter.y;
        const radius = currentState.levelStack.length > 0
            ? (currentState.config.groupRadius || 75)
            : (currentState.config.radius || 100);
        const hitRadius = radius + 60; // Extra padding for item hover

        const dist = Math.hypot(mx - cx, my - cy);
        const isInside = dist <= hitRadius;

        if (isInside) {
            shouldIgnore = false;
        } else {
            // Close menu when cursor leaves radial zone
            if (currentState.state === 'ACTIVE') {
                 closeMenu();
            }
        }
    }

    // Only send IPC if state actually changed
    if (shouldIgnore !== (currentState.cursorInBounds === false)) {
        currentState.cursorInBounds = !shouldIgnore;
        window.orbitAPI.send('toggle-mouse', shouldIgnore);
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

    // Orbit 2.0: Contextual Action Overrides (Placeholder)
    // If context == 'code', we could filter or prepend specific actions here.

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
        item.dataset.action = JSON.stringify(action); // Store action data for later retrieval

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

        item.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(action, e.clientX, e.clientY, item);
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
    window.orbitAPI.setState('expanding');
    currentState.state = 'EXPANDING';
    const menuContainer = document.getElementById('radial-menu');
    menuContainer.innerHTML = '';
    
    // Position menu
    menuContainer.style.left = `${currentState.radialCenter.x}px`;
    menuContainer.style.top = `${currentState.radialCenter.y}px`;
    menuContainer.classList.add('active');

    const getVisibleActions = () => { // Helper function to get actions
        return currentState.levelStack.length > 0
            ? currentState.levelStack[currentState.levelStack.length - 1]
            : currentState.config.actions;
    };
    const actions = getVisibleActions();
    
    actions.forEach((action, index) => {
        const item = document.createElement('div'); // Re-creating item here as createMenuItem is not defined in the prompt
        item.className = `menu-item${currentState.levelStack.length > 0 ? ' nested-item' : ''}`;

        // Dynamic Icon
        const iconEl = createIcon(action);
        item.appendChild(iconEl);

        // Position around radial center (re-using logic from renderOrbit)
        const count = actions.length;
        const isNested = currentState.levelStack.length > 0;
        const radius = isNested
            ? (currentState.config.groupRadius || 75)
            : (currentState.config.radius || 100);
        const angle = (index / count) * 2 * Math.PI - Math.PI / 2 + (-15 * Math.PI / 180);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        item.dataset.baseX = x;
        item.dataset.baseY = y;
        item.style.left = `${currentState.radialCenter.x + x - 23}px`; // 23 = item-size/2
        item.style.top = `${currentState.radialCenter.y + y - 23}px`;

        item.onmouseenter = () => {
            if (currentState.config.showHoverLabels) showHoverLabel(action.label);
        };
        item.onmouseleave = () => hideHoverLabel();

        item.onclick = (e) => {
            e.stopPropagation();
            handleItemClick(action, item);
        };

        item.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(action, e.clientX, e.clientY, item);
        };

        menuContainer.appendChild(item);
        
        setTimeout(() => item.classList.add('visible'), 
            index * 12 * (currentState.config.animationSpeed || 1.0));
    });

    const expandDuration = Math.min(actions.length * 15, 300);
    setTimeout(() => {
        currentState.state = 'ACTIVE';
        window.orbitAPI.setState('active');
    }, expandDuration);
}

function closeMenu() {
    if (currentState.state !== 'ACTIVE') return;
    
    window.orbitAPI.setState('collapsing');
    currentState.state = 'COLLAPSING';
    const menuContainer = document.getElementById('radial-menu');
    const items = menuContainer.querySelectorAll('.menu-item');
    
    items.forEach((item, index) => {
        setTimeout(() => item.classList.remove('visible'), index * 8);
    });

    setTimeout(() => {
        menuContainer.classList.remove('active');
        currentState.state = 'IDLE';
        currentState.levelStack = [];
        window.orbitAPI.setState('idle');
    }, 250);
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

function createMenuItem(action) {
    const item = document.createElement('div');
    item.className = `menu-item ${currentState.levelStack.length > 0 ? 'nested-item' : ''}`;
    
    const iconEl = createIcon(action);
    item.appendChild(iconEl);

    item.onmouseenter = () => {
        if (currentState.config.showHoverLabels) showHoverLabel(action.label);
    };
    item.onmouseleave = () => hideHoverLabel();
    item.onclick = (e) => { e.stopPropagation(); handleItemClick(action, item); };
    item.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(action, e.clientX, e.clientY, item);
    };
    return item;
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
// ICON MANAGEMENT (CONTEXT MENU)
// ============================================

function showContextMenu(action, x, y, element) {
    currentState.contextMenu.selectedAction = action;
    currentState.contextMenu.targetElement = element;
    currentState.contextMenu.visible = true;

    iconContextMenu.style.left = `${x}px`;
    iconContextMenu.style.top = `${y}px`;
    iconContextMenu.classList.add('active');
    
    // Ensure it doesn't go off screen
    const rect = iconContextMenu.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) iconContextMenu.style.left = `${x - rect.width}px`;
    if (y + rect.height > window.innerHeight) iconContextMenu.style.top = `${y - rect.height}px`;

    window.orbitAPI.setIgnoreMouse(false);
}

function hideContextMenu() {
    if (!currentState.contextMenu.visible) return;
    currentState.contextMenu.visible = false;
    iconContextMenu.classList.remove('active');
    updateHitDetection(currentState.mouseX, currentState.mouseY);
}

async function handleContextMenuAction(type) {
    const action = currentState.contextMenu.selectedAction;
    if (!action) return;

    hideContextMenu();

    if (type === 'delete') {
        if (confirm(`Delete "${action.label}"?`)) {
            removeActionFromConfig(action);
        }
    } else if (type === 'nest') {
        const groupName = prompt('Enter group name to nest into (will create if doesn\'t exist):');
        if (groupName) {
            nestActionIntoGroup(action, groupName);
        }
    } else if (type === 'move') {
        alert('Move mode: In a future update, you will be able to drag and drop or select a target group from a list.');
    }
}

function removeActionFromConfig(targetAction) {
    const filterActions = (actions) => {
        return actions.filter(a => a !== targetAction).map(a => {
            if (a.type === 'group' && a.children) {
                return { ...a, children: filterActions(a.children) };
            }
            return a;
        });
    };

    const newActions = filterActions(currentState.config.actions);
    window.orbitAPI.updateConfig({ actions: newActions });
}

function nestActionIntoGroup(targetAction, groupName) {
    // 1. Remove from current position
    const actionsWithoutItem = (actions) => {
        return actions.filter(a => a !== targetAction).map(a => {
            if (a.type === 'group' && a.children) {
                return { ...a, children: actionsWithoutItem(a.children) };
            }
            return a;
        });
    };

    let newActions = actionsWithoutItem(currentState.config.actions);

    // 2. Find or create group at root for simplicity in this version
    let group = newActions.find(a => a.type === 'group' && a.label.toLowerCase() === groupName.toLowerCase());
    
    if (group) {
        group.children.push(targetAction);
    } else {
        newActions.push({
            type: 'group',
            label: groupName,
            icon: 'custom.svg',
            children: [targetAction]
        });
    }

    window.orbitAPI.updateConfig({ actions: newActions });
}

function togglePalette() {
    if (currentState.palette.visible) hidePalette();
    else showPalette();
}

function showPalette() {
    currentState.palette.visible = true;
    const palette = document.getElementById('command-palette');
    const input = document.getElementById('palette-search');
    palette.classList.add('active');
    input.value = '';
    input.focus();
    renderPaletteResults('');
    window.orbitAPI.send('toggle-mouse', false);
}

function hidePalette() {
    currentState.palette.visible = false;
    document.getElementById('command-palette').classList.remove('active');
    updateHitDetection(currentState.mouseX, currentState.mouseY);
}

function handlePaletteKey(e) {
    if (e.key === 'Escape') hidePalette();
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        currentState.palette.selectedIndex = (currentState.palette.selectedIndex + 1) % currentState.palette.results.length;
        renderPaletteResults(document.getElementById('palette-search').value);
    }
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        currentState.palette.selectedIndex = (currentState.palette.selectedIndex - 1 + currentState.palette.results.length) % currentState.palette.results.length;
        renderPaletteResults(document.getElementById('palette-search').value);
    }
    if (e.key === 'Enter') {
        const selected = currentState.palette.results[currentState.palette.selectedIndex];
        if (selected) {
            handleItemClick(selected);
            hidePalette();
        }
    }
}

document.getElementById('palette-search').addEventListener('input', (e) => {
    currentState.palette.selectedIndex = 0;
    renderPaletteResults(e.target.value);
});

async function renderPaletteResults(query) {
    const resultsContainer = document.getElementById('palette-results');
    
    // Orbit 2.0 simple fuzzy match (Internal logic)
    const allActions = flattenActions(currentState.config.actions);
    const scored = allActions.map(a => ({
        action: a,
        score: scoreMatch(query, a.label)
    })).filter(r => r.score > 0).sort((a,b) => b.score - a.score);

    currentState.palette.results = scored.map(r => r.action);
    resultsContainer.innerHTML = '';
    
    currentState.palette.results.slice(0, 10).forEach((action, idx) => {
        const item = document.createElement('div');
        item.className = `palette-item ${idx === currentState.palette.selectedIndex ? 'selected' : ''}`;
        item.innerHTML = `
            <div class="label">${action.label}</div>
            <div style="opacity:0.4; font-size:12px">${action.type === 'group' ? '📁 Group' : '🚀 App'}</div>
        `;
        item.onclick = () => { handleItemClick(action); hidePalette(); };
        resultsContainer.appendChild(item);
    });
}

function flattenActions(actions) {
    let flat = [];
    actions.forEach(a => {
        flat.push(a);
        if (a.children) flat = flat.concat(flattenActions(a.children));
    });
    return flat;
}

function scoreMatch(query, target) {
    if (!query) return 1;
    query = query.toLowerCase();
    target = target.toLowerCase();
    if (target === query) return 100;
    if (target.startsWith(query)) return 50;
    if (target.includes(query)) return 10;
    return 0; // Simple for now
}

init();
