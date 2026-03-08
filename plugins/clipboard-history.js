/**
 * Orbit Plugin: Clipboard History
 * Tracks the last 10 unique clipboard text entries and displays them in a widget.
 * Clicking a widget item copies it back to the clipboard.
 */

const { clipboard } = require('electron');

const name = 'Clipboard History';
const description = 'Tracks recent clipboard items for instant re-paste';
const version = '1.0.0';

const MAX_ITEMS = 10;
let history = [];
let lastText = '';

function init(api) {
    api.registerAction({
        type: 'command',
        label: 'Clipboard',
        icon: 'clipboard.svg',
        command: 'ui:toggle-widget-clipboard'
    });

    // Poll clipboard for changes every 500 ms
    api.schedule(() => {
        try {
            const text = clipboard.readText().trim();
            if (text && text !== lastText) {
                lastText = text;
                // Deduplicate — move to top if already exists
                history = [text, ...history.filter(h => h !== text)].slice(0, MAX_ITEMS);
                api.broadcast('clipboard-update', { history });
            }
        } catch (_) {
            // Clipboard unavailable (e.g., another process holding it)
        }
    }, 600);

    // Register a 'copy' command so widget clicks can re-copy via IPC
    api.onCommand('copy', ({ index }) => {
        if (history[index] !== undefined) {
            clipboard.writeText(history[index]);
            lastText = history[index]; // Prevent re-adding same item
        }
    });

    api.logger.info('started');
}

module.exports = { name, description, version, init };
