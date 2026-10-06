@echo off
setlocal
cd /d "%~dp0"

set "NODE=C:\Users\Lorenzo.GMS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "NPMCLI=%~dp0.tools\package\bin\npm-cli.js"

echo.
echo Atualizando saldos diarios da base GMS...
"%NODE%" "scripts\sync-netfactor-daily-position.mjs" --confirm-netfactor
if errorlevel 1 (
  echo.
  echo Falha ao atualizar saldos. A publicacao foi cancelada.
  pause
  exit /b 1
)

echo.
echo Preparando snapshot para a Vercel...
"%NODE%" "scripts\audit-data-quality.mjs"
if errorlevel 1 (
  echo.
  echo Falha ao auditar os dados. A publicacao foi cancelada.
  pause
  exit /b 1
)
copy /Y "work\latest-investor-report.json" "data\latest-investor-report.json" >nul
if exist "work\latest-investor-subscriptions.json" copy /Y "work\latest-investor-subscriptions.json" "data\latest-investor-subscriptions.json" >nul
if exist "work\data-quality-report.json" copy /Y "work\data-quality-report.json" "data\data-quality-report.json" >nul

echo.
echo Publicando saldos atualizados na Vercel...
set "PATH=C:\Users\Lorenzo.GMS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
"%NODE%" "%NPMCLI%" exec --yes vercel -- deploy --prod --yes
if errorlevel 1 (
  echo.
  echo Falha ao publicar na Vercel.
  pause
  exit /b 1
)

echo.
echo Rotina concluida com sucesso.
pause
