@echo off
setlocal
cd /d "%~dp0"
echo Atualizando saldos diarios da base GMS...
echo.
"C:\Users\Lorenzo.GMS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "scripts\sync-netfactor-daily-position.mjs" --confirm-netfactor
echo.
echo Status salvo em work\daily-position-sync-status.json
echo.
pause
