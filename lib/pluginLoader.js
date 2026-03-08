const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class PluginLoader {
    constructor() {
        this.pluginsPath = path.join(process.cwd(), 'plugins');
        this.plugins = new Map();        // command-key → handler
        this.pluginCommands = new Map();
        this.mainWindow = null;
    }

    setWindow(win) {
        this.mainWindow = win;
    }

    loadPlugins(orbitContext) {
        if (!fs.existsSync(this.pluginsPath)) {
            fs.mkdirSync(this.pluginsPath, { recursive: true });
            return;
        }
        fs.readdirSync(this.pluginsPath)
            .filter(f => f.endsWith('.js'))
            .forEach(file => this.loadPlugin(file, orbitContext));
    }

    loadPlugin(filename, orbitContext) {
        try {
            const pluginPath = path.join(this.pluginsPath, filename);
            const pluginModule = require(pluginPath);
            const pluginName = filename.replace('.js', '');
            const intervals = [];

            const pluginApi = {
                // Register a new radial action
                registerAction: (action) => orbitContext.registerAction(action),

                // Subscribe to Orbit FSM state changes
                onStateChange: (handler) => orbitContext.onStateChange(handler),

                // Register a command handler (e.g. 'start', 'pause', 'reset')
                // Renderer calls sendPluginCommand('plugin-<name>-<cmd>') to trigger
                onCommand: (commandName, handler) => {
                    this.pluginCommands.set(`plugin-${pluginName}-${commandName}`, handler);
                },

                // Push real-time data to the renderer widget
                broadcast: (channel, data) => {
                    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                        this.mainWindow.webContents.send('plugin-broadcast', {
                            plugin: pluginName,
                            channel,
                            data
                        });
                    }
                },

                // Schedule a recurring task; all intervals are tracked for cleanup
                schedule: (fn, ms) => {
                    const id = setInterval(fn, ms);
                    intervals.push(id);
                    return id;
                },

                // Show a Windows system notification
                notify: (title, body) => {
                    try {
                        const { Notification } = require('electron');
                        new Notification({ title, body }).show();
                    } catch (e) {
                        logger.warn(`plugin_notify_failed`, { plugin: pluginName, err: e.message });
                    }
                },

                logger: {
                    info: (m, d) => logger.info(`plugin_${pluginName}`, { msg: m, ...(d || {}) }),
                    warn: (m, d) => logger.warn(`plugin_${pluginName}`, { msg: m, ...(d || {}) }),
                    error: (m, d) => logger.error(`plugin_${pluginName}`, { msg: m, ...(d || {}) })
                },

                config: orbitContext.config,

                // Persistent storage path for this plugin's data files
                dataPath: path.join(this.pluginsPath, 'data', pluginName)
            };

            if (typeof pluginModule.init === 'function') {
                pluginModule.init(pluginApi);
                this.plugins.set(filename, {
                    filename,
                    name: pluginModule.name || pluginName,
                    description: pluginModule.description || '',
                    version: pluginModule.version || '1.0.0',
                    enabled: true,
                    intervals
                });
                logger.info('plugin_loaded', { name: filename });
            } else {
                logger.warn('plugin_missing_init', { name: filename });
            }
        } catch (err) {
            logger.error('plugin_load_failed', { name: filename, error: err.message });
        }
    }

    handleCommand(command, data) {
        const handler = this.pluginCommands.get(command);
        if (handler) {
            try {
                handler(data);
            } catch (e) {
                logger.error('plugin_command_error', { command, error: e.message });
            }
        } else {
            logger.warn('unknown_plugin_command', { command });
        }
    }

    getPluginList() {
        return Array.from(this.plugins.values()).map(
            ({ filename, name, description, version, enabled }) =>
                ({ filename, name, description, version, enabled })
        );
    }

    openPluginsFolder() {
        const { shell } = require('electron');
        shell.openPath(this.pluginsPath);
    }
}

module.exports = new PluginLoader();
