@echo off
cd /d "%~dp0"
set "PATH=C:\Users\Lorenzo.GMS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
node_modules\.bin\next.cmd dev
