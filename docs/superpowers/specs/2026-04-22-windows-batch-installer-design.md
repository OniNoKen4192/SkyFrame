# Windows Batch Installer — Design

**Date:** 2026-04-22
**Status:** Approved for implementation planning
**Version target:** v1.2.6 (intermediary; v2 PWA will supersede)
**Branch:** `feat/windows-batch-installer`, off `main`

## Summary

Ship two batch files at the repo root — `Install.bat` and `SkyFrame.bat` — that let a non-technical Windows user run SkyFrame without knowing what Node.js or npm are. `Install.bat` handles the Node.js prerequisite (auto-installing via winget when available, with a clear manual fallback) and pre-builds the client. `SkyFrame.bat` starts the Fastify server and opens the default browser to the dashboard. The existing first-run Settings modal handles all runtime configuration from the browser, so neither batch file needs to scaffold `.env` or `skyframe.config.json`.

This is explicitly an **intermediary step** toward a v2 PWA with a real installer. The design favors simplicity, transparency, and zero new build/release infrastructure over polish.

## Decisions settled during brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| Distribution audience | Public GitHub strangers | Drives the "assume low tech competency" bar. Users find the repo, not hand-held by Ken. |
| Repo acquisition | GitHub "Download ZIP" button | No `git` prerequisite for end users. Developers still use `git clone` (documented separately in README). |
| Node.js prerequisite | Auto-install via winget, with nodejs.org link as fallback | ~80% of Win 10/11 have winget. Manual link path covers the rest. Bundling `node.exe` in a release artifact is too much build-pipeline investment for an intermediary step. |
| Post-winget PATH refresh | PowerShell one-liner inside Install.bat (single file) | Two-file chain via `start` also works but shows 3 `.bat` files to users (confusion risk). PowerShell refresh is the canonical idiom (same trick Chocolatey's `refreshenv` uses). |
| When to `npm run build` | Once, inside Install.bat | Pre-building means every launch is near-instant. Upgrade path = re-run Install.bat. |
| SkyFrame.bat console window | Visible | User sees server is running, errors are diagnosable, closing the window is the intuitive "stop" gesture. Hiding via `.vbs` wrapper is polish we can defer to v2. |
| Browser open timing | Fixed 3-second `timeout` | Fastify boots in ~1s. Polling for readiness is overkill; if delay is ever too short, browser shows connection error and user hits refresh. |
| Port 3000 conflict handling | None — surface the server error in the console | Single-user local app. Covering port conflicts adds complexity without material value. |
| Uninstall / Stop / Start Menu | None | Delete-the-folder and close-the-window are universally understood. Proper installer is v2. |

## Scope

**In scope:**
- `Install.bat` at repo root
- `SkyFrame.bat` at repo root
- README update: new "Easy install (Windows, no developer tools needed)" section above the existing developer quick-start block
- Both scripts work from any install path (including paths with spaces) via `%~dp0`

**Out of scope:**
- macOS or Linux equivalents (`.sh` / `.command`)
- `Uninstall.bat`, `Stop.bat`, or any lifecycle script beyond install and launch
- Start Menu shortcut, desktop shortcut, or icon association
- Node.js version check (presence-only check; old-Node failures surface via npm's own error)
- Port configurability (hardcoded to 3000)
- Silent / windowless launch via `.vbs` wrapper
- GitHub Actions release-artifact pipeline (bundled `node.exe` + prebuilt `dist/`)
- Automatic update of an installed copy (the existing in-app GitHub update notification covers this)
- Admin-elevation handling beyond what winget itself prompts for

## Install.bat flow

```
1. cd /d "%~dp0"                      (anchor to script's own directory)

2. Check for Node:
   where node >nul 2>&1
     if errorlevel 0  → jump to step 6 (install npm deps)
     if errorlevel 1  → continue to step 3

3. Check for winget:
   where winget >nul 2>&1
     if errorlevel 0  → continue to step 4 (offer auto-install)
     if errorlevel 1  → jump to step 5 (manual-install message)

4. Prompt: "SkyFrame needs Node.js. Install it now using Windows' built-in
   installer (winget)? [Y/N]"
     Y → winget install OpenJS.NodeJS.LTS --silent
              --accept-source-agreements --accept-package-agreements
         (Windows may show one UAC prompt. Takes ~30-60 seconds.)
         After winget exits:
           - Refresh PATH from registry (PowerShell one-liner — see below)
           - Verify `where node` succeeds; if not, fall to step 5
           - Continue to step 6
     N → fall to step 5

5. Print:
     "SkyFrame needs Node.js. Please install it from
        https://nodejs.org/
     (pick the LTS version), then run Install.bat again."
   Pause. Exit.

6. Run: npm install
   (pulls node_modules — one-time, visible progress, ~200MB)

7. Run: npm run build
   (pre-builds the client bundle — ~10-30s, one-time per upgrade)

8. Print:
     "SkyFrame is installed.
      Double-click SkyFrame.bat to start it."
   Pause.
```

### PATH refresh one-liner (step 4)

```batch
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command ^
  "[Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [Environment]::GetEnvironmentVariable('PATH','User')"`) do set "PATH=%%i"
```

This reads the Machine and User PATH values fresh from the Windows registry (the values winget just wrote) and overwrites the current session's `PATH`. PowerShell's `GetEnvironmentVariable` returns values with `%SystemRoot%`-style variables pre-expanded, avoiding manual `reg query` parsing.

### Failure modes and their messages

| Condition | Message | Exit behavior |
|---|---|---|
| Node missing, winget missing | `"SkyFrame needs Node.js. Please install it from https://nodejs.org/ (pick the LTS version), then run Install.bat again."` | Pause, exit. |
| Node missing, winget present, user declines | Same nodejs.org message as the "winget missing" row | Pause, exit. |
| Node missing, winget install fails | `"Node.js install failed. Please install it manually from https://nodejs.org/ then run Install.bat again."` (winget's own error code is already visible above this line) | Pause, exit. |
| Node missing, winget succeeds, PATH refresh still can't find node | `"Node.js was installed but this window can't see it yet. Please close this window and double-click Install.bat again."` | Pause, exit. (Rare fallback.) |
| `npm install` fails | npm's own error is already visible in the window. Install.bat prints `"Setup did not finish — see the error above."` and exits non-zero. | Pause, exit. |
| `npm run build` fails | Same pattern as the npm install failure row: npm's error visible, `"Setup did not finish — see the error above."` appended, non-zero exit. | Pause, exit. |

## SkyFrame.bat flow

```
1. cd /d "%~dp0"

2. Check: does node_modules\ exist?
     NO  → Print "Please run Install.bat first, then double-click SkyFrame.bat."
           Pause. Exit.
     YES → continue.

3. Open browser to http://localhost:3000 after a 3-second delay, in parallel
   with step 4.
     start "" /b cmd /c "timeout /t 3 /nobreak >nul && start "" http://localhost:3000"

4. Run in foreground: npm run server
   (console window shows server logs; user closes the window to stop SkyFrame)
```

### Why start the browser in parallel

If we start the browser *after* `npm run server`, we never reach the browser step — `npm run server` blocks the script. If we start the browser *before*, the server isn't ready yet. The fire-and-forget child cmd with a 3-second delay handles both concerns: the server is already booting by the time the browser opens.

### Failure modes

| Condition | Behavior |
|---|---|
| `node_modules\` missing | "Please run Install.bat first…" message, pause, exit. |
| Port 3000 in use | Fastify's EADDRINUSE error surfaces in the console. User sees it, closes the window. Not handled by the script — single-user local app, collision is rare. |
| Browser fails to open | User manually navigates to http://localhost:3000 (printed in the console log line). |
| Server crashes after start | Console window stays open showing the error; user reads it. |

## README changes

Add a new section **above** the existing "Quick start" block, not replacing it. The developer-oriented `git clone` flow stays.

```markdown
## Easy install (Windows, no developer tools needed)

1. Click the green **Code** button at the top of this page → **Download ZIP**.
2. Extract the ZIP anywhere (Desktop, Documents, etc.).
3. Open the extracted folder and double-click **Install.bat**.
   - If Node.js isn't installed, Install.bat will offer to install it for you.
   - Windows may show a UAC ("Do you want to allow…?") prompt once — that's the Node.js installer.
   - First run takes 1–2 minutes.
4. When setup finishes, double-click **SkyFrame.bat**.
   Your browser will open automatically to SkyFrame.
5. **First launch:** SkyFrame will show a Settings panel — enter a ZIP code (or
   `lat, lon`) and a contact email (required by the National Weather Service),
   click SAVE, and you're done. You only do this once.

To stop SkyFrame: close the black console window that opened with it.
To update later: download the new ZIP, replace the folder, run Install.bat again.
```

The existing developer "Quick start" block moves down one section but keeps all its `git clone` / manual-configuration content verbatim.

## Testing plan

Manual, on the author's Windows 11 machine plus (if possible) one clean VM or a second Windows account with no Node installed:

1. **Happy path, Node already installed** — Install.bat skips winget, runs `npm install` + `npm run build`, exits cleanly. SkyFrame.bat starts the server, browser opens.
2. **Happy path, Node not installed, winget present, user accepts** — winget installs Node, PATH refresh works, npm install proceeds, build succeeds.
3. **Node not installed, winget present, user declines** — falls through to the nodejs.org manual-install message.
4. **Node not installed, winget absent** (simulate by temporarily renaming winget.exe, or test on an older Windows) — goes straight to manual-install message without prompting.
5. **Path with spaces** — install the repo under `C:\Users\Test User\Desktop\SkyFrame` and confirm both batch files work.
6. **Re-run Install.bat** — should be idempotent (npm install + rebuild).
7. **Run SkyFrame.bat before Install.bat** — clear "run Install first" message.
8. **Close the SkyFrame.bat window** — confirm Fastify stops cleanly and port 3000 is freed.
9. **Port 3000 already in use** (start another server on 3000 first) — Fastify's EADDRINUSE error shows in the console; window stays open.

No automated tests. These are one-shot shell scripts running against real Windows; Vitest coverage isn't meaningful here.

## Files touched

**New:**
- `Install.bat` (repo root)
- `SkyFrame.bat` (repo root)

**Modified:**
- `README.md` (new "Easy install (Windows)" section added above existing Quick Start)
- `PROJECT_STATUS.md` ("Implemented features" entry for v1.2.6 once shipped)
- `package.json` version bump (`1.2.5` → `1.2.6`)

**Not touched:**
- Any server, client, or shared source code
- `.env.example` (unchanged — still documented as the "Advanced" path for people who prefer it)

## Future (v2) considerations

The v2 PWA direction will likely replace this entire flow. The intermediary-step framing means we should NOT invest in:

- Code-signing the batch files or any bundled installer
- A GitHub Actions release pipeline that builds artifacts
- Windows-installer frameworks (NSIS, Inno Setup, MSI) — v2 PWA installation is via the browser's "Install app" prompt
- Localization of the batch-file messages

If v2 slips more than ~6 months, we can revisit — but "build the minimum that works, plan to throw it away" is the explicit posture here.
