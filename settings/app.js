// settings/app.js — Orbit Settings UI logic

let config = {};
let themes = [];
let plugins = [];

// ── Modal state ──────────────────────────────────────────────────────────────
let editingActionPath = null;   // null = adding root, array path = editing/adding child
let editingGestureDir = null;

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function init() {
  try {
    [config, themes, plugins] = await Promise.all([
      window.settingsAPI.getConfig(),
      window.settingsAPI.getThemes(),
      window.settingsAPI.getPlugins()
    ]);
  } catch (e) {
    config = {};
    themes = [];
    plugins = [];
  }

  setupNav();
  renderDashboard();
  renderActions();
  renderPlugins();
  renderProfiles();
  renderGestures();
  renderThemes();
  renderGeneral();

  window.settingsAPI.onConfigUpdated((updated) => {
    config = updated;
    renderDashboard();
    renderActions();
    renderProfiles();
    renderGestures();
    renderGeneral();
  });
}

// ── Navigation ───────────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('page-' + page)?.classList.add('active');
    });
  });
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2500);
}

async function saveConfig(patch) {
  config = { ...config, ...patch };
  try {
    await window.settingsAPI.saveConfig(config);
    toast('Saved');
  } catch (e) {
    toast('Save failed', 'error');
  }
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function renderDashboard() {
  const actions = config.actions || [];
  const total = countActions(actions);

  setText('stat-actions', total);
  setText('stat-plugins', plugins.filter(p => p.enabled).length);
  setText('stat-theme', config.activeTheme || '—');
  setText('stat-radius', (config.primaryRadius || config.radius || 100) + 'px');

  // Quick toggles
  const toggleDefs = [
    { id: 'showHoverLabels',        label: 'Hover Labels'       },
    { id: 'enableSoundEffects',     label: 'Sound Effects'      },
    { id: 'gestureNavigationEnabled', label: 'Gestures'         },
    { id: 'devMode',                label: 'Dev Mode'           },
  ];
  const tg = document.getElementById('quick-toggles');
  if (tg) {
    tg.innerHTML = toggleDefs.map(d => `
      <label class="toggle-card">
        <span class="toggle-card-label">${d.label}</span>
        <label class="toggle-switch">
          <input type="checkbox" ${config[d.id] ? 'checked' : ''}
            onchange="quickToggle('${d.id}', this.checked)">
          <span class="toggle-thumb"></span>
        </label>
      </label>
    `).join('');
  }

  // Active plugins
  const dp = document.getElementById('dash-plugins');
  if (dp) {
    const active = plugins.filter(p => p.enabled);
    dp.innerHTML = active.length
      ? active.map(p => `<div class="dash-plugin-item"><span class="badge badge-on">ON</span> ${esc(p.name)}</div>`).join('')
      : '<div class="dash-plugin-item muted">No plugins enabled</div>';
  }
}

function countActions(arr) {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((n, a) => n + 1 + countActions(a.children), 0);
}

function quickToggle(key, val) {
  saveConfig({ [key]: val });
}

// ── Actions Tree ──────────────────────────────────────────────────────────────
function renderActions() {
  const container = document.getElementById('action-tree');
  if (!container) return;
  const actions = config.actions || [];
  container.innerHTML = actions.length
    ? actions.map((a, i) => renderActionRow(a, [i], 0)).join('')
    : '<div class="empty-state">No actions yet. Click "+ Add Action" to get started.</div>';

  document.getElementById('btn-add-root')?.addEventListener('click', () => openActionModal(null));
}

function renderActionRow(action, path, depth) {
  const indent = depth * 20;
  const isGroup = action.type === 'group';
  const children = isGroup && Array.isArray(action.children)
    ? action.children.map((c, i) => renderActionRow(c, [...path, 'children', i], depth + 1)).join('')
    : '';

  return `
    <div class="action-row" style="padding-left:${indent + 12}px">
      <div class="action-row-icon">${isGroup ? '📁' : getActionEmoji(action)}</div>
      <div class="action-row-info">
        <div class="action-row-label">${esc(action.label || '(no label)')}</div>
        <div class="action-row-type">${esc(action.type)}${action.cmd ? ' · ' + esc(action.cmd).slice(0,40) : ''}${action.command ? ' · ' + esc(action.command).slice(0,40) : ''}${action.path ? ' · ' + esc(action.path).slice(0,40) : ''}</div>
      </div>
      <div class="action-row-actions">
        ${isGroup ? `<button class="btn-sm" onclick="openActionModal('${encodePath(path)}', true)">+ Child</button>` : ''}
        <button class="btn-sm" onclick="openActionModal('${encodePath(path)}')">Edit</button>
        <button class="btn-sm btn-danger-sm" onclick="deleteAction('${encodePath(path)}')">✕</button>
      </div>
    </div>
    ${children}
  `;
}

function getActionEmoji(a) {
  if (a.type === 'cmd') return '⚡';
  if (a.type === 'custom') return '🚀';
  if (a.type === 'command') return '🔧';
  return '•';
}

function encodePath(path) { return encodeURIComponent(JSON.stringify(path)); }
function decodePath(str)  { return JSON.parse(decodeURIComponent(str)); }

function getAtPath(obj, path) {
  return path.reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

function setAtPath(obj, path, val) {
  const clone = deepClone(obj);
  let cur = clone;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  cur[path[path.length - 1]] = val;
  return clone;
}

function deleteAtPath(obj, path) {
  const clone = deepClone(obj);
  let cur = clone;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  const last = path[path.length - 1];
  if (Array.isArray(cur)) cur.splice(last, 1);
  else delete cur[last];
  return clone;
}

function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

// path=null → add root; path=encoded array → edit existing
// addChild=true → add child to group at path
function openActionModal(encodedPath, addChild = false) {
  editingActionPath = encodedPath ? decodePath(encodedPath) : null;

  const isNew = encodedPath === null || addChild;
  document.getElementById('modal-title').textContent = isNew ? 'Add Action' : 'Edit Action';

  let existing = {};
  if (!isNew && editingActionPath) {
    existing = getAtPath({ actions: config.actions }, editingActionPath) || {};
  }

  setValue('m-label', existing.label || '');
  setValue('m-type',  existing.type  || 'cmd');
  setValue('m-cmd',   existing.cmd   || '');
  setValue('m-path',  existing.path  || '');
  setValue('m-uicmd', existing.command || '');
  setValue('m-icon',  existing.icon  || '');

  if (addChild) editingActionPath = { parentPath: editingActionPath, addChild: true };

  updateActionModalFields();
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function updateActionModalFields() {
  const type = document.getElementById('m-type')?.value;
  setVisible('m-row-cmd',   type === 'cmd');
  setVisible('m-row-path',  type === 'custom');
  setVisible('m-row-uicmd', type === 'command');
}

function closeActionModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  editingActionPath = null;
}

function saveActionModal() {
  const action = {
    label:   getValue('m-label').trim(),
    type:    getValue('m-type'),
    icon:    getValue('m-icon').trim() || undefined,
  };
  if (action.type === 'cmd')     action.cmd     = getValue('m-cmd').trim();
  if (action.type === 'custom')  action.path    = getValue('m-path').trim();
  if (action.type === 'command') action.command = getValue('m-uicmd').trim();
  if (action.type === 'group')   action.children = action.children || [];
  if (!action.label) { toast('Label is required', 'error'); return; }

  let newActions = deepClone(config.actions || []);

  if (editingActionPath === null) {
    // Add root
    newActions.push(action);
  } else if (editingActionPath?.addChild) {
    // Add child to group
    const pp = editingActionPath.parentPath;
    const group = getAtPath({ actions: newActions }, pp);
    if (group) {
      group.children = group.children || [];
      group.children.push(action);
    }
  } else {
    // Edit existing
    newActions = setAtPath({ actions: newActions }, editingActionPath, action).actions;
  }

  saveConfig({ actions: newActions });
  closeActionModal();
  renderActions();
}

function deleteAction(encodedPath) {
  if (!confirm('Delete this action?')) return;
  const path = decodePath(encodedPath);
  const newActions = deleteAtPath({ actions: deepClone(config.actions || []) }, path).actions;
  saveConfig({ actions: newActions });
  renderActions();
}

// Modal wire-up
document.getElementById('modal-close-btn')?.addEventListener('click', closeActionModal);
document.getElementById('modal-cancel-btn')?.addEventListener('click', closeActionModal);
document.getElementById('modal-save-btn')?.addEventListener('click', saveActionModal);
document.getElementById('m-type')?.addEventListener('change', updateActionModalFields);

// ── Plugins ──────────────────────────────────────────────────────────────────
function renderPlugins() {
  const container = document.getElementById('plugin-cards');
  if (!container) return;
  if (!plugins.length) {
    container.innerHTML = '<div class="empty-state">No plugins found in the plugins/ folder.</div>';
    return;
  }
  container.innerHTML = plugins.map(p => `
    <div class="plugin-card">
      <div class="plugin-card-header">
        <div class="plugin-card-icon">🔌</div>
        <div class="plugin-card-meta">
          <div class="plugin-card-name">${esc(p.name)}</div>
          <div class="plugin-card-version">v${esc(p.version || '1.0.0')} · ${esc(p.filename)}</div>
        </div>
        <span class="badge ${p.enabled ? 'badge-on' : 'badge-off'}">${p.enabled ? 'Active' : 'Inactive'}</span>
      </div>
      ${p.description ? `<div class="plugin-card-desc">${esc(p.description)}</div>` : ''}
    </div>
  `).join('');

  document.getElementById('btn-open-plugins-folder')?.addEventListener('click', () => {
    window.settingsAPI.openPluginsFolder();
  });
}

// ── Context Profiles ─────────────────────────────────────────────────────────
let activeProfileKey = null;

function renderProfiles() {
  const profiles = config.contextProfiles || {};
  const keys = Object.keys(profiles);

  const tabsEl = document.getElementById('profile-tabs');
  const contentEl = document.getElementById('profile-content');
  if (!tabsEl || !contentEl) return;

  if (!keys.length) {
    tabsEl.innerHTML = '';
    contentEl.innerHTML = '<div class="empty-state">No profiles yet.</div>';
    return;
  }

  if (!activeProfileKey || !profiles[activeProfileKey]) activeProfileKey = keys[0];

  tabsEl.innerHTML = keys.map(k => `
    <button class="profile-tab ${k === activeProfileKey ? 'active' : ''}"
      onclick="switchProfile('${esc(k)}')">${esc(k)}</button>
  `).join('');

  const actions = profiles[activeProfileKey] || [];
  contentEl.innerHTML = `
    <div class="profile-actions-header">
      <span class="muted">${actions.length} action(s) for <strong>${esc(activeProfileKey)}</strong></span>
      <button class="btn-sm" onclick="addProfileAction('${esc(activeProfileKey)}')">+ Add</button>
      <button class="btn-sm btn-danger-sm" onclick="deleteProfile('${esc(activeProfileKey)}')">Delete Profile</button>
    </div>
    <div class="profile-action-list">
      ${actions.map((a, i) => `
        <div class="action-row">
          <div class="action-row-icon">${getActionEmoji(a)}</div>
          <div class="action-row-info">
            <div class="action-row-label">${esc(a.label || '(no label)')}</div>
            <div class="action-row-type">${esc(a.cmd || a.command || a.path || '').slice(0,50)}</div>
          </div>
          <div class="action-row-actions">
            <button class="btn-sm btn-danger-sm" onclick="deleteProfileAction('${esc(activeProfileKey)}', ${i})">✕</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  document.getElementById('btn-add-profile')?.addEventListener('click', promptAddProfile);
}

function switchProfile(key) {
  activeProfileKey = key;
  renderProfiles();
}

function promptAddProfile() {
  const name = prompt('Profile name (process name, e.g. "code"):');
  if (!name || !name.trim()) return;
  const key = name.trim().toLowerCase();
  const profiles = deepClone(config.contextProfiles || {});
  if (profiles[key]) { toast('Profile already exists', 'error'); return; }
  profiles[key] = [];
  saveConfig({ contextProfiles: profiles });
  activeProfileKey = key;
  renderProfiles();
}

function deleteProfile(key) {
  if (!confirm(`Delete profile "${key}"?`)) return;
  const profiles = deepClone(config.contextProfiles || {});
  delete profiles[key];
  if (activeProfileKey === key) activeProfileKey = null;
  saveConfig({ contextProfiles: profiles });
  renderProfiles();
}

function addProfileAction(key) {
  const label = prompt('Action label:');
  if (!label) return;
  const cmd = prompt('Shell command (cmd):');
  if (cmd === null) return;
  const profiles = deepClone(config.contextProfiles || {});
  profiles[key] = profiles[key] || [];
  profiles[key].push({ type: 'cmd', label: label.trim(), cmd: cmd.trim() });
  saveConfig({ contextProfiles: profiles });
  renderProfiles();
}

function deleteProfileAction(key, index) {
  const profiles = deepClone(config.contextProfiles || {});
  profiles[key].splice(index, 1);
  saveConfig({ contextProfiles: profiles });
  renderProfiles();
}

// ── Gestures ──────────────────────────────────────────────────────────────────
function renderGestures() {
  const gs = config.gestureShortcuts || {};
  ['up', 'down', 'left', 'right'].forEach(dir => {
    const el = document.getElementById(`gesture-${dir}-label`);
    if (el) el.textContent = gs[dir]?.label || 'Not set';
  });
}

function editGesture(dir) {
  editingGestureDir = dir;
  const gs = config.gestureShortcuts || {};
  const existing = gs[dir] || {};

  document.getElementById('gesture-modal-title').textContent = `Configure ${dir.charAt(0).toUpperCase() + dir.slice(1)} Gesture`;
  setValue('g-label', existing.label || '');
  setValue('g-type',  existing.type  || 'cmd');
  setValue('g-cmd',   existing.cmd   || '');
  setValue('g-path',  existing.path  || '');

  updateGestureModalFields();
  document.getElementById('gesture-modal-overlay').classList.remove('hidden');
}

function updateGestureModalFields() {
  const type = document.getElementById('g-type')?.value;
  setVisible('g-row-cmd',  type === 'cmd');
  setVisible('g-row-path', type === 'custom');
}

function closeGestureModal() {
  document.getElementById('gesture-modal-overlay').classList.add('hidden');
  editingGestureDir = null;
}

function saveGestureModal() {
  if (!editingGestureDir) return;
  const type  = getValue('g-type');
  const label = getValue('g-label').trim();
  const action = label ? {
    label,
    type,
    cmd:  type === 'cmd'    ? getValue('g-cmd').trim()  : undefined,
    path: type === 'custom' ? getValue('g-path').trim() : undefined,
  } : null;

  const gs = deepClone(config.gestureShortcuts || {});
  gs[editingGestureDir] = action;
  saveConfig({ gestureShortcuts: gs });
  closeGestureModal();
  renderGestures();
}

function clearGesture() {
  if (!editingGestureDir) return;
  const gs = deepClone(config.gestureShortcuts || {});
  gs[editingGestureDir] = null;
  saveConfig({ gestureShortcuts: gs });
  closeGestureModal();
  renderGestures();
}

document.getElementById('g-type')?.addEventListener('change', updateGestureModalFields);
document.getElementById('gesture-modal-close')?.addEventListener('click', closeGestureModal);
document.getElementById('gesture-cancel-btn')?.addEventListener('click', closeGestureModal);
document.getElementById('gesture-save-btn')?.addEventListener('click', saveGestureModal);
document.getElementById('gesture-clear-btn')?.addEventListener('click', clearGesture);

// ── Themes ────────────────────────────────────────────────────────────────────
function renderThemes() {
  const container = document.getElementById('theme-cards');
  if (!container) return;

  const list = themes.length ? themes : [
    { name: 'Dark Neon',   accent: '#00d4ff', bg: '#0a0a1a' },
    { name: 'Dracula',     accent: '#bd93f9', bg: '#282a36' },
    { name: 'Solarized',   accent: '#268bd2', bg: '#002b36' },
    { name: 'Forest',      accent: '#98c379', bg: '#1a2318' },
    { name: 'Sunset',      accent: '#e06c75', bg: '#1f1a1b' },
    { name: 'Monochrome',  accent: '#aaaaaa', bg: '#111111' },
  ];

  container.innerHTML = list.map(t => `
    <div class="theme-card ${config.activeTheme === t.name ? 'active' : ''}"
         onclick="applyTheme('${esc(t.name)}')">
      <div class="theme-preview" style="background:${t.bg || '#111'};border:2px solid ${t.accent || '#fff'}">
        <div class="theme-dot" style="background:${t.accent || '#fff'}"></div>
        <div class="theme-ring" style="border-color:${t.accent || '#fff'}66"></div>
      </div>
      <div class="theme-name">${esc(t.name)}</div>
      ${config.activeTheme === t.name ? '<div class="theme-active-badge">Active</div>' : ''}
    </div>
  `).join('');
}

function applyTheme(name) {
  saveConfig({ activeTheme: name });
  renderThemes();
}

// ── General ───────────────────────────────────────────────────────────────────
function renderGeneral() {
  const r  = config.primaryRadius || config.radius || 100;
  const gr = config.groupRadius   || 75;
  const sp = config.animationSpeed || 1.0;

  setSlider('inp-radius',       r,  'lbl-radius',      v => v + 'px');
  setSlider('inp-group-radius', gr, 'lbl-group-radius', v => v + 'px');
  setSlider('inp-anim',         sp, 'lbl-anim',         v => parseFloat(v).toFixed(1) + '×');

  setChecked('tog-labels',  config.showHoverLabels);
  setChecked('tog-sound',   config.enableSoundEffects);
  setChecked('tog-gesture', config.gestureNavigationEnabled);
  setChecked('tog-dev',     config.devMode);

  setValue('inp-hotkey', config.hotkey || 'MButton');

  // Slider live feedback
  addSliderFeedback('inp-radius',       'lbl-radius',       v => v + 'px');
  addSliderFeedback('inp-group-radius', 'lbl-group-radius', v => v + 'px');
  addSliderFeedback('inp-anim',         'lbl-anim',         v => parseFloat(v).toFixed(1) + '×');
}

function addSliderFeedback(sliderId, labelId, fmt) {
  const el = document.getElementById(sliderId);
  if (!el || el._feedbackBound) return;
  el._feedbackBound = true;
  el.addEventListener('input', () => setText(labelId, fmt(el.value)));
}

document.getElementById('btn-save-general')?.addEventListener('click', () => {
  const patch = {
    primaryRadius:            parseInt(getValue('inp-radius')),
    radius:                   parseInt(getValue('inp-radius')),
    groupRadius:              parseInt(getValue('inp-group-radius')),
    animationSpeed:           parseFloat(getValue('inp-anim')),
    showHoverLabels:          getChecked('tog-labels'),
    enableSoundEffects:       getChecked('tog-sound'),
    gestureNavigationEnabled: getChecked('tog-gesture'),
    devMode:                  getChecked('tog-dev'),
    hotkey:                   getValue('inp-hotkey').trim() || 'MButton',
  };
  saveConfig(patch);
  renderDashboard();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function setText(id, val) { const e = document.getElementById(id); if (e) e.textContent = val; }
function setValue(id, val) { const e = document.getElementById(id); if (e) e.value = val ?? ''; }
function getValue(id) { return document.getElementById(id)?.value ?? ''; }
function setChecked(id, val) { const e = document.getElementById(id); if (e) e.checked = !!val; }
function getChecked(id) { return !!document.getElementById(id)?.checked; }
function setVisible(id, show) {
  const e = document.getElementById(id);
  if (e) e.style.display = show ? '' : 'none';
}
function setSlider(id, val, labelId, fmt) {
  const e = document.getElementById(id);
  if (e) e.value = val;
  if (labelId) setText(labelId, fmt(val));
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();
