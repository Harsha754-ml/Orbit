# Setup Instructions

## 1. Prerequisites

- Install [Node.js LTS](https://nodejs.org/).
- Install [AutoHotkey v2](https://www.autohotkey.com/).

## 2. Project Initialization

```powershell
cd orbit
npm install
```

## 3. Development Mode

```powershell
npm start
```

Launch `orbit-trigger.ahk` to enable the middle-click toggle.

## 4. Building Executable

```powershell
npm run build
```

The application will be built into the `dist` folder.

## 5. Deployment

- Run the generated `.exe` from `dist`.
- Keep `orbit-trigger.ahk` running in the background for global access.
