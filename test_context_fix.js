const contextEngine = require('./lib/contextEngine');
const assert = require('assert');

console.log('Testing ContextEngine EventEmitter support...');

let eventEmitted = false;
contextEngine.on('context-changed', (data) => {
    console.log('Event received:', data);
    eventEmitted = true;
});

// Mocking updateContext behavior to trigger event
// We can't easily trigger the powershell exec here without side effects, 
// but we can check if .on and .emit exist and work.

try {
    contextEngine.emit('context-changed', { processName: 'test' });
    assert.strictEqual(eventEmitted, true, 'Event should have been emitted and received');
    console.log('PASSED: EventEmitter support verified.');
    process.exit(0);
} catch (err) {
    console.error('FAILED:', err.message);
    process.exit(1);
}
