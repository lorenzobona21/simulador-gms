@echo off
setlocal
cd /d "%~dp0"

set "NODE=C:\Users\Lorenzo.GMS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "NPM=.tools\package\bin\npm-cli.js"
set "LOGDIR=logs"
set "LOCK=work\daily-monthly-detailed-sync.lock"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"
if not exist "work" mkdir "work"

if exist "%LOCK%" (
  echo [%date% %time%] Ja existe uma atualizacao em andamento. >> "%LOGDIR%\atualizacao-diaria.log"
  exit /b 9
)

echo started > "%LOCK%"
echo. >> "%LOGDIR%\atualizacao-diaria.log"
echo [%date% %time%] Iniciando atualizacao do extrato mensal detalhado. >> "%LOGDIR%\atualizacao-diaria.log"

"%NODE%" "%NPM%" run netfactor:monthly-detailed -- --scheduled >> "%LOGDIR%\atualizacao-diaria.log" 2>&1
set "STATUS=%ERRORLEVEL%"

if "%STATUS%"=="0" (
  echo [%date% %time%] Atualizacao concluida com sucesso. >> "%LOGDIR%\atualizacao-diaria.log"
  if exist "work\latest-investor-subscriptions.json" copy /Y "work\latest-investor-subscriptions.json" "data\latest-investor-subscriptions.json" >nul
  if exist "work\latest-investor-report.json" copy /Y "work\latest-investor-report.json" "data\latest-investor-report.json" >nul
  if exist "work\data-quality-report.json" copy /Y "work\data-quality-report.json" "data\data-quality-report.json" >nul

  echo [%date% %time%] Enviando relatorio para atualizar o site publicado. >> "%LOGDIR%\atualizacao-diaria.log"
  "%NODE%" "scripts\upload-monthly-detailed-to-site.mjs" >> "%LOGDIR%\atualizacao-diaria.log" 2>&1
  set "DEPLOY_STATUS=%ERRORLEVEL%"

  if "%DEPLOY_STATUS%"=="0" (
    echo [%date% %time%] Site publicado atualizado com sucesso, sem redeploy. >> "%LOGDIR%\atualizacao-diaria.log"
  ) else (
    echo [%date% %time%] A base local foi atualizada, mas o envio para a Vercel falhou. Codigo %DEPLOY_STATUS%. >> "%LOGDIR%\atualizacao-diaria.log"
    set "STATUS=%DEPLOY_STATUS%"
  )
) else (
  echo [%date% %time%] Falha na atualizacao. Codigo %STATUS%. >> "%LOGDIR%\atualizacao-diaria.log"
)

del "%LOCK%" >nul 2>nul
exit /b %STATUS%
