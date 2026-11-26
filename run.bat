@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "node_modules" (
  echo [ERROR] Dependencies are not installed.
  echo Run setup.bat first.
  goto :fail
)
if not exist ".env.local" (
  echo [WARN] .env.local was not found. Using built-in defaults.
  echo Run setup.bat to create the local database and seed data.
  echo.
)

echo Starting Vitals Tracker on http://localhost:3000 ...
start "Vitals Tracker Server" cmd /k "npm run dev -- -p 3000"

echo Waiting for the server to respond...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='http://localhost:3000'; for($i=0; $i -lt 90; $i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2; if($r.StatusCode -ge 200 -and $r.StatusCode -lt 400 -and $r.Content -match 'Vitals Tracker'){ exit 0 } } catch {}; Start-Sleep -Milliseconds 1000 }; exit 1"
if errorlevel 1 goto :not_ready

start "" "http://localhost:3000"
echo.
echo Opened http://localhost:3000 in your browser.
echo Close the "Vitals Tracker Server" window to stop the app.
ping -n 5 127.0.0.1 >nul
exit /b 0

:not_ready
echo.
echo [ERROR] The server did not become ready within 90 seconds.
echo Check the "Vitals Tracker Server" window for the error.
pause
exit /b 1

:fail
echo.
pause
exit /b 1
