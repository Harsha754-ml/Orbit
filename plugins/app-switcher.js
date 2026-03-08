/**
 * Orbit Plugin: App Switcher
 * Shows currently open windows as a widget. Click any entry to bring it to the foreground.
 * Uses WScript.Shell.AppActivate — no external tools required.
 */

const { exec } = require('child_process');

const name = 'App Switcher';
const description = 'See and switch between open windows without leaving your flow';
const version = '1.0.0';

let openWindows = [];

const PS_GET_WINDOWS = `powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "Get-Process | Where-Object { $_.MainWindowTitle -ne '' -and $_.MainWindowHandle -ne 0 } | Select-Object Id, Name, @{N='Title';E={$_.MainWindowTitle}} | ConvertTo-Json -Compress"`;

function focusWindowCmd(pid) {
    return `powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "$wsh=New-Object -COM WScript.Shell; $wsh.AppActivate(${pid})"`;
}

function refreshWindows(api) {
    exec(PS_GET_WINDOWS, { timeout: 4000 }, (err, stdout) => {
        if (err || !stdout.trim()) return;
        try {
            let raw = JSON.parse(stdout.trim());
            // PowerShell returns object (not array) when only one result
            if (!Array.isArray(raw)) raw = [raw];
            openWindows = raw
                .filter(w => w.Title && w.Title.length > 0)
                .map(w => ({ pid: w.Id, name: w.Name, title: w.Title }));
            api.broadcast('app-switcher-update', { windows: openWindows });
        } catch (_) {}
    });
}

function init(api) {
    api.registerAction({
        type: 'command',
        label: 'App Switcher',
        icon: 'taskmanager.svg',
        command: 'ui:toggle-widget-app-switcher'
    });

    // Focus a window by PID — triggered from renderer widget click
    api.onCommand('app-switcher-focus', ({ pid }) => {
        exec(focusWindowCmd(pid), { timeout: 3000 }, () => {});
    });

    // Refresh window list every 3 seconds
    refreshWindows(api);
    api.schedule(() => refreshWindows(api), 3000);

    api.logger.info('started');
}

module.exports = { name, description, version, init };
