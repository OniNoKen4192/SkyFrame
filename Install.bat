@echo off
setlocal

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
:: Y=1, N=2; any other code (e.g. Ctrl+C=0) is a cancellation.
choice /c YN /n /m "  Install Node.js now? [Y/N]: "
if %ERRORLEVEL% EQU 2 goto :manual_install_message
if %ERRORLEVEL% NEQ 1 (
    echo.
    echo  [ERROR] Installation cancelled.
    echo.
    pause
    exit /b 1
)

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
