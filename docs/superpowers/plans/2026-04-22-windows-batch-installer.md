# Windows Batch Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `Install.bat` + `SkyFrame.bat` at the repo root plus a README "Easy install (Windows)" section so non-technical GitHub strangers can run SkyFrame without knowing what Node.js or npm are.

**Architecture:** Two Windows batch files at the repo root. `Install.bat` handles the Node.js prerequisite (auto-installs via `winget` when available, with a nodejs.org manual-install fallback), refreshes PATH from the registry via a PowerShell one-liner, then runs `npm install` + `npm run build`. `SkyFrame.bat` guard-checks that `node_modules/` exists, fires a delayed browser-open via PowerShell, and runs `npm run server` in the foreground so the console window is the server's lifecycle.

**Tech Stack:** Windows batch (cmd.exe) + PowerShell for PATH/browser helpers. No changes to TypeScript, React, or Fastify source. No new npm dependencies. No automated tests — batch scripts are verified manually per the plan's test scenarios.

**Spec reference:** `docs/superpowers/specs/2026-04-22-windows-batch-installer-design.md`

**Project commit style:** Plain-English subject lines, no conventional-commits prefix (e.g., `"add Install.bat + SkyFrame.bat for Windows"`, not `feat: add ...`). See `git log` for examples.

**Prerequisite context for the implementing engineer:**
- The SkyFrame server boots gracefully without `.env` or `skyframe.config.json` (verified in `server/config.ts:9-20,57-65`). First-run configuration happens through a browser-based Settings modal. The batch files never scaffold config files.
- The existing `npm run start:prod` script does build + serve in one shot, but we deliberately split: Install.bat pre-builds so SkyFrame.bat launches instantly.
- `call` is required before `npm install` / `npm run build` in a `.bat` file. Without `call`, control transfers to npm.cmd and never returns to the outer script.
- Windows is case-insensitive for filenames. Name the files `Install.bat` and `SkyFrame.bat` exactly (matching the README references).

---

## File Structure

**New files:**
- `Install.bat` — repo root. Node.js prerequisite handler + `npm install` + `npm run build`. Happy path and all failure modes both end with `pause` so the window stays open.
- `SkyFrame.bat` — repo root. Guard-check for `node_modules/` + delayed browser open + `npm run server` in foreground.

**Modified files:**
- `README.md` — new `## Easy install (Windows, no developer tools needed)` section inserted between the existing `## Requirements` and `## Quick start` sections (Task 4).
- `package.json` — version `1.2.5` → `1.2.6` (Task 5).
- `PROJECT_STATUS.md` — new `### v1.2.6` entries under both the "What's shipped" heading and the "Implemented features" running list (Task 5).

**Not touched:**
- Any `server/`, `client/`, or `shared/` source file.
- `.env.example` — remains the documented "Advanced" path for users who'd rather edit a file than use the browser Settings modal.

---

## Task 1: Create feature branch

**Files:** none (git state change only)

- [ ] **Step 1: Confirm the working tree is clean on `main`**

Run:

```bash
git status
git log -1 --oneline
```

Expected: `nothing to commit, working tree clean` on `main`, with the most recent commit being the spec commit (`2c2172a spec: Windows batch installer (Install.bat + SkyFrame.bat)`).

- [ ] **Step 2: Create and switch to the feature branch**

Run:

```bash
git checkout -b feat/windows-batch-installer
```

Expected: `Switched to a new branch 'feat/windows-batch-installer'`

- [ ] **Step 3: Verify branch**

Run:

```bash
git branch --show-current
```

Expected: `feat/windows-batch-installer`

No commit yet — the branch is empty. The first commit lands in Task 2.

---

## Task 2: Create SkyFrame.bat (launcher)

This is the simpler of the two scripts, so we build and validate it first. Ken's Windows 11 machine already has Node.js installed and a populated `node_modules/`, so the happy path is testable immediately.

**Files:**
- Create: `SkyFrame.bat` (repo root)

- [ ] **Step 1: Create `SkyFrame.bat` with the full content**

Create `SkyFrame.bat` at the repo root with exactly this content:

```batch
@echo off
setlocal

:: SkyFrame launcher for Windows.
:: Starts the Fastify server and opens the default browser.
:: Close this window to stop SkyFrame.

cd /d "%~dp0"

:: ------------------------------------------------------------------
:: Guard: has Install.bat been run?
:: ------------------------------------------------------------------
if not exist "node_modules\" (
    echo.
    echo  SkyFrame has not been installed yet.
    echo  Please run Install.bat first, then double-click SkyFrame.bat.
    echo.
    pause
    exit /b 1
)

:: ------------------------------------------------------------------
:: Open the browser after 3 seconds (parallel to server startup).
:: Using PowerShell avoids the nested-quote problems that plain cmd
:: has when composing "timeout && start url" inside a start /b call.
:: ------------------------------------------------------------------
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:3000'"

echo.
echo  ==============================================================
echo    SkyFrame is starting on http://localhost:3000
echo    Your browser should open automatically in a few seconds.
echo    Close this window to stop SkyFrame.
echo  ==============================================================
echo.

call npm run server
```

*Why each piece:*
- `@echo off` suppresses command echoing; users see only our friendly output.
- `setlocal` scopes any env-var changes to this script (not strictly needed here, but cheap insurance).
- `cd /d "%~dp0"` anchors to the script's own folder, not the caller's CWD. `%~dp0` includes the trailing backslash; the `"` handles paths with spaces.
- The guard uses `if not exist "node_modules\"` (trailing backslash enforces directory, not file).
- `start "" /b powershell ...` fires PowerShell in the background of the same console window. `""` is the (empty) window title — required because `start` would otherwise interpret the first quoted arg as the title.
- `call npm run server` runs in the foreground; when the user closes the window, the server dies with it.

- [ ] **Step 2: Manually test the happy path**

On Ken's machine (Windows 11, Node installed, `node_modules/` populated from prior dev work):

1. Double-click `SkyFrame.bat` in Windows Explorer.
2. A black console window opens showing the "SkyFrame is starting on http://localhost:3000" banner followed by Fastify's startup logs.
3. After ~3 seconds, the default browser opens to `http://localhost:3000` and displays the SkyFrame dashboard.
4. Close the console window.

Expected: browser tab remains open (it's a static page now — no live reload), but any further `/api/weather` calls fail because the server is gone.

If the browser does not open: manually navigate to `http://localhost:3000` to confirm the server is actually running. If the server is running but the browser didn't open, the issue is the PowerShell `start-process` line — debug by running the PowerShell command directly in a terminal.

- [ ] **Step 3: Manually test the guard path (no `node_modules/`)**

1. Rename `node_modules/` to `node_modules.bak/` (temporarily).
2. Double-click `SkyFrame.bat`.
3. Verify the console shows:

```
  SkyFrame has not been installed yet.
  Please run Install.bat first, then double-click SkyFrame.bat.
  
Press any key to continue . . .
```

4. Press a key; the window closes.
5. Rename `node_modules.bak/` back to `node_modules/`.

- [ ] **Step 4: Commit**

Run:

```bash
git add SkyFrame.bat
git commit -m "$(cat <<'EOF'
SkyFrame.bat: Windows launcher

Double-click to start the Fastify server and open the default browser
to http://localhost:3000. Guard-checks that node_modules/ exists; tells
the user to run Install.bat first if not. Browser open is fired via a
3-second delayed PowerShell Start-Process so it arrives after Fastify
is ready. Closing the console window stops the server.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds, working tree clean.

---

## Task 3: Create Install.bat (installer)

**Files:**
- Create: `Install.bat` (repo root)

- [ ] **Step 1: Create `Install.bat` with the full content**

Create `Install.bat` at the repo root with exactly this content:

```batch
@echo off
setlocal EnableDelayedExpansion

:: SkyFrame installer for Windows.
:: 1. Ensures Node.js is installed (offers winget auto-install when available).
:: 2. Runs npm install.
:: 3. Runs npm run build (pre-builds the client so SkyFrame.bat is fast).

cd /d "%~dp0"

echo.
echo  ==============================================================
echo    SkyFrame Setup
echo  ==============================================================
echo.

:: ------------------------------------------------------------------
:: Check for Node.js
:: ------------------------------------------------------------------
where node >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo  [OK] Node.js is already installed.
    echo.
    goto :install_deps
)

echo  Node.js is not installed.
echo.

:: ------------------------------------------------------------------
:: Check for winget (built into Windows 10 1809+ and all Windows 11)
:: ------------------------------------------------------------------
where winget >nul 2>&1
if %ERRORLEVEL% NEQ 0 goto :manual_install_message

:: ------------------------------------------------------------------
:: Offer winget auto-install
:: ------------------------------------------------------------------
echo  Windows' built-in package manager (winget) can install Node.js
echo  for you. This requires one UAC prompt ("Do you want to
echo  allow...?") and takes about 30-60 seconds.
echo.
choice /c YN /n /m "  Install Node.js now? [Y/N]: "
if %ERRORLEVEL% EQU 2 goto :manual_install_message

echo.
echo  Installing Node.js LTS via winget...
echo.
winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  [ERROR] winget failed to install Node.js.
    echo          Please install it manually from https://nodejs.org/
    echo          then run Install.bat again.
    echo.
    pause
    exit /b 1
)

:: ------------------------------------------------------------------
:: Refresh PATH from the registry so this session sees the new node.
:: PowerShell's GetEnvironmentVariable returns expanded values.
:: ------------------------------------------------------------------
echo.
echo  Refreshing PATH from the Windows registry...
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command ^
  "[Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [Environment]::GetEnvironmentVariable('PATH','User')"`) do set "PATH=%%i"

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  Node.js was installed, but this window cannot find it yet.
    echo  Please close this window and double-click Install.bat again.
    echo.
    pause
    exit /b 1
)

echo  [OK] Node.js installed and available.
echo.

:: ------------------------------------------------------------------
:: Install npm dependencies
:: ------------------------------------------------------------------
:install_deps
echo  --------------------------------------------------------------
echo    Installing dependencies (one-time, about a minute)...
echo  --------------------------------------------------------------
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  [ERROR] Setup did not finish - see the error above.
    echo.
    pause
    exit /b 1
)

:: ------------------------------------------------------------------
:: Build the client bundle
:: ------------------------------------------------------------------
echo.
echo  --------------------------------------------------------------
echo    Building SkyFrame...
echo  --------------------------------------------------------------
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  [ERROR] Setup did not finish - see the error above.
    echo.
    pause
    exit /b 1
)

:: ------------------------------------------------------------------
:: Done
:: ------------------------------------------------------------------
echo.
echo  ==============================================================
echo    SkyFrame is installed.
echo    Double-click SkyFrame.bat to start it.
echo  ==============================================================
echo.
pause
exit /b 0

:manual_install_message
echo.
echo  SkyFrame needs Node.js. Please install it from
echo.
echo    https://nodejs.org/
echo.
echo  (pick the LTS version), then run Install.bat again.
echo.
pause
exit /b 1
```

*Why each piece:*
- `setlocal EnableDelayedExpansion` is harmless if unused; reserved in case future edits add conditionals inside parenthesized blocks.
- `where node` / `where winget` are the idiomatic PATH-presence checks in batch — succeed if the command is on PATH, fail otherwise. Exit code, not output, is the signal.
- `choice /c YN /n /m "..."` is Windows' built-in yes/no prompt. `/c YN` defines the valid keys, `/n` hides the default `[Y,N]?` suffix so our custom suffix shows cleanly, `/m` sets the message. Exit code is 1 for Y, 2 for N.
- `--silent --accept-source-agreements --accept-package-agreements` on winget skips the interactive acceptance prompts but the UAC prompt still appears (Windows enforces that).
- The PATH refresh uses `for /f "usebackq delims=" %%i in (\`...\`) do set "PATH=%%i"` to capture a full-line PowerShell stdout into the `PATH` variable, preserving semicolons and spaces. The backtick-quoted command style (`usebackq`) lets us embed the PowerShell invocation without escape-quote gymnastics.
- The `:manual_install_message` label is a single exit point reached from four different failure branches. Keeping the user-facing instruction in one place avoids drift if we ever change the URL or phrasing.

- [ ] **Step 2: Manually test the Node-present happy path**

On Ken's machine (Node already installed):

1. Double-click `Install.bat`.
2. Verify the output sequence:
   - `[OK] Node.js is already installed.`
   - Running `npm install` (may report "up to date" if `node_modules/` was already current)
   - Running `npm run build` — typechecks + Vite build, ~10-30 seconds
   - `SkyFrame is installed. Double-click SkyFrame.bat to start it.`
3. Press a key to close.

Expected: no errors, `dist/client/` directory exists and is fresh.

- [ ] **Step 3: Manually test the "Node missing" path via a restricted-PATH shell**

This simulates a user who doesn't have Node installed without actually uninstalling it.

1. Open a fresh **Command Prompt** (not PowerShell — we want `cmd.exe`).
2. Run this command to spawn a subshell with a minimal PATH that excludes Node:

```
cmd /c "set PATH=C:\Windows\System32;C:\Windows;C:\Windows\System32\WindowsPowerShell\v1.0;%LOCALAPPDATA%\Microsoft\WindowsApps && cd /d e:\SkyFrame && Install.bat"
```

   The `WindowsApps` directory contains `winget.exe`, so this leaves winget reachable while hiding Node.

3. Verify the output sequence:
   - `Node.js is not installed.`
   - `Windows' built-in package manager (winget) can install Node.js for you...`
   - `Install Node.js now? [Y/N]:` prompt

4. Press **N**.
5. Verify: falls through to the `manual_install_message` block, prints the nodejs.org URL, pauses.
6. Press any key; the script exits.

- [ ] **Step 4: Manually test the "winget missing" path**

Run the same subshell trick but omit `WindowsApps` from PATH so `winget` is also hidden:

```
cmd /c "set PATH=C:\Windows\System32;C:\Windows;C:\Windows\System32\WindowsPowerShell\v1.0 && cd /d e:\SkyFrame && Install.bat"
```

Verify: the winget prompt is **skipped**, and the script goes straight to the manual-install message:

```
  SkyFrame needs Node.js. Please install it from
    https://nodejs.org/
  (pick the LTS version), then run Install.bat again.
```

Press any key; exits.

- [ ] **Step 5: Skip the "winget accepts and installs Node" end-to-end test**

We intentionally do **not** test the full winget auto-install path as part of this plan, for two reasons: (a) Ken already has Node installed, and forcing a reinstall risks version drift; (b) the winget command itself is the well-documented `OpenJS.NodeJS.LTS` package, and the PATH refresh is the canonical registry-read pattern. The risk of these two specific steps failing silently is low, and the failure mode is visible ("cannot find node" message).

If Ken ever provisions a fresh Win 11 VM for v2 testing, this would be the right time to validate the full path end-to-end. Document this as a known untested-pre-merge scenario when handing off.

- [ ] **Step 6: Manually test path-with-spaces**

1. Close any running SkyFrame instance.
2. In Windows Explorer, copy the entire `e:\SkyFrame\` folder to `C:\Users\kencu\Desktop\Sky Frame Test\` (note the space in the folder name).
3. Double-click `Install.bat` inside the new folder.
4. Verify: runs to completion with no path-quoting errors.
5. Double-click `SkyFrame.bat` in the same folder.
6. Verify: server starts, browser opens, dashboard loads.
7. Close the SkyFrame console window.
8. Delete `C:\Users\kencu\Desktop\Sky Frame Test\`.

- [ ] **Step 7: Commit**

Run:

```bash
git add Install.bat
git commit -m "$(cat <<'EOF'
Install.bat: Windows installer with Node.js auto-install

Handles the Node.js prerequisite for non-technical users. Checks for an
existing Node install first; if missing, offers auto-install via winget
(the built-in Windows package manager). After winget installs Node, the
script refreshes PATH from the Windows registry via a PowerShell
one-liner so the npm install step can find Node in the same session.
Falls back to a manual-install message pointing at nodejs.org when
winget is unavailable or the user declines. Finishes by running
npm install + npm run build so the first SkyFrame.bat launch is fast.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Task 4: Add README "Easy install" section

**Files:**
- Modify: `README.md` — insert new section between lines 22 and 24 (between Requirements and Quick start).

- [ ] **Step 1: Insert the new section**

Edit `README.md`. After the Requirements block that ends at line 22 with:

```
- A contact email (NWS requires one in the User-Agent header — it is never sent anywhere else)
```

and before line 24:

```
## Quick start
```

Insert this new section (with the blank lines shown):

```markdown
## Easy install (Windows, no developer tools needed)

1. Click the green **Code** button at the top of this page → **Download ZIP**.
2. Extract the ZIP anywhere (Desktop, Documents, etc.).
3. Open the extracted folder and double-click **Install.bat**.
   - If Node.js isn't installed, Install.bat will offer to install it for you.
   - Windows may show a UAC ("Do you want to allow...?") prompt once — that's the Node.js installer.
   - First run takes 1–2 minutes.
4. When setup finishes, double-click **SkyFrame.bat**.
   Your browser will open automatically to SkyFrame.
5. **First launch:** SkyFrame will show a Settings panel — enter a ZIP code (or `lat, lon`) and a contact email (required by the National Weather Service), click SAVE, and you're done. You only do this once.

To stop SkyFrame: close the black console window that opened with it.
To update later: download the new ZIP, replace the folder, and run Install.bat again.

```

Leave an extra blank line between the end of this new section and the `## Quick start` header that follows.

- [ ] **Step 2: Verify the README renders as expected**

Run:

```bash
git diff README.md
```

Expected diff: purely additive — the new `## Easy install (Windows, no developer tools needed)` section appears between the existing `## Requirements` list and the existing `## Quick start` header. No deletions, no whitespace churn in unrelated lines.

Visually confirm on GitHub-flavored markdown (e.g., in your IDE's markdown preview, if available) that:
- The new `##` header is at the same level as the others
- The bullet sub-items under step 3 render as indented list items (they need 3 spaces of indent to nest under `3.`)
- The backtick-wrapped `lat, lon` in step 5 renders as inline code

- [ ] **Step 3: Commit**

Run:

```bash
git add README.md
git commit -m "$(cat <<'EOF'
README: add "Easy install (Windows)" section

Documents the Download-ZIP + Install.bat + SkyFrame.bat path for
non-technical users. Positioned above the existing "Quick start" block
(which stays as the developer / git-clone path) so strangers landing
on the repo hit the easy path first. Includes upgrade instructions
(redownload ZIP, rerun Install.bat) and the "close the window to stop
SkyFrame" note.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Version bump + PROJECT_STATUS.md entry

**Files:**
- Modify: `package.json:3` — version string
- Modify: `PROJECT_STATUS.md` — new `### Windows batch installer (v1.2.6)` section at the end of the "Implemented features" running list

**Context:** The CLAUDE.md housekeeping rule says:
> Update the feature list in `PROJECT_STATUS.md` → "Implemented features" whenever a feature is completed. This is the source of truth for what's shipped.

So **only the "Implemented features" running list gets a new entry.** The "What's shipped" section further up the file is a narrative version history that has drifted (v1.2.5 never got an entry there either). Do not try to fix that drift as part of this task — stay in scope.

- [ ] **Step 1: Bump `package.json` version**

Edit `package.json`. Change line 3 from:

```json
  "version": "1.2.5",
```

to:

```json
  "version": "1.2.6",
```

- [ ] **Step 2: Append v1.2.6 entry to "Implemented features" in PROJECT_STATUS.md**

The file ends (in the "Implemented features" running list) with `### Senior-dev review fixes (v1.2.5)` block. Append the following **after** that block, at the very end of the file:

```markdown

### Windows batch installer (v1.2.6)
- Two batch files at the repo root: `Install.bat` (Node.js prerequisite handler via winget auto-install with nodejs.org manual fallback, PATH refresh via PowerShell registry-read one-liner, `npm install` + `npm run build`) and `SkyFrame.bat` (`node_modules/` guard check, delayed browser open via `start /b powershell Start-Process`, `npm run server` in the foreground). README gains an "Easy install (Windows, no developer tools needed)" section documenting the Download-ZIP + double-click flow; the existing developer "Quick start" block with `git clone` stays below it unchanged. No changes to server, client, or shared source. Intermediary distribution mechanism — v2 PWA installer will supersede. Spec: [docs/superpowers/specs/2026-04-22-windows-batch-installer-design.md](docs/superpowers/specs/2026-04-22-windows-batch-installer-design.md)
```

Make sure the file ends with a single trailing newline (no extra blank lines at EOF).

- [ ] **Step 3: Verify the diff is clean**

Run:

```bash
git diff package.json PROJECT_STATUS.md
```

Expected: `package.json` shows a one-line version change. `PROJECT_STATUS.md` shows one new block appended at the end and no other edits.

- [ ] **Step 4: Commit**

Run:

```bash
git add package.json PROJECT_STATUS.md
git commit -m "$(cat <<'EOF'
v1.2.6: version bump + PROJECT_STATUS entries

Bumps package.json to 1.2.6 and documents the Windows batch installer
under both "What's shipped" and the "Implemented features" running list
in PROJECT_STATUS.md. Links back to the design spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final verification + handoff

**Files:** none (verification only)

- [ ] **Step 1: Fresh-clone smoke test**

This simulates what a GitHub stranger experiences.

1. Close any running SkyFrame processes.
2. Copy the entire `e:\SkyFrame\` folder to `C:\Users\kencu\Desktop\SkyFrame-FreshTest\` (without `.git/`, `node_modules/`, `dist/`, or `skyframe.config.json` to simulate a just-downloaded ZIP).

   PowerShell equivalent (run from `e:\SkyFrame\`):

   ```powershell
   $dest = "C:\Users\kencu\Desktop\SkyFrame-FreshTest"
   New-Item -ItemType Directory -Path $dest -Force | Out-Null
   robocopy . $dest /E /XD .git node_modules dist /XF skyframe.config.json
   ```

3. In the new folder, double-click `Install.bat`. Verify it completes with `SkyFrame is installed.`
4. Double-click `SkyFrame.bat`. Verify the browser opens and the dashboard loads. Because this copy has no `skyframe.config.json`, the **Settings modal auto-opens in first-run mode** (CANCEL hidden). This is the intended first-run experience — confirm the modal is visible.
5. Close the SkyFrame console window.
6. Delete `C:\Users\kencu\Desktop\SkyFrame-FreshTest\`.

If any step fails, do not proceed to the handoff — debug and fix the batch files, then re-run this step.

- [ ] **Step 2: Confirm the commit graph is clean**

Run:

```bash
git log --oneline main..HEAD
git status
```

Expected commits (newest last):

```
<sha> v1.2.6: version bump + PROJECT_STATUS entries
<sha> README: add "Easy install (Windows)" section
<sha> Install.bat: Windows installer with Node.js auto-install
<sha> SkyFrame.bat: Windows launcher
```

Expected status: clean working tree.

- [ ] **Step 3: Present merge options to Ken**

Stop here and hand off. Ken will choose between:

**Option A — Local merge:** fast-forward `main` to `feat/windows-batch-installer`, push, delete the branch. Good for solo work where no external review is wanted.

```bash
git checkout main
git merge --ff-only feat/windows-batch-installer
git push origin main
git branch -d feat/windows-batch-installer
```

**Option B — Pull request:** push the branch, open a PR on GitHub for review / public visibility. Good when the change is user-facing and benefits from a PR record.

```bash
git push -u origin feat/windows-batch-installer
gh pr create --title "Windows batch installer (v1.2.6)" --body "<generated body>"
```

Per Ken's documented preference (memory: "defaults to local-merge then requests PRs later"), **lead with Option A as the recommendation** but surface Option B explicitly since this is user-facing and potentially the "first impression" for GitHub strangers — PR review has non-trivial value here.

Do NOT execute the merge/PR without Ken's explicit instruction on which option.

---

## Self-review checklist

(Done by the plan author before handoff.)

- [x] **Spec coverage:** Every in-scope item from the spec maps to a task:
  - Install.bat creation → Task 3
  - SkyFrame.bat creation → Task 2
  - README update → Task 4
  - Version bump + PROJECT_STATUS → Task 5
  - Verification of all spec test scenarios → Tasks 2, 3, 6
- [x] **Placeholder scan:** No "TBD" / "TODO" / "handle edge cases" / "similar to above" language. All code blocks contain full content.
- [x] **Type consistency:** N/A — no types; this is a batch-file + doc change.
- [x] **Paths:** All paths are absolute or repo-relative (`e:\SkyFrame\` or repo-relative from root). Line numbers cited for README edit point are based on the current `main` state.
- [x] **Known deferred test:** Task 3 Step 5 explicitly documents that the full winget-accepts-and-installs path is untested pre-merge. Flagged in the handoff.
