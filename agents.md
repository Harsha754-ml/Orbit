# Orbit Agent Roles

## UI Agent

- **Responsibility**: Radial UI layout, glassmorphism styling, and staggered animations.
- **Constraints**: 140px radius, #0f1115 base, backdrop blur, no text labels.

## System Agent

- **Responsibility**: Child process execution, path detection for VS Code/Terminal, and power commands.
- **Constraints**: Absolute path fallbacks, secure IPC handling, try-catch wrappers.

## Build Agent

- **Responsibility**: `package.json` configuration, `electron-builder` settings, and directory structure.
- **Constraints**: Windows 11 x64 target (NSIS), single instance enforcement.

## Security Agent

- **Responsibility**: IPC bridge security, context isolation, and node integration management.
- **Constraints**: `contextBridge` usage, no direct Node access in renderer.
