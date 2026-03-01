const logger = require('./logger');

let samples = {};

function measure(label, fn) {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;

    if (!samples[label]) samples[label] = [];
    samples[label].push(duration);
    
    if (samples[label].length > 50) samples[label].shift();

    const avg = samples[label].reduce((a, b) => a + b, 0) / samples[label].length;
    
    if (duration > avg * 1.5 && samples[label].length > 10) {
        logger.warn(`Performance Spike [${label}]: ${duration.toFixed(2)}ms (Avg: ${avg.toFixed(2)}ms)`);
    }

    return result;
}

module.exports = { measure };
