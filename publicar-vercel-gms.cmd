@echo off
setlocal

cd /d "%~dp0"

echo Publicacao limpa: os dados de clientes nao sao empacotados no deploy.
echo Atualize a base pelo upload do extrato mensal detalhado no site publicado.

set "PATH=C:\Users\Lorenzo.GMS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"

echo Validando a versao local antes de publicar...
"C:\Users\Lorenzo.GMS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" ".tools\package\bin\npm-cli.js" run build
if errorlevel 1 (
  echo.
  echo A publicacao foi interrompida porque a validacao falhou.
  pause
  exit /b 1
)

echo Publicando no Vercel...
"C:\Users\Lorenzo.GMS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" ".tools\package\bin\npx-cli.js" vercel --prod --yes

echo.
echo Se aparecer "Aliased https://simulador-gms-qgxf.vercel.app", terminou.
pause
