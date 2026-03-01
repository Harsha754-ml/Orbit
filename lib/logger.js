const fs = require('fs');
const path = require('path');

const LOG_FILE = 'orbit.log';
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

const logPath = path.join(process.cwd(), LOG_FILE);

function rotateLogs() {
    try {
        if (fs.existsSync(logPath)) {
            const stats = fs.statSync(logPath);
            if (stats.size > MAX_LOG_SIZE) {
                const backupPath = `${logPath}.1`;
                fs.renameSync(logPath, backupPath);
            }
        }
    } catch (e) {
        console.error('Log rotation failed:', e);
    }
}

function log(level, eventOrMsg, data = {}) {
    rotateLogs();
    
    const timestamp = new Date().toISOString();
    const logObject = {
        ts: timestamp,
        level: level.toUpperCase(),
        ...(typeof eventOrMsg === 'object' ? eventOrMsg : { msg: eventOrMsg }),
        ...data
    };

    const formattedMessage = JSON.stringify(logObject) + '\n';
    
    try {
        fs.appendFileSync(logPath, formattedMessage);
    } catch (e) {
        console.error('File logging failed:', e);
    }
    
    // Write to console in dev
    if (process.env.NODE_ENV !== 'production') {
        process.stdout.write(formattedMessage);
    }
}

module.exports = {
    info: (msg, data) => log('info', msg, data),
    warn: (msg, data) => log('warn', msg, data),
    error: (msg, data) => log('error', msg, data),
    debug: (msg, data) => log('debug', msg, data)
};
