const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class PluginLoader {
    constructor() {
        this.pluginsPath = path.join(process.cwd(), 'plugins');
        this.plugins = [];
    }

    loadPlugins(orbitContext) {
        if (!fs.existsSync(this.pluginsPath)) {
            fs.mkdirSync(this.pluginsPath);
            return;
        }

        const files = fs.readdirSync(this.pluginsPath);
        files.forEach(file => {
            if (file.endsWith('.js')) {
                this.loadPlugin(file, orbitContext);
            }
        });
    }

    loadPlugin(filename, orbitContext) {
        try {
            const pluginPath = path.join(this.pluginsPath, filename);
            const pluginModule = require(pluginPath);

            // Orbit 2.0 Sandboxed API Surface
            const pluginApi = {
                registerAction: (action) => orbitContext.registerAction(action),
                onStateChange: (handler) => orbitContext.onStateChange(handler),
                logger: {
                    info: (m, d) => logger.info(`plugin_${filename}`, { msg: m, ...d }),
                    warn: (m, d) => logger.warn(`plugin_${filename}`, { msg: m, ...d }),
                    error: (m, d) => logger.error(`plugin_${filename}`, { msg: m, ...d })
                },
                config: orbitContext.config
            };

            if (typeof pluginModule.init === 'function') {
                pluginModule.init(pluginApi);
                this.plugins.push({ filename, name: pluginModule.name || filename });
                logger.info('plugin_loaded', { name: filename });
            } else {
                logger.warn('plugin_missing_init', { name: filename });
            }
        } catch (err) {
            logger.error('plugin_load_failed', { name: filename, error: err.message });
        }
    }
}

module.exports = new PluginLoader();
