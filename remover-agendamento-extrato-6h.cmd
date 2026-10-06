@echo off
setlocal

set "TASK_NAME=Simulador GMS - Atualizar e publicar base"
schtasks /Delete /TN "%TASK_NAME%" /F

echo Agendamento removido.
pause
