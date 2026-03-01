const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const logger = require('./logger');

const ajv = new Ajv();

const schema = {
    type: 'object',
    properties: {
        appVersion: { type: 'string' },
        hotkey: { type: 'string' },
        radius: { type: 'number', minimum: 50 },
        primaryRadius: { type: 'number' },
        groupRadius: { type: 'number' },
        activeTheme: { type: 'string' },
        devMode: { type: 'boolean' },
        actions: { type: 'array' }
    },
    required: ['radius', 'actions']
};

const CONFIG_PATH = path.join(process.cwd(), 'config.json');
const DEFAULT_PATH = path.join(process.cwd(), 'defaultConfig.json');

function migrateConfig(config) {
    if (!config.appVersion) {
        config.appVersion = '1.0.0'; // Assume v1 if missing
        logger.info('Migrating config to v1.0.0');
    }
    return config;
}

function normalizeActions(actions) {
    return actions.map(action => {
        const normalized = { ...action };
        if (action.command && action.command !== 'auto-detect' && !action.command.startsWith('ui:')) {
            try {
                normalized.resolvedPath = path.resolve(action.command);
            } catch (e) {
                logger.warn(`Failed to resolve path for action: ${action.label}`);
            }
        }
        if (action.children) {
            normalized.children = normalizeActions(action.children);
        }
        return normalized;
    });
}

function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) {
            logger.info('Config missing, creating from defaults');
            fs.copyFileSync(DEFAULT_PATH, CONFIG_PATH);
        }

        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        let config = JSON.parse(raw);

        const validate = ajv.compile(schema);
        if (!validate(config)) {
            logger.error('Config validation failed:', validate.errors);
            throw new Error('Invalid Config');
        }

        config = migrateConfig(config);
        config.actions = normalizeActions(config.actions);
        
        return config;
    } catch (err) {
        logger.error(`Critical config failure: ${err.message}. Restoring defaults.`);
        const timestamp = Date.now();
        if (fs.existsSync(CONFIG_PATH)) {
            fs.renameSync(CONFIG_PATH, `${CONFIG_PATH}.${timestamp}.bak`);
        }
        fs.copyFileSync(DEFAULT_PATH, CONFIG_PATH);
        return JSON.parse(fs.readFileSync(DEFAULT_PATH, 'utf-8'));
    }
}

function writeConfigSafe(config) {
    const tempPath = `${CONFIG_PATH}.tmp`;
    try {
        const data = JSON.stringify(config, null, 2);
        const fd = fs.openSync(tempPath, 'w');
        fs.writeSync(fd, data);
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        
        fs.renameSync(tempPath, CONFIG_PATH);
        logger.info('Config saved atomically');
    } catch (err) {
        logger.error(`Failed to save config: ${err.message}`);
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
}

module.exports = {
    loadConfig,
    writeConfigSafe
};
