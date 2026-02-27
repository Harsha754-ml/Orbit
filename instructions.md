# Setup Instructions

## 1. Prerequisites

- Install [Node.js LTS](https://nodejs.org/).
- Install [AutoHotkey v2](https://www.autohotkey.com/).

## 2. Project Initialization

```powershell
cd orbit
npm install
```

## 3. Configuration & Themes

- Edit `config.json` to customize your hotkey, radius, and action structure.
- Edit `themes.json` to define custom UI aesthetics.
- Themes and Config reload automatically on save.

## 4. Development & Production

- **Dev Mode**: Set `"devMode": true` in `config.json` for live overlays and labels.
- **Run**: `npm start`
- **Build**: `npm run build`

## 5. Deployment

- Launch `orbit-trigger.ahk` (it reads the hotkey from your config).
- The app must be running or in the proper path for the trigger to work.
