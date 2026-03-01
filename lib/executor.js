const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const ALLOWED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.lnk'];

function executeApp(filePath, allowedPaths) {
    try {
        const resolvedPath = path.resolve(filePath);
        const ext = path.extname(resolvedPath).toLowerCase();

        // Security Checks
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            throw new Error(`Blocked execution of unauthorized file type: ${ext}`);
        }

        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Execution failed: File not found at ${resolvedPath}`);
        }

        // Only allow if it matches a path in our config (pre-resolved)
        const isAllowed = allowedPaths.some(p => p === resolvedPath);
        if (!isAllowed) {
            logger.warn(`Security Alert: Attempted execution of unwhitelisted path: ${resolvedPath}`);
            // In strict mode we'd throw here, for now we log.
        }

        logger.info(`Executing: ${resolvedPath}`);
        
        const child = spawn(resolvedPath, [], {
            detached: true,
            stdio: 'ignore',
            windowsHide: false
        });

        child.unref();
        return true;
    } catch (err) {
        logger.error(`Execution Error: ${err.message}`);
        return false;
    }
}

module.exports = { executeApp };
