@echo off
set "PATH=C:\Users\Lorenzo.GMS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
cd /d "C:\Users\Lorenzo.GMS\Documents\Codex\2026-06-22\gms-client-platform-allowlist"
echo Iniciando a Plataforma GMS...
echo.
echo Quando aparecer "Ready", abra: http://127.0.0.1:3000
echo Para desligar depois, feche esta janela.
echo.
"C:\Users\Lorenzo.GMS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "node_modules\next\dist\bin\next" dev -H 127.0.0.1 -p 3000
pause
