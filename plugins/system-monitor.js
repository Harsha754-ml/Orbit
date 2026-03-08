/**
 * Orbit Plugin: System Monitor
 * Broadcasts real-time CPU & RAM usage to the renderer widget every 2 seconds.
 */

const os = require('os');

const name = 'System Monitor';
const description = 'Real-time CPU & RAM usage overlay widget';
const version = '1.1.0';

// Compare two CPU snapshots to compute usage %
function computeCpuPercent(start, end) {
    let totalIdle = 0;
    let totalTick = 0;
    end.forEach((cpu, i) => {
        const s = start[i].times;
        const e = cpu.times;
        for (const type of Object.keys(e)) {
            totalTick += e[type] - (s[type] || 0);
        }
        totalIdle += e.idle - s.idle;
    });
    if (totalTick === 0) return 0;
    return Math.round(100 - (100 * totalIdle) / totalTick);
}

function init(api) {
    // Register toggle action
    api.registerAction({
        type: 'command',
        label: 'System Monitor',
        icon: 'monitor.svg',
        command: 'ui:toggle-widget-sysmon'
    });

    let prevCpus = os.cpus();

    // Broadcast stats every 2 seconds
    api.schedule(() => {
        const currCpus = os.cpus();
        const cpu = computeCpuPercent(prevCpus, currCpus);
        prevCpus = currCpus;

        const total = os.totalmem();
        const used = total - os.freemem();
        const uptime = os.uptime();

        api.broadcast('sysmon-update', {
            cpu,
            ramUsedMB: Math.round(used / 1024 / 1024),
            ramTotalMB: Math.round(total / 1024 / 1024),
            ramPct: Math.round((used / total) * 100),
            uptimeHr: Math.floor(uptime / 3600),
            uptimeMin: Math.floor((uptime % 3600) / 60)
        });
    }, 2000);

    api.logger.info('started');
}

module.exports = { name, description, version, init };
