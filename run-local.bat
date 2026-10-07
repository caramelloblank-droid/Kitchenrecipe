@echo off
cd /d "%~dp0"
set PORT=8765

echo Запуск Polaris PWA...

where py >nul 2>nul
if %errorlevel%==0 goto start_py

where python >nul 2>nul
if %errorlevel%==0 goto start_python

echo.
echo ОШИБКА: Python не найден.
echo Установите Python 3 и повторите запуск.
pause
exit /b 1

:start_py
start "Polaris PWA Server" /min py -m http.server %PORT% --bind 127.0.0.1
goto open

:start_python
start "Polaris PWA Server" /min python -m http.server %PORT% --bind 127.0.0.1
goto open

:open
ping 127.0.0.1 -n 2 >nul
start "" "http://127.0.0.1:%PORT%/"
echo.
echo Polaris PWA запущена: http://127.0.0.1:%PORT%/
echo Это окно можно закрыть после запуска.
timeout /t 3 >nul
exit /b 0
