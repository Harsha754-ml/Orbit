const orbitState = require('../lib/state');
const logger = require('../lib/logger');

// Mock logger to avoid cluttering logs
const results = [];

function testTransition(from, to, expectedSuccess) {
    orbitState.state.mode = from;
    orbitState.setMode(to);
    
    const success = orbitState.state.mode === to;
    if (success === expectedSuccess) {
        console.log(`✅ ${from} -> ${to}: ${success ? 'Allowed' : 'Blocked'}`);
    } else {
        console.error(`❌ ${from} -> ${to}: Expected ${expectedSuccess ? 'Allowed' : 'Blocked'}, but got ${success ? 'Allowed' : 'Blocked'}`);
        process.exit(1);
    }
}

console.log('--- Orbit 2.0 FSM Unit Tests ---');

// Valid moves
testTransition('idle', 'expanding', true);
testTransition('expanding', 'active', true);
testTransition('active', 'collapsing', true);
testTransition('collapsing', 'idle', true);

// Illegal moves
testTransition('idle', 'active', false);
testTransition('active', 'idle', false);
testTransition('expanding', 'idle', false);

console.log('--- All tests passed! ---');
