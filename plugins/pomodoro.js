/**
 * Orbit Plugin: Pomodoro Timer
 * Classic 25/5 focus-break cycle with Windows notifications.
 * Control via radial menu actions; live countdown displayed in the widget.
 */

const name = 'Pomodoro Timer';
const description = '25/5 focus timer with desktop notifications';
const version = '1.1.0';

const WORK_SEC  = 25 * 60;
const BREAK_SEC = 5  * 60;

let timerState  = 'idle';   // 'idle' | 'work' | 'break' | 'paused'
let remaining   = WORK_SEC;
let pausedState = null;     // state that was active when paused

function fmt(secs) {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m}:${s}`;
}

function init(api) {
    // Radial menu group
    api.registerAction({
        type: 'group',
        label: 'Pomodoro',
        icon: 'timer.svg',
        children: [
            { type: 'command', label: 'Start Focus', icon: 'play.svg',  command: 'ui:plugin-pomodoro-start' },
            { type: 'command', label: 'Pause',       icon: 'pause.svg', command: 'ui:plugin-pomodoro-pause' },
            { type: 'command', label: 'Reset',       icon: 'restart.svg', command: 'ui:plugin-pomodoro-reset' },
            { type: 'command', label: 'Widget',      icon: 'timer.svg', command: 'ui:toggle-widget-pomodoro' }
        ]
    });

    // --- Command handlers ---
    api.onCommand('pomodoro-start', () => {
        if (timerState === 'idle' || timerState === 'paused') {
            timerState = pausedState || 'work';
            pausedState = null;
            pushState(api);
        }
    });

    api.onCommand('pomodoro-pause', () => {
        if (timerState === 'work' || timerState === 'break') {
            pausedState = timerState;
            timerState = 'paused';
            pushState(api);
        }
    });

    api.onCommand('pomodoro-reset', () => {
        timerState  = 'idle';
        remaining   = WORK_SEC;
        pausedState = null;
        pushState(api);
    });

    // --- Tick every second ---
    api.schedule(() => {
        if (timerState !== 'work' && timerState !== 'break') return;

        remaining--;
        if (remaining < 0) {
            if (timerState === 'work') {
                api.notify('🍅 Pomodoro Complete!', 'Great work! Time for a 5-minute break.');
                timerState = 'break';
                remaining  = BREAK_SEC;
            } else {
                api.notify('⏰ Break Over!', 'Ready for another focus session?');
                timerState = 'idle';
                remaining  = WORK_SEC;
            }
        }

        pushState(api);
    }, 1000);

    // Initial broadcast
    pushState(api);
    api.logger.info('started');
}

function pushState(api) {
    api.broadcast('pomodoro-update', {
        state: timerState,
        remaining,
        display: fmt(remaining),
        isWork:  timerState === 'work'
    });
}

module.exports = { name, description, version, init };
