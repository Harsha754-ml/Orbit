const { EventEmitter } = require('events');
const logger = require('./logger');

/**
 * Finite State Machine for Orbit
 * States: IDLE, EXPANDING, ACTIVE, COLLAPSING
 */
class OrbitState extends EventEmitter {
    constructor() {
        super();
        this.modes = {
            IDLE: 'idle',
            EXPANDING: 'expanding',
            ACTIVE: 'active',
            COLLAPSING: 'collapsing'
        };

        this.state = {
            mode: this.modes.IDLE,
            cursor: { x: 0, y: 0 },
            activeGroup: [], // Stack for nesting
            theme: 'Dark Neon',
            devMode: false
        };

        this.baselineMemory = process.memoryUsage().heapUsed;
        this.setupMonitoring();
    }

    setMode(newMode) {
        if (!Object.values(this.modes).includes(newMode)) {
            logger.warn(`Invalid state transition attempted: ${newMode}`);
            return;
        }

        const oldMode = this.state.mode;
        this.state.mode = newMode;
        
        logger.info(`State transition: ${oldMode} -> ${newMode}`);
        this.emit('modeChanged', { newMode, oldMode });

        // Interaction safety failsafe
        if (newMode === this.modes.EXPANDING || newMode === this.modes.COLLAPSING) {
            this.lockTimer = setTimeout(() => {
                if (this.state.mode === newMode) {
                    logger.warn(`Failsafe: State ${newMode} timed out. Resetting to IDLE/ACTIVE.`);
                    this.setMode(newMode === this.modes.EXPANDING ? this.modes.ACTIVE : this.modes.IDLE);
                }
            }, 1000); // 1s safety net
        } else {
            if (this.lockTimer) clearTimeout(this.lockTimer);
        }
    }

    isLocked() {
        return this.state.mode === this.modes.EXPANDING || this.state.mode === this.modes.COLLAPSING;
    }

    setCursor(x, y) {
        this.state.cursor = { x, y };
        this.emit('cursorChanged', this.state.cursor);
    }

    setupMonitoring() {
        setInterval(() => {
            const current = process.memoryUsage().heapUsed;
            const diffMB = (current - this.baselineMemory) / 1024 / 1024;
            
            if (diffMB > 100) {
                logger.warn(`Memory growth alert: +${diffMB.toFixed(2)}MB above baseline`);
            }
        }, 30000);

        process.on('warning', (warning) => {
            logger.warn(`Node Warning: ${warning.name} - ${warning.message}\n${warning.stack}`);
        });
    }

    get() {
        return { ...this.state };
    }
}

module.exports = new OrbitState();
