# Orbit

Radial Launcher for Windows 11 x64.


<img width="513" height="485" alt="image" src="https://github.com/user-attachments/assets/960ee8a8-5f5c-4e32-b3c8-665616035513" />



## Features

- **Radial Menu**: 8 customizable items.
- **Glassmorphism**: Modern Windows 11 aesthetic.
- **Middle Click Toggle**: Trigger from anywhere via AutoHotkey.
- **Single Instance**: Optimized performance and resource usage.
- **Path Detection**: Automatic fallback for VS Code and Windows Terminal.

## Architecture

- **Main Process**: Handles system calls, window life-cycle, and cursor positioning.
- **Preload**: Secure IPC bridge using `contextBridge`.
- **Renderer**: Vanilla JS/CSS for the radial UI and animations.
- **Integration**: AHK v2 script for system-wide hotkey.

## Tech Stack

- Electron
- Node.js
- AutoHotkey v2
- HTML5/CSS3
- Vanilla JS
