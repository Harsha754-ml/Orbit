# How to make changes and publish a release

## The full loop — from idea to live release

```
Edit code  →  Test locally  →  Bump version  →  Push tag  →  GitHub builds automatically
```

No manual building. No uploading files. GitHub does everything after the tag.

---

## Step-by-step

### 1. Make your changes

Edit whatever you need — `main.js`, a plugin, the settings app, styles, etc.

```bash
# Check what you changed
git status
git diff
```

---

### 2. Test it locally

```bash
npm start
```

Make sure the radial opens, settings save, and any new feature works as expected.

---

### 3. Bump the version number

Open `package.json` and change the `"version"` field:

```json
{
  "version": "2.1.0"
}
```

**Version naming guide:**

| Change type | Example | When to use |
|-------------|---------|-------------|
| Bug fix | `2.0.1` → `2.0.2` | Fixed something broken |
| New feature | `2.0.2` → `2.1.0` | Added something new |
| Breaking change | `2.1.0` → `3.0.0` | Major redesign or incompatible change |
| Beta / test | `3.0.0-beta.1` | Testing before full release |

---

### 4. Commit everything

```bash
git add .
git commit -m "feat: describe what you changed"
git push origin main
```

This push to main **does a build check** (GitHub Actions runs but creates no release).

---

### 5. Tag the version → triggers the release

```bash
git tag v2.1.0
git push origin v2.1.0
```

That's it. GitHub Actions now:
1. Spins up a Windows server
2. Installs Node.js and your dependencies
3. Downloads the AHK runtime
4. Builds the NSIS installer + portable exe
5. Creates a GitHub Release automatically
6. Uploads both files to the release

**Check progress:** go to your repo → **Actions** tab → watch the build live.

---

### 6. Verify the release

Go to **github.com/Harsha754-ml/Orbit/releases** — your new release will be there with the installer and portable exe attached.

---

## Quick reference — common scenarios

### "I fixed a bug"
```bash
# 1. Fix the code
# 2. Edit package.json: "version": "2.0.2"
git add .
git commit -m "fix: describe the bug you fixed"
git push origin main
git tag v2.0.2
git push origin v2.0.2
```

### "I added a new feature"
```bash
# 1. Add the feature
# 2. Edit package.json: "version": "2.1.0"
git add .
git commit -m "feat: describe the new feature"
git push origin main
git tag v2.1.0
git push origin v2.1.0
```

### "I want to test a release before making it public"
```bash
git tag v2.1.0-beta.1
git push origin v2.1.0-beta.1
```
Tags with `-beta` or `-rc` are automatically marked as **pre-release** on GitHub.

### "I pushed the wrong tag"
```bash
# Delete it locally and remotely, then re-push
git tag -d v2.1.0
git push origin :refs/tags/v2.1.0
# Fix your code, then re-tag
git tag v2.1.0
git push origin v2.1.0
```

---

## What the GitHub Action does in detail

```
Trigger: you push  v2.1.0  tag
         ↓
GitHub spins up a  windows-latest  runner
         ↓
actions/checkout   → clones your repo
setup-node@v4      → installs Node 20
npm ci             → installs exact dependencies from package-lock.json
PowerShell script  → downloads AutoHotkey64.exe (gitignored, fetched fresh)
npm run dist       → electron-builder builds NSIS + portable
softprops/release  → creates GitHub Release, uploads .exe files
```

**Build time:** ~4–6 minutes

---

## Files you'll edit most often

| File | What it controls |
|------|-----------------|
| `main.js` | App startup, IPC, AHK trigger, settings window |
| `src/renderer.js` | Radial menu logic, animations, gesture detection |
| `src/styles.css` | Radial overlay appearance |
| `settings/app.js` | Settings window logic |
| `settings/styles.css` | Settings window appearance |
| `plugins/*.js` | Individual plugin behaviour |
| `defaultConfig.json` | Default actions, themes, and settings |
| `themes.json` | Theme color definitions |
| `orbit-trigger.ahk` | Hotkey and trigger logic |
| `package.json` | **Version number lives here** |
