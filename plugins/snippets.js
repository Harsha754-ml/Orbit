/**
 * Orbit Plugin: Text Snippets
 * Stores reusable text snippets. Clicking one writes it to the clipboard and
 * simulates Ctrl+V into whatever app was focused before Orbit opened.
 *
 * Edit plugins/data/snippets/snippets.json to manage your snippets.
 */

const fs   = require('fs');
const path = require('path');
const { clipboard, exec: _exec } = require('electron');
const { exec } = require('child_process');

const name = 'Text Snippets';
const description = 'Insert frequently-used text into any app with one click';
const version = '1.0.0';

const DEFAULTS = [
    { label: 'Email Sign-off',  text: 'Best regards,\n',         icon: 'label.svg' },
    { label: 'TODO Comment',    text: '// TODO: ',               icon: 'code.svg'  },
    { label: 'Console Log',     text: 'console.log();',          icon: 'code.svg'  },
    { label: 'Current Date',    text: () => new Date().toLocaleDateString(), icon: 'label.svg' },
    { label: 'IP Placeholder',  text: '127.0.0.1',              icon: 'web.svg'   }
];

function loadSnippets(dataDir) {
    const file = path.join(dataDir, 'snippets.json');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(file)) {
        const defaults = DEFAULTS.map(s => ({ label: s.label, text: typeof s.text === 'function' ? s.text() : s.text, icon: s.icon }));
        fs.writeFileSync(file, JSON.stringify(defaults, null, 2));
        return defaults;
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_) { return []; }
}

function init(api) {
    const snippets = loadSnippets(path.join(api.dataPath, '..', 'snippets'));

    // Register each snippet as a child action in a Snippets group
    const children = snippets.map((s, i) => ({
        type: 'command',
        label: s.label,
        icon: s.icon || 'label.svg',
        command: `ui:plugin-snippets-paste-${i}`
    }));

    api.registerAction({
        type: 'group',
        label: 'Snippets',
        icon: 'label.svg',
        children
    });

    // Register individual paste commands for each snippet index
    snippets.forEach((s, i) => {
        api.onCommand(`snippets-paste-${i}`, () => {
            const text = typeof s.text === 'function' ? s.text() : s.text;
            // Write to clipboard in main process
            const { clipboard: cb } = require('electron');
            cb.writeText(text);
            // After a short delay (for Orbit to yield focus), simulate Ctrl+V
            setTimeout(() => {
                exec(
                    'powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "Add-Type -Assembly System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^v\')"',
                    { timeout: 3000 }
                );
            }, 350);
            api.logger.info('pasted_snippet', { label: s.label });
        });
    });

    api.logger.info('started', { count: snippets.length });
}

module.exports = { name, description, version, init };
