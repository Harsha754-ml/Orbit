const logger = require('./logger');

const PERFORMANCE_BUDGET = 120; // ms
let samples = {};

function measure(label, fn) {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;

    if (!samples[label]) samples[label] = [];
    samples[label].push(duration);
    
    if (samples[label].length > 50) samples[label].shift();

    const avg = samples[label].reduce((a, b) => a + b, 0) / samples[label].length;
    
    if (duration > PERFORMANCE_BUDGET) {
        logger.error('performance_budget_exceeded', { label, duration, budget: PERFORMANCE_BUDGET });
    } else if (duration > avg * 2 && samples[label].length > 10) {
        logger.warn('performance_spike', { label, duration, avg });
    }

    return result;
}

module.exports = { measure };
