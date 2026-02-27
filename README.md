# Orbit Premium

A high-performance, aesthetically-driven radial launcher for Windows 11.

```text
    [ Trigger (AHK) ] <---- Hotkey in config.json
           |
    [ Main Process (Electron) ] <--- Config/Theme Watcher
           |                     |
    [ Preload (Bridge) ] <-------|--- Secure IPC
           |
    [ Renderer (Vanilla JS) ] <--- State Machine (IDLE -> EXPANDING -> ACTIVE)
           |
    [ CSS Variables (Themes) ]
```

## Interaction Flow

1. **Trigger**: Middle Mouse (default) launches or shows the hidden window.
2. **Expand**: Center click ripples and expands primary items.
3. **Navigate**: Click group items to drill down; Right-click to go back.
4. **Execute**: Click command items to launch apps or system functions.

## Features

- **Nested Groups**: Unlimited nesting (default limit 5).
- **Theme System**: 4 bundled themes (Dark Neon, Minimal Frost, Cyber Blue, Mono Glass).
- **Proximity Hover**: Items react before direct cursor interaction.
- **Parallax**: Subtle motion based on cursor position.
- **Auto-Detect**: Intelligent path resolution for VS Code and Terminal.

## Configuration

Edit `config.json` to customize behavior:

- `hotkey`: Any valid AHK hotkey.
- `radius`: Distance from center in pixels.
- `animationSpeed`: Multiplier for transition durations.
- `devMode`: Enables labels and runtime state overlay.

## Security & Performance

- **Zero-Node Renderer**: Strictly enforced boundary via context bridge.
- **Memory Stable**: DOM reuse strategy for deep nesting.
- **Latency**: Window preloading ensures <100ms reveal time.

## Troubleshooting

- **No Trigger**: Ensure AutoHotkey v2 is installed and `orbit-trigger.ahk` is running.
- **Config Crash**: Malformed JSON results in automatic fallback to safe defaults.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
