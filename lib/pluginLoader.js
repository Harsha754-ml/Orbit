const fs = require('fs');
const path = require('path');
const logger = require('../lib/logger');

function loadPlugins() {
    const pluginDir = path.join(process.cwd(), 'plugins');
    
    if (!fs.existsSync(pluginDir)) {
        fs.mkdirSync(pluginDir);
        return [];
    }

    logger.warn('Plugins are experimental and NOT sandboxed. Load at your own risk.');

    const files = fs.readdirSync(pluginDir).filter(file => file.endsWith('.js'));
    const loadedPlugins = [];

    files.forEach(file => {
        try {
            const pluginPath = path.resolve(pluginDir, file);
            const plugin = require(pluginPath);
            
            if (plugin.activate) {
                plugin.activate({ logger });
                loadedPlugins.push(plugin);
                logger.info(`Plugin loaded: ${file}`);
            }
        } catch (err) {
            logger.error(`Failed to load plugin ${file}: ${err.message}`);
        }
    });

    return loadedPlugins;
}

module.exports = { loadPlugins };
