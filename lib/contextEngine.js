const { exec } = require('child_process');
const logger = require('./logger');

class ContextEngine {
    constructor() {
        this.currentContext = {
            processName: 'unknown',
            windowTitle: 'unknown',
            timestamp: Date.now()
        };
        this.pollInterval = 2000; // Poll every 2s
        this.intervalId = null;
    }

    start() {
        if (this.intervalId) return;
        this.intervalId = setInterval(() => this.updateContext(), this.pollInterval);
        logger.info('context_engine_started');
    }

    stop() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = null;
    }

    updateContext() {
        // PowerShell command to get the foreground window's process name
        const psCommand = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class User32 { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); }'; $id = [User32]::GetForegroundWindow(); Get-Process | Where-Object { $_.MainWindowHandle -eq $id } | Select-Object -ExpandProperty Name`;

        exec(`powershell -Command "${psCommand}"`, (error, stdout, stderr) => {
            if (error) {
                // Silently handle errors as foreground window might be null or transitioning
                return;
            }

            const processName = stdout.trim().toLowerCase();
            if (processName && processName !== this.currentContext.processName) {
                const oldContext = { ...this.currentContext };
                this.currentContext = {
                    processName: processName,
                    timestamp: Date.now()
                };
                logger.info('context_changed', { from: oldContext.processName, to: processName });
                // In Orbit 2.0, this would trigger dynamic action overrides
            }
        });
    }

    getContext() {
        return { ...this.currentContext };
    }
}

module.exports = new ContextEngine();
