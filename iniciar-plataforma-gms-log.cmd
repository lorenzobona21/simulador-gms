@echo off
set "PATH=C:\Users\Lorenzo.GMS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
cd /d "C:\Users\Lorenzo.GMS\Documents\Codex\2026-06-22\gms-client-platform-allowlist"
if not exist work\server mkdir work\server
echo Iniciando a Plataforma GMS com log...
echo.
echo Abra: http://127.0.0.1:3000
echo Log: work\server\gms-server.log
echo.
"C:\Users\Lorenzo.GMS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "node_modules\next\dist\bin\next" dev -H 127.0.0.1 -p 3000 > "work\server\gms-server.log" 2>&1
echo.
echo Servidor encerrado. Veja work\server\gms-server.log
pause
