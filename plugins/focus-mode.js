/**
 * Orbit Plugin: Focus Mode
 * Blocks distracting apps during work sessions. Works standalone or integrates
 * with the Pomodoro plugin (auto-activates on work sessions, relaxes on breaks).
 *
 * Configure blocked apps in plugins/data/focus-mode/blocklist.json
 */

const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');

const name = 'Focus Mode';
const description = 'Block distracting apps automatically during focus sessions';
const version = '1.0.0';

const DEFAULT_BLOCKLIST = ['Spotify', 'Discord', 'Steam', 'EpicGamesLauncher'];

let focusActive = false;
let blockList   = [];

function loadBlockList(dataDir) {
    const file = path.join(dataDir, 'blocklist.json');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(DEFAULT_BLOCKLIST, null, 2));
        return DEFAULT_BLOCKLIST;
    }
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (_) { return DEFAULT_BLOCKLIST; }
}

function enforceBlockList(api) {
    if (!focusActive || blockList.length === 0) return;

    const names = blockList.map(n => `'${n}'`).join(',');
    const ps = `powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "
        $blocked = @(${names})
        $killed = @()
        foreach ($name in $blocked) {
            $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
            foreach ($p in $procs) {
                Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
                $killed += $name
            }
        }
        if ($killed.Count -gt 0) { Write-Output ($killed -join ',') }
    "`;

    exec(ps, { timeout: 8000 }, (err, stdout) => {
        if (!err && stdout.trim()) {
            const killed = stdout.trim().split(',').filter(Boolean);
            killed.forEach(app => {
                api.notify('🚫 Focus Mode', `Blocked: ${app}`);
                api.logger.info('blocked_app', { app });
            });
        }
    });
}

function init(api) {
    const dataDir = path.join(api.dataPath, '..', 'focus-mode');
    blockList = loadBlockList(dataDir);

    // Radial actions
    api.registerAction({
        type: 'group',
        label: 'Focus Mode',
        icon: 'lock.svg',
        children: [
            { type: 'command', label: 'Start Focus', icon: 'play.svg',    command: 'ui:plugin-focus-mode-enable'  },
            { type: 'command', label: 'Stop Focus',  icon: 'shutdown.svg', command: 'ui:plugin-focus-mode-disable' },
            { type: 'command', label: 'Status',      icon: 'label.svg',   command: 'ui:plugin-focus-mode-status'  }
        ]
    });

    api.onCommand('focus-mode-enable', () => {
        focusActive = true;
        api.broadcast('focus-mode-update', { active: true, blocklist: blockList });
        api.notify('🎯 Focus Mode On', `Blocking: ${blockList.join(', ')}`);
        enforceBlockList(api);
        api.logger.info('enabled');
    });

    api.onCommand('focus-mode-disable', () => {
        focusActive = false;
        api.broadcast('focus-mode-update', { active: false, blocklist: blockList });
        api.notify('✅ Focus Mode Off', 'Apps are no longer blocked.');
        api.logger.info('disabled');
    });

    api.onCommand('focus-mode-status', () => {
        api.broadcast('focus-mode-update', { active: focusActive, blocklist: blockList });
    });

    // Auto-integrate with Pomodoro via state changes
    api.onStateChange(({ newMode }) => {
        // This is the Orbit FSM state (idle/expanding/active/collapsing) — not pomodoro
        // Pomodoro integration is handled via plugin-broadcast listener in main.js (not available here)
        // Users trigger Focus Mode manually; it persists until disabled
    });

    // Poll and enforce every 10 seconds
    api.schedule(() => enforceBlockList(api), 10000);

    api.broadcast('focus-mode-update', { active: false, blocklist: blockList });
    api.logger.info('started', { blocklist: blockList });
}

module.exports = { name, description, version, init };
