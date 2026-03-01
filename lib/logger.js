const fs = require('fs');
const path = require('path');

const logPath = path.join(process.cwd(), 'orbit.log');
const logStream = fs.createWriteStream(logPath, { flags: 'a' });

function log(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message} ${args.length ? JSON.stringify(args) : ''}\n`;
    
    // Write to file
    logStream.write(formattedMessage);
    
    // Write to console in dev
    if (process.env.NODE_ENV !== 'production') {
        console.log(formattedMessage.trim());
    }
}

module.exports = {
    info: (msg, ...args) => log('info', msg, ...args),
    warn: (msg, ...args) => log('warn', msg, ...args),
    error: (msg, ...args) => log('error', msg, ...args),
    debug: (msg, ...args) => log('debug', msg, ...args)
};
