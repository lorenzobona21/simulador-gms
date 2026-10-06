@echo off
setlocal

set "TASK_NAME=GMS - Atualizar saldos e publicar"
set "PROJECT_DIR=%~dp0"
set "RUNNER=%PROJECT_DIR%atualizar-saldos-e-publicar-gms.cmd"
set "LOG=%PROJECT_DIR%work\rotina-diaria-publicacao.log"

if not exist "%PROJECT_DIR%work" mkdir "%PROJECT_DIR%work"

echo.
echo Instalando rotina diaria da GMS no Agendador do Windows...
echo Horario: 08:30, de segunda a sexta.
echo.

schtasks /Create /TN "%TASK_NAME%" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 08:30 /TR "cmd.exe /c \"\"%RUNNER%\" >> \"%LOG%\" 2>&1\"" /F

if errorlevel 1 (
  echo.
  echo Nao foi possivel instalar a rotina. Tente executar este arquivo como administrador.
  pause
  exit /b 1
)

echo.
echo Rotina instalada com sucesso.
echo Log: %LOG%
pause
