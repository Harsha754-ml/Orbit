const menuContainer = document.getElementById('radial-menu');

const actions = [
  { id: 'vscode', icon: 'assets/vscode.svg' },
  { id: 'terminal', icon: 'assets/terminal.svg' },
  { id: 'taskmgr', icon: 'assets/taskmanager.svg' },
  { id: 'downloads', icon: 'assets/downloads.svg' },
  { id: 'screenshot', icon: 'assets/screenshot.svg' },
  { id: 'shutdown', icon: 'assets/shutdown.svg' },
  { id: 'restart', icon: 'assets/restart.svg' },
  { id: 'lock', icon: 'assets/lock.svg' }
];

const RADIUS = 140; // px
const ITEMS_COUNT = actions.length;

function initMenu() {
  actions.forEach((action, index) => {
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.dataset.action = action.id;
    
    const icon = document.createElement('img');
    icon.src = action.icon;
    item.appendChild(icon);
    
    // Trigonometric positioning
    const angle = (index / ITEMS_COUNT) * 2 * Math.PI - Math.PI / 2;
    const x = Math.round(Math.cos(angle) * RADIUS);
    const y = Math.round(Math.sin(angle) * RADIUS);
    
    item.style.left = `calc(50% + ${x}px - 30px)`; // 30px is half item size
    item.style.top = `calc(50% + ${y}px - 30px)`;
    
    item.addEventListener('click', () => {
      window.orbitAPI.executeAction(action.id);
    });
    
    menuContainer.appendChild(item);
    
    // Staggered enter animation
    setTimeout(() => {
      item.classList.add('visible');
    }, index * 30);
  });
}

// Close when clicking outside center or items
document.body.addEventListener('click', (e) => {
  if (e.target === document.body || e.target === document.getElementById('orbit-container')) {
    window.orbitAPI.hideApp();
  }
});

initMenu();
