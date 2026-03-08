// ============================================
// ORBIT RENDERER — Click-Through Architecture
// Transparent window. Radial-only interaction.
// ============================================

/**
 * Integrated Layout Engine Logics (from lib/layoutEngine.js)
 */
function computeLayout(itemCount, baseRadius) {
    // Sync with layoutEngine.js multi-ring strategy
    const positions = [];
    const rotationOffset = -Math.PI / 2;
    const rings = [];

    if (itemCount <= 8) {
        rings.push({ count: itemCount, radius: baseRadius });
    } else if (itemCount <= 18) {
        const innerCount = Math.floor(itemCount * 0.4);
        const outerCount = itemCount - innerCount;
        rings.push({ count: innerCount, radius: baseRadius * 0.6 });
        rings.push({ count: outerCount, radius: baseRadius + (outerCount - 8) * 4 });
    } else {
        const innerCount = Math.floor(itemCount * 0.2);
        const midCount = Math.floor(itemCount * 0.35);
        const outerCount = itemCount - innerCount - midCount;
        rings.push({ count: innerCount, radius: baseRadius * 0.5 });
        rings.push({ count: midCount, radius: baseRadius * 1.0 });
        rings.push({ count: outerCount, radius: baseRadius * 1.6 });
    }

    let processedItems = 0;
    rings.forEach((ring, ringIdx) => {
        const angleStep = (2 * Math.PI) / ring.count;
        const ringOffset = rotationOffset + (ringIdx * (Math.PI / 8));

        for (let i = 0; i < ring.count; i++) {
            if (processedItems >= itemCount) break;
            const angle = ringOffset + (i * angleStep);
            positions.push({
                x: Math.cos(angle) * ring.radius,
                y: Math.sin(angle) * ring.radius,
                angle: angle,
                radius: ring.radius
            });
            processedItems++;
        }
    });

    return positions;
}

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
let isInitialized = false;
let initPromise = null;


// ============================================
// IPC LISTENERS (Top-level for immediate response)
// ============================================

window.orbitAPI.onConfigUpdated((newConfig) => {
    currentState.config = { ...currentState.config, ...newConfig };
    applyTheme(currentState.config.activeTheme);
    resetToRoot();
});

window.orbitAPI.onContextUpdate((data) => {
    const oldContext = currentState.currentContext;
    currentState.currentContext = data.processName;
    if (oldContext !== data.processName) {
        updateContextualActions();
    }
    if (currentState.config && currentState.config.devMode) updateDebugOverlay();
});

window.orbitAPI.onThemesUpdated((newThemes) => {
    currentState.themes = newThemes;
    if (currentState.config) applyTheme(currentState.config.activeTheme);
    renderOrbit();
});

window.orbitAPI.onWindowShown(async (data) => {
    if (!initPromise) initPromise = init();
    await initPromise;

    const { x, y } = data;
    currentState.radialCenter = { x, y };
    currentState.gestures.startX = x;
    currentState.gestures.startY = y;
    currentState.gestures.startTime = Date.now();
    currentState.gestures.tracking = true;
    
    setRadialPosition(x, y);
    resetToRoot();
    expandMenu();
});

window.orbitAPI.onPingHealth(() => {
    window.orbitAPI.send('pong-health');
});

// ============================================
// INIT
// ============================================

async function init() {
    currentState.config = await window.orbitAPI.getConfig();
    currentState.themes = await window.orbitAPI.getThemes();

    applyTheme(currentState.config.activeTheme);
    centerPiece.classList.add('idle');

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

    document.addEventListener('wheel', (e) => {
        if (currentState.state !== 'IDLE' && e.ctrlKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -10 : 10;
            const nr = Math.max(50, Math.min(300, (currentState.config.radius || 100) + delta));
            window.orbitAPI.updateConfig({ radius: nr });
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
            currentState.gestures.tracking = false;
            const angle = Math.atan2(dy, dx);
            // Check configured gesture shortcuts first
            if (tryGestureShortcut(angle)) return;
            triggerSwipeAction(angle);
        }
    }

    function tryGestureShortcut(angle) {
        const shortcuts = currentState.config && currentState.config.gestureShortcuts;
        if (!shortcuts) return false;
        // Map angle to cardinal direction
        let dir;
        if      (angle > -Math.PI / 4  && angle <= Math.PI / 4)  dir = 'right';
        else if (angle > Math.PI / 4   && angle <= 3*Math.PI/4)  dir = 'down';
        else if (angle > -3*Math.PI/4  && angle <= -Math.PI / 4) dir = 'up';
        else                                                        dir = 'left';
        const action = shortcuts[dir];
        if (action) {
            window.orbitAPI.executeAction(action);
            closeMenu();
            window.orbitAPI.log('info', 'gesture_shortcut', { dir });
            return true;
        }
        return false;
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
            window.orbitAPI.log('info', 'gesture_triggered', { angle: angle.toFixed(2) });
        }
    }


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

    // Plugin real-time data → widget updates
    window.orbitAPI.onPluginBroadcast((data) => handlePluginBroadcast(data));

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
        const radius = currentState.config ? (currentState.config.radius || 100) : 100;
        const cx = currentState.radialCenter.x;
        const cy = currentState.radialCenter.y;
        const hitRadius = radius + 60;
        const dx = mx - cx;
        const dy = my - cy;
        const isInside = (dx * dx + dy * dy) <= (hitRadius * hitRadius); // No Math.hypot for speed

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

    const currentActions = getVisibleActions();
    const isNested = currentState.levelStack.length > 0;
    const radius = isNested
        ? (currentState.config.groupRadius || 75)
        : (currentState.config.radius || 100);

    const menuContainer = document.getElementById('radial-menu');
    const menuCenter = menuContainer.querySelector('.radial-menu-center');

    // Surgical cleanup: Remove all menu-items but keep the center-piece wrapper
    const items = Array.from(menuCenter.querySelectorAll('.menu-item'));

    currentActions.forEach((action, index) => {
        let item = items[index];
        if (!item) {
            item = document.createElement('div');
            menuCenter.appendChild(item);
        }

        item.className = `menu-item${isNested ? ' nested-item' : ''}${item.className.includes('visible') ? ' visible' : ''}`;
        item.dataset.action = JSON.stringify(action);

        // Update Icon (only if changed)
        const iconKey = action.icon || action.label;
        if (item.dataset.iconKey !== iconKey) {
            item.innerHTML = '';
            item.appendChild(createIcon(action));
            item.dataset.iconKey = iconKey;
        }

        const positions = computeLayout(currentActions.length, radius);
        const pos = positions[index];

        item.dataset.baseX = pos.x;
        item.dataset.baseY = pos.y;
        item.style.setProperty('--x', `${pos.x}px`);
        item.style.setProperty('--y', `${pos.y}px`);

        item.onmouseenter = () => { if (currentState.config.showHoverLabels) showHoverLabel(action.label); };
        item.onmouseleave = () => hideHoverLabel();
        item.onclick = (e) => { e.stopPropagation(); handleItemClick(action, item); };
        item.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(action, e.clientX, e.clientY, item);
        };

        if (!item.classList.contains('visible')) {
            setTimeout(() => item.classList.add('visible'), index * 12 * (currentState.config.animationSpeed || 1.0));
        }
    });

    // Cleanup extra items
    for (let i = currentActions.length; i < items.length; i++) {
        items[i].remove();
    }

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
    const cmd = action.command;

    // All ui: commands are handled entirely in the renderer
    if (cmd === 'ui:open-add-action') { openModal(); return; }
    if (cmd && cmd.startsWith('ui:'))    { handleUICommand(cmd); return; }

    // theme: commands — apply locally and persist to config
    if (cmd && cmd.startsWith('theme:')) {
        const themeName = cmd.slice(6);
        currentState.config.activeTheme = themeName;
        applyTheme(themeName);
        window.orbitAPI.updateConfig({ activeTheme: themeName });
        return;
    }

    if (action.type === 'group') {
        if (!action.children || action.children.length === 0) {
            if (element) {
                element.classList.add('shake');
                setTimeout(() => element.classList.remove('shake'), 400);
            }
            return;
        }
        enterGroup(action.children);
    } else {
        window.orbitAPI.executeAction(action);
        playSound('execute');
    }
}

// Handles every command that starts with "ui:"
function handleUICommand(cmd) {
    switch (cmd) {
        case 'ui:toggle-labels':
            currentState.config.showHoverLabels = !currentState.config.showHoverLabels;
            window.orbitAPI.updateConfig({ showHoverLabels: currentState.config.showHoverLabels });
            break;
        case 'ui:toggle-sound':
            currentState.config.enableSoundEffects = !currentState.config.enableSoundEffects;
            window.orbitAPI.updateConfig({ enableSoundEffects: currentState.config.enableSoundEffects });
            break;
        case 'ui:toggle-dev':
            currentState.config.devMode = !currentState.config.devMode;
            window.orbitAPI.updateConfig({ devMode: currentState.config.devMode });
            updateDevOverlay();
            break;
        case 'ui:show-plugins':
            showPluginPanel();
            break;
        default:
            if (cmd.startsWith('ui:toggle-widget-')) {
                toggleWidget(cmd.slice('ui:toggle-widget-'.length));
            } else if (cmd.startsWith('ui:plugin-')) {
                // e.g. 'ui:plugin-pomodoro-start' → sends 'plugin-pomodoro-start' to main
                window.orbitAPI.sendPluginCommand(cmd.slice(3), {});
            }
    }
}

// ============================================
// NAVIGATION
// ============================================

// Returns the correct actions for the current level + context profile
function getVisibleActions() {
    if (currentState.levelStack.length > 0) {
        return currentState.levelStack[currentState.levelStack.length - 1];
    }
    const base = currentState.config.actions || [];
    // Inject context-profile actions at the front when a profile matches
    const profiles = currentState.config.contextProfiles;
    if (profiles && currentState.currentContext) {
        const ctx = currentState.currentContext.toLowerCase();
        for (const [key, profileActions] of Object.entries(profiles)) {
            if (ctx.includes(key.toLowerCase()) && Array.isArray(profileActions) && profileActions.length > 0) {
                return [...profileActions, ...base];
            }
        }
    }
    return base;
}

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
    // Position menu container at trigger point
    currentState.state = 'EXPANDING';
    const menuContainer = document.getElementById('radial-menu');
    const menuCenter = menuContainer.querySelector('.radial-menu-center');
    // Clear only menu items, keep center piece
    menuCenter.querySelectorAll('.menu-item').forEach(el => el.remove());
    
    // Position menu container at trigger point via CSS variables
    menuContainer.classList.add('active');

    const actions = getVisibleActions();
    
    actions.forEach((action, index) => {
        const item = document.createElement('div');
        item.className = `menu-item${currentState.levelStack.length > 0 ? ' nested-item' : ''}`;

        // Dynamic Icon
        const iconEl = createIcon(action);
        item.appendChild(iconEl);

        // Position around radial center
        const radius = currentState.levelStack.length > 0
            ? (currentState.config.groupRadius || 75)
            : (currentState.config.radius || 100);
            
        const positions = computeLayout(actions.length, radius);
        const pos = positions[index];

        item.dataset.baseX = pos.x;
        item.dataset.baseY = pos.y;
        
        item.style.setProperty('--x', `${pos.x}px`);
        item.style.setProperty('--y', `${pos.y}px`);
        
        item.style.left = '0';
        item.style.top = '0';

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

        menuCenter.appendChild(item);
        
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
        clearRadialPosition();
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

    const newAction = { type: 'custom', label, path, icon: icon || '' };
    const newActions = [...currentState.config.actions, newAction];
    window.orbitAPI.updateConfig({ actions: newActions });
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

        // Center parallax — relative to radialCenter (0,0)
        if (!currentState.isEditMode && currentState.state !== 'IDLE') {
            centerPiece.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
        }

        // Item proximity scaling
        if (currentState.state === 'ACTIVE' && !currentState.isEditMode) {
            const items = menuContainer.querySelectorAll('.menu-item');
            items.forEach(item => {
                const bx = parseFloat(item.dataset.baseX);
                const by = parseFloat(item.dataset.baseY);
                const ix = cx + bx;
                const iy = cy + by;
                const mdx = currentState.mouseX - ix;
                const mdy = currentState.mouseY - iy;
                const distSq = mdx * mdx + mdy * mdy;

                let scale = 1;
                let offset = 0;

                if (distSq < 10000) { // 100 * 100
                    const dist = Math.sqrt(distSq); // Only sqrt if close enough
                    scale = 1 + (100 - dist) / 600;
                    offset = (100 - dist) / 50;
                }

                const angle = Math.atan2(mdy, mdx);
                const dx = Math.cos(angle) * offset + px * 0.3;
                const dy = Math.sin(angle) * offset + py * 0.3;

                item.style.setProperty('--dx', `${dx}px`);
                item.style.setProperty('--dy', `${dy}px`);
                item.style.setProperty('--scale', scale);
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
        // Clone the group to avoid in-place mutation of config state
        const groupIdx = newActions.indexOf(group);
        newActions[groupIdx] = { ...group, children: [...group.children, targetAction] };
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

function updateContextualActions() {
    // Context-aware actions are now handled by getVisibleActions() via config.contextProfiles.
    // Re-render the orbit if it's currently open so profile actions appear immediately.
    if (currentState.state !== 'IDLE') renderOrbit();
}

function scoreMatch(query, target) {
    if (!query) return 1;
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    if (t === q) return 100;
    if (t.startsWith(q)) return 50;
    
    // Fuzzy match
    let i = 0, j = 0;
    while (i < q.length && j < t.length) {
        if (q[i] === t[j]) i++;
        j++;
    }
    return i === q.length ? 10 : 0;
}

function flattenActions(actions) {
    if (!actions) return [];
    let flat = [];
    actions.forEach(a => {
        flat.push(a);
        if (a.children) flat = flat.concat(flattenActions(a.children));
    });
    return flat;
}

// ============================================
// PLUGIN BROADCAST ROUTER
// ============================================

function handlePluginBroadcast({ plugin, channel, data }) {
    switch (channel) {
        case 'sysmon-update':         updateSysMonWidget(data);      break;
        case 'pomodoro-update':       updatePomodoroWidget(data);    break;
        case 'weather-update':        updateWeatherWidget(data);     break;
        case 'clipboard-update':      updateClipboardWidget(data);   break;
        case 'notes-update':          updateNotesWidget(data);       break;
        case 'media-update':          updateMediaWidget(data);       break;
        case 'app-switcher-update':   updateAppSwitcherWidget(data); break;
        case 'script-output':         updateScriptRunnerWidget(data);break;
        case 'focus-mode-update':     updateFocusModeWidget(data);   break;
        case 'recent-files-update':   break; // handled server-side via group children
    }
}

// ============================================
// WIDGET SYSTEM
// ============================================

function toggleWidget(name) {
    const widget = document.getElementById(`widget-${name}`);
    if (!widget) return;
    widget.classList.toggle('hidden');
    const anyOpen = document.querySelectorAll('.plugin-widget:not(.hidden)').length > 0;
    if (anyOpen) window.orbitAPI.setIgnoreMouse(false);
}

// --- System Monitor ---
function updateSysMonWidget(data) {
    const cpuBar = document.getElementById('cpu-bar');
    const ramBar = document.getElementById('ram-bar');
    const cpuVal = document.getElementById('cpu-val');
    const ramVal = document.getElementById('ram-val');
    const uptime = document.getElementById('sysmon-uptime');
    if (!cpuBar) return;

    cpuBar.style.width = `${data.cpu}%`;
    ramBar.style.width = `${data.ramPct}%`;
    cpuVal.textContent = `${data.cpu}%`;
    ramVal.textContent = `${data.ramPct}% (${data.ramUsedMB} / ${data.ramTotalMB} MB)`;
    if (uptime) uptime.textContent = `Uptime: ${data.uptimeHr}h ${data.uptimeMin}m`;

    cpuBar.style.background = data.cpu > 85 ? '#ff4444'
        : data.cpu > 60 ? '#ffaa00' : 'var(--accent)';
}

// --- Pomodoro ---
function updatePomodoroWidget(data) {
    const display = document.getElementById('pomodoro-display');
    const stateEl = document.getElementById('pomodoro-state');
    if (!display) return;

    display.textContent = data.display;
    display.style.color = data.state === 'break' ? '#44ff88'
        : data.state === 'work' ? 'var(--accent)'
        : 'rgba(255,255,255,0.4)';

    const labels = { work: '🔥 Focusing', break: '😌 Break', paused: '⏸ Paused', idle: 'Ready to focus' };
    stateEl.textContent = labels[data.state] || data.state;
}

// --- Weather ---
function updateWeatherWidget(data) {
    const cond    = document.getElementById('weather-condition');
    const temp    = document.getElementById('weather-temp');
    const details = document.getElementById('weather-details');
    if (!cond) return;

    if (data.error) { cond.textContent = '⚠️ ' + data.error; temp.textContent = ''; details.textContent = ''; return; }
    cond.textContent    = data.condition;
    temp.textContent    = `${data.tempC}°C  (feels ${data.feelsLike}°C)`;
    details.textContent = `${data.city}, ${data.country}  |  💧${data.humidity}%  💨${data.windKmph} km/h`;
}

// --- Clipboard ---
function updateClipboardWidget(data) {
    const list = document.getElementById('clipboard-list');
    if (!list) return;
    list.innerHTML = '';
    (data.history || []).forEach((text, idx) => {
        const item = document.createElement('div');
        item.className = 'clipboard-item';
        item.textContent = text.length > 55 ? text.slice(0, 55) + '…' : text;
        item.title = text;
        item.onclick = () => {
            window.orbitAPI.sendPluginCommand('plugin-clipboard-history-copy', { index: idx });
            item.classList.add('copied');
            setTimeout(() => item.classList.remove('copied'), 700);
        };
        list.appendChild(item);
    });
}

// --- Notes ---
function updateNotesWidget(data) {
    const body = document.getElementById('notes-body');
    if (!body) return;
    const html = (data.content || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/^# (.+)$/gm, '<strong class="note-h1">$1</strong>')
        .replace(/^## (.+)$/gm, '<strong class="note-h2">$1</strong>')
        .replace(/^- (.+)$/gm, '<span class="note-bullet">• $1</span>')
        .replace(/\n/g, '<br>');
    body.innerHTML = html;
}

// --- Media (reflected in dev overlay) ---
function updateMediaWidget(data) {
    if (data.title && currentState.config && currentState.config.devMode) {
        const overlay = document.getElementById('dev-overlay');
        if (overlay && !overlay.textContent.includes('🎵')) {
            overlay.textContent += `  |  🎵 ${data.title}`;
        }
    }
}

// --- App Switcher ---
function updateAppSwitcherWidget(data) {
    const list = document.getElementById('app-switcher-list');
    if (!list) return;
    list.innerHTML = '';
    (data.windows || []).forEach(win => {
        const item = document.createElement('div');
        item.className = 'clipboard-item';
        const title = win.title.length > 48 ? win.title.slice(0, 48) + '…' : win.title;
        item.textContent = title;
        item.title = `${win.name} (PID ${win.pid})`;
        item.onclick = () => {
            window.orbitAPI.sendPluginCommand('plugin-app-switcher-app-switcher-focus', { pid: win.pid });
        };
        list.appendChild(item);
    });
    if ((data.windows || []).length === 0) {
        list.innerHTML = '<div style="padding:10px 14px;color:rgba(255,255,255,0.3);font-size:12px">No open windows found</div>';
    }
}

// --- Script Runner ---
function updateScriptRunnerWidget(data) {
    const label  = document.getElementById('script-runner-label');
    const output = document.getElementById('script-runner-output');
    if (!output) return;
    if (label) {
        label.textContent = data.running ? `▶ ${data.label}` : `✓ ${data.label}`;
        label.style.color  = data.running ? 'var(--accent)' : '#44ff88';
    }
    output.innerHTML = (data.lines || [])
        .map(l => `<div class="script-line ${l.startsWith('⚠') ? 'script-err' : l.startsWith('✓') ? 'script-ok' : ''}">${l.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div>`)
        .join('');
    output.scrollTop = output.scrollHeight;
    // Auto-open widget when a script starts
    const widget = document.getElementById('widget-script-runner');
    if (widget && widget.classList.contains('hidden')) widget.classList.remove('hidden');
}

// --- Focus Mode ---
function updateFocusModeWidget(data) {
    const statusEl  = document.getElementById('focus-mode-status');
    const blockEl   = document.getElementById('focus-mode-blocklist');
    if (!statusEl) return;
    statusEl.textContent = data.active ? '🔴 Active' : '● Inactive';
    statusEl.className   = `focus-status ${data.active ? 'active' : 'inactive'}`;
    if (blockEl) blockEl.textContent = `Blocking: ${(data.blocklist || []).join(', ')}`;
}

// ============================================
// PLUGIN MANAGEMENT PANEL
// ============================================

async function showPluginPanel() {
    const overlay = document.getElementById('plugin-panel-overlay');
    if (!overlay) return;
    overlay.classList.add('active');
    window.orbitAPI.setIgnoreMouse(false);
    await loadPluginList();
}

function closePluginPanel() {
    const overlay = document.getElementById('plugin-panel-overlay');
    if (overlay) overlay.classList.remove('active');
    updateHitDetection(currentState.mouseX, currentState.mouseY);
}

async function loadPluginList() {
    const container = document.getElementById('plugin-list-container');
    if (!container) return;
    container.innerHTML = '<div class="plugin-loading">Loading…</div>';
    try {
        const plugins = await window.orbitAPI.getPlugins();
        container.innerHTML = '';
        if (!plugins || plugins.length === 0) {
            container.innerHTML = '<div class="plugin-empty">No plugins loaded.<br>Drop a .js file in the plugins folder and restart Orbit.</div>';
            return;
        }
        plugins.forEach(p => {
            const card = document.createElement('div');
            card.className = `plugin-card ${p.enabled ? 'enabled' : 'disabled'}`;
            card.innerHTML = `
                <div class="plugin-card-info">
                    <div class="plugin-card-name">${p.name}</div>
                    <div class="plugin-card-desc">${p.description || ''}</div>
                    <div class="plugin-card-version">v${p.version}</div>
                </div>
                <div class="plugin-card-badge ${p.enabled ? 'badge-active' : 'badge-inactive'}">
                    ${p.enabled ? '● Active' : '○ Inactive'}
                </div>`;
            container.appendChild(card);
        });
    } catch (_) {
        container.innerHTML = '<div class="plugin-empty">Failed to load plugins.</div>';
    }
}

initPromise = init();
