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
