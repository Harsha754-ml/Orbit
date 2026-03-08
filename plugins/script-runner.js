/**
 * Orbit Plugin: Script Runner
 * Run custom shell scripts from the radial menu.
 * Output streams live into the Script Runner widget.
 *
 * Edit plugins/data/script-runner/scripts.json to add your own scripts.
 */

const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const name = 'Script Runner';
const description = 'Execute custom scripts and view live output in the widget';
const version = '1.0.0';

const DEFAULTS = [
    { label: 'Git Status',  cmd: 'git',      args: ['status'],          cwd: process.cwd(), icon: 'code.svg'     },
    { label: 'NPM Build',   cmd: 'npm',      args: ['run', 'build'],    cwd: process.cwd(), icon: 'terminal.svg' },
    { label: 'List Files',  cmd: 'cmd',      args: ['/c', 'dir /b'],    cwd: process.cwd(), icon: 'label.svg'    },
    { label: 'Disk Usage',  cmd: 'powershell', args: ['-NoProfile', '-Command', 'Get-PSDrive C | Select-Object Used,Free'], cwd: process.cwd(), icon: 'monitor.svg' }
];

function loadScripts(dataDir) {
    const file = path.join(dataDir, 'scripts.json');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(DEFAULTS, null, 2));
        return DEFAULTS;
    }
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (_) { return []; }
}

function runScript(script, api) {
    const lines = [];

    api.broadcast('script-output', {
        running: true,
        label: script.label,
        lines: [`▶ Running: ${script.label}`, '']
    });

    const proc = spawn(script.cmd, script.args || [], {
        cwd: script.cwd || process.cwd(),
        shell: true,
        windowsHide: true
    });

    const push = (data, isErr) => {
        const text = data.toString().trimEnd();
        text.split('\n').forEach(l => lines.push(isErr ? `⚠ ${l}` : l));
        api.broadcast('script-output', { running: true, label: script.label, lines: lines.slice(-30) });
    };

    proc.stdout.on('data', d => push(d, false));
    proc.stderr.on('data', d => push(d, true));

    proc.on('close', code => {
        lines.push('');
        lines.push(code === 0 ? '✓ Completed successfully' : `✗ Exited with code ${code}`);
        api.broadcast('script-output', { running: false, label: script.label, lines: lines.slice(-30) });
        api.logger.info('script_done', { label: script.label, code });
    });

    proc.on('error', err => {
        lines.push(`✗ Error: ${err.message}`);
        api.broadcast('script-output', { running: false, label: script.label, lines });
    });
}

function init(api) {
    const dataDir = path.join(api.dataPath, '..', 'script-runner');
    const scripts = loadScripts(dataDir);

    // Show widget toggle + each script as a child action
    const children = [
        { type: 'command', label: 'Show Output', icon: 'terminal.svg', command: 'ui:toggle-widget-script-runner' },
        ...scripts.map((s, i) => ({
            type: 'command',
            label: s.label,
            icon: s.icon || 'terminal.svg',
            command: `ui:plugin-script-runner-run-${i}`
        }))
    ];

    api.registerAction({ type: 'group', label: 'Scripts', icon: 'terminal.svg', children });

    // Register a run command per script index
    scripts.forEach((s, i) => {
        api.onCommand(`script-runner-run-${i}`, () => runScript(s, api));
    });

    api.logger.info('started', { scripts: scripts.length });
}

module.exports = { name, description, version, init };
