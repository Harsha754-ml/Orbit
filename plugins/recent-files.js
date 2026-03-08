/**
 * Orbit Plugin: Recent Files
 * Reads Windows Recent Items and exposes the last 10 as a radial group.
 * Resolves .lnk shortcuts to real file paths.
 */

const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { shell } = require('electron');

const name = 'Recent Files';
const description = 'Instantly open your most recently accessed files';
const version = '1.0.0';

const RECENT_DIR = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Recent');
const MAX_RECENT  = 10;

// Resolve a .lnk file to its target path via PowerShell
function resolveLnk(lnkPath, callback) {
    const safe = lnkPath.replace(/'/g, "''");
    exec(
        `powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "(New-Object -COM WScript.Shell).CreateShortcut('${safe}').TargetPath"`,
        { timeout: 3000 },
        (err, stdout) => {
            if (err) { callback(null); return; }
            const target = stdout.trim();
            callback(target && target.length > 0 ? target : null);
        }
    );
}

function getRecentFiles(callback) {
    if (!fs.existsSync(RECENT_DIR)) { callback([]); return; }

    let lnks;
    try {
        lnks = fs.readdirSync(RECENT_DIR)
            .filter(f => f.endsWith('.lnk'))
            .map(f => ({ name: f, full: path.join(RECENT_DIR, f), mtime: fs.statSync(path.join(RECENT_DIR, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime)
            .slice(0, MAX_RECENT);
    } catch (_) { callback([]); return; }

    const results = [];
    let pending = lnks.length;
    if (pending === 0) { callback([]); return; }

    lnks.forEach(lnk => {
        resolveLnk(lnk.full, target => {
            if (target && fs.existsSync(target)) {
                results.push({ label: path.basename(target), path: target, ext: path.extname(target).toLowerCase() });
            }
            if (--pending === 0) callback(results.slice(0, MAX_RECENT));
        });
    });
}

function init(api) {
    let recentActions = [];

    function refresh() {
        getRecentFiles(files => {
            recentActions = files.map(f => ({
                type: 'cmd',
                label: f.label.length > 20 ? f.label.slice(0, 20) + '…' : f.label,
                icon: 'label.svg',
                // Use start command to open with default app
                cmd: `start "" "${f.path.replace(/"/g, '\\"')}"`
            }));

            // Broadcast for widget display (full label + path)
            api.broadcast('recent-files-update', { files: files.slice(0, MAX_RECENT) });
        });
    }

    // Register as a dynamic group — rebuilds on every refresh
    api.registerAction({
        type: 'group',
        label: 'Recent Files',
        icon: 'label.svg',
        get children() { return recentActions; }
    });

    // Initial load + refresh every 60s
    refresh();
    api.schedule(refresh, 60 * 1000);

    api.logger.info('started', { recentDir: RECENT_DIR });
}

module.exports = { name, description, version, init };
