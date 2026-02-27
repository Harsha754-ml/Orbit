let config = null;
let themes = [];
let currentGroup = null;
let history = [];
let state = 'IDLE'; // IDLE, EXPANDING, ACTIVE, COLLAPSING

const menuContainer = document.getElementById('radial-menu');
const centerPiece = document.getElementById('center-piece');
const rippleContainer = document.getElementById('ripple-container');
const devOverlay = document.getElementById('dev-overlay');

async function init() {
    config = await window.orbitAPI.getConfig();
    themes = await window.orbitAPI.getThemes();
    applyTheme(config.activeTheme);
    
    window.orbitAPI.onConfigUpdated((newConfig) => {
        config = newConfig;
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

    // Parallax & Hover Proximity
    document.addEventListener('mousemove', handleMouseMove);
    
    updateDevOverlay();
}

function applyTheme(themeName) {
    const theme = themes.find(t => t.name === themeName);
    if (!theme) return;
    
    const root = document.documentElement;
    root.style.setProperty('--bg-base', theme.base);
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--glow', theme.glow);
    root.style.setProperty('--blur', theme.blur);
    root.style.setProperty('--anim-speed', theme.speed);
}

function toggleMenu() {
    createRipple();
    if (state === 'IDLE') {
        renderGroup(config.actions);
        playSound('expand');
    } else {
        closeMenu();
    }
}

function renderGroup(actions) {
    state = 'EXPANDING';
    menuContainer.innerHTML = '';
    currentGroup = actions;
    
    const count = actions.length;
    const radius = config.radius;
    
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
        
        item.style.left = `calc(50% + ${x}px - var(--item-size)/2)`;
        item.style.top = `calc(50% + ${y}px - var(--item-size)/2)`;
        
        item.onclick = () => handleItemClick(action);
        
        menuContainer.appendChild(item);
        
        // Staggered entry
        setTimeout(() => {
            item.classList.add('visible');
            if (index === count - 1) state = 'ACTIVE';
        }, index * 15 * (config.animationSpeed || 1.0));
    });
}

function handleItemClick(action) {
    if (action.type === 'group') {
        history.push(currentGroup);
        if (history.length > (config.nestingDepthLimit || 5)) {
            console.warn('Max nesting depth reached');
            return;
        }
        transitionToGroup(action.children);
    } else {
        playSound('execute');
        window.orbitAPI.executeAction(action);
    }
}

function transitionToGroup(children) {
    state = 'COLLAPSING';
    const items = menuContainer.querySelectorAll('.menu-item');
    items.forEach(item => item.classList.add('collapsing'));
    
    setTimeout(() => {
        renderGroup(children);
    }, 200 * (config.animationSpeed || 1.0));
}

function goBack() {
    if (history.length > 0) {
        const previous = history.pop();
        transitionToGroup(previous);
        playSound('collapse');
    } else if (state !== 'IDLE') {
        closeMenu();
    }
}

function closeMenu() {
    state = 'COLLAPSING';
    const items = menuContainer.querySelectorAll('.menu-item');
    items.forEach(item => item.classList.add('collapsing'));
    
    setTimeout(() => {
        menuContainer.innerHTML = '';
        state = 'IDLE';
        history = [];
    }, 200 * (config.animationSpeed || 1.0));
    playSound('collapse');
}

function resetToRoot() {
    menuContainer.innerHTML = '';
    state = 'IDLE';
    history = [];
    renderGroup(config.actions);
}

function createRipple() {
    const ripple = document.createElement('div');
    ripple.className = 'ripple';
    ripple.style.width = '100px';
    ripple.style.height = '100px';
    ripple.style.left = 'calc(50% - 50px)';
    ripple.style.top = 'calc(50% - 50px)';
    rippleContainer.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
}

function handleMouseMove(e) {
    if (state === 'IDLE') return;
    
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const deltaX = (e.clientX - centerX) / 20;
    const deltaY = (e.clientY - centerY) / 20;
    
    // Parallax center
    centerPiece.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    
    // Proximity scaling
    const items = menuContainer.querySelectorAll('.menu-item');
    items.forEach(item => {
        const rect = item.getBoundingClientRect();
        const itemX = rect.left + rect.width / 2;
        const itemY = rect.top + rect.height / 2;
        const dist = Math.hypot(e.clientX - itemX, e.clientY - itemY);
        
        if (dist < 100) {
            const scale = 1 + (100 - dist) / 500;
            item.style.transform = `scale(${scale})`;
        } else {
            item.style.transform = `scale(1)`;
        }
    });
}

function playSound(type) {
    if (config.enableSoundEffects) {
        window.orbitAPI.playSound(type);
    }
}

function updateDevOverlay() {
    if (config && config.devMode) {
        devOverlay.style.display = 'block';
        devOverlay.innerHTML = `State: ${state} | Items: ${currentGroup ? currentGroup.length : 0} | Radius: ${config.radius}px`;
    } else {
        devOverlay.style.display = 'none';
    }
}

init();
