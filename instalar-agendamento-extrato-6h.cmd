@echo off
setlocal
cd /d "%~dp0"

set "TASK_NAME=Simulador GMS - Atualizar e publicar base"
set "TASK_CMD=%~dp0atualizar-extrato-mensal-diario.cmd"

echo Instalando agendamento diario das 06:00 para coletar, atualizar e publicar:
echo %TASK_CMD%
echo.

schtasks /Create /TN "%TASK_NAME%" /TR "\"%TASK_CMD%\"" /SC DAILY /ST 06:00 /F

echo.
echo Pronto. Para testar sem esperar as 06:00, execute:
echo schtasks /Run /TN "%TASK_NAME%"
echo.
pause
