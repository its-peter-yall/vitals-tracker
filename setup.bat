@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================
echo  Vitals Tracker - Windows setup
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 goto :no_node
where npm >nul 2>nul
if errorlevel 1 goto :no_npm

node -e "const v=process.versions.node.split('.').map(Number); if (v[0] < 24 || (v[0] === 24 && v[1] < 15)) process.exit(1)"
if errorlevel 1 goto :old_node

echo Node version:
node --version
echo.

if not exist "package.json" (
  echo [ERROR] package.json was not found. Run this script from the project root.
  goto :fail
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto :fail
) else (
  echo Dependencies already installed.
)

if not exist ".env.local" (
  if exist ".env.example" (
    copy /Y ".env.example" ".env.local" >nul
    echo Created .env.local from .env.example.
    echo The default local SQLite database needs no extra keys.
    echo Add DATABASE_URL, DATABASE_AUTH_TOKEN, or OPENROUTER_API_KEY later if needed.
  ) else (
    echo [WARN] .env.example was not found. Using built-in defaults.
  )
) else (
  echo Using existing .env.local.
)

echo.
echo Preparing the database schema...
call npm run db:push
if errorlevel 1 goto :fail

echo.
echo Seeding curated foods and medicines...
call npm run db:seed
if errorlevel 1 goto :fail

echo.
echo ============================================
echo  Setup complete.
echo  Run run.bat to start the app and open it.
echo ============================================
if /I "%~1"=="--no-pause" exit /b 0
pause
exit /b 0

:no_node
echo [ERROR] Node.js was not found on PATH.
echo Install Node.js 24.15 or newer from https://nodejs.org/
goto :fail

:no_npm
echo [ERROR] npm was not found on PATH.
goto :fail

:old_node
echo [ERROR] Node.js 24.15 or newer is required.
node --version
goto :fail

:fail
echo.
echo Setup did not complete. Review the error above.
if /I "%~1"=="--no-pause" exit /b 1
pause
exit /b 1
