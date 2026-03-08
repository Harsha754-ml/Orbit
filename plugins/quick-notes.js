/**
 * Orbit Plugin: Quick Notes
 * Watches a notes.txt file for changes and displays content in a widget.
 * "Open Notes" action opens the file in the default system text editor.
 */

const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

const name = 'Quick Notes';
const description = 'Live sticky note from a plain-text file — edit in any editor';
const version = '1.0.0';

function init(api) {
    const dataDir = api.dataPath;
    const notesFile = path.join(dataDir, 'notes.txt');

    // Ensure data directory and default file exist
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(notesFile)) {
        fs.writeFileSync(notesFile, '# My Notes\n\n- Double-click this file to edit\n- Changes appear in real-time in Orbit\n');
    }

    function broadcastNotes() {
        try {
            const content = fs.readFileSync(notesFile, 'utf8');
            api.broadcast('notes-update', { content, path: notesFile });
        } catch (e) {
            api.broadcast('notes-update', { content: '(Error reading notes.txt)', path: notesFile });
        }
    }

    // Watch file for live updates
    try {
        fs.watch(notesFile, { persistent: false }, () => {
            broadcastNotes();
        });
    } catch (_) {
        // fs.watch unavailable — fall back to polling
        api.schedule(broadcastNotes, 3000);
    }

    // Initial broadcast
    broadcastNotes();

    // Register actions
    api.registerAction({
        type: 'group',
        label: 'Notes',
        icon: 'notes.svg',
        children: [
            {
                type: 'command',
                label: 'View Notes',
                icon: 'notes.svg',
                command: 'ui:toggle-widget-notes'
            },
            {
                type: 'command',
                label: 'Edit Notes',
                icon: 'code.svg',
                command: 'ui:plugin-quick-notes-open'
            }
        ]
    });

    api.onCommand('quick-notes-open', () => {
        shell.openPath(notesFile);
    });

    api.logger.info('started', { file: notesFile });
}

module.exports = { name, description, version, init };
