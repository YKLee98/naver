@echo off
echo ====================================
echo Stopping Naver-Shopify ERP System
echo ====================================
echo.

echo Stopping all processes...

:: ngrok 종료
taskkill /F /IM ngrok.exe >nul 2>&1

:: Node.js 프로세스 종료 (백엔드, 프론트엔드)
taskkill /F /IM node.exe >nul 2>&1

:: cmd 창 제목으로 특정 프로세스 종료
taskkill /F /FI "WINDOWTITLE eq Backend Server*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Frontend Server*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq ngrok*" >nul 2>&1

echo.
echo ====================================
echo All services stopped successfully!
echo ====================================
echo.
pause