@echo off
echo ====================================
echo Starting Naver-Shopify ERP System
echo ====================================
echo.

:: 프로젝트 디렉토리로 이동
cd /d C:\Users\yukyu\OneDrive\Desktop\naver

:: ngrok 프로세스 종료 (기존 실행 중인 것이 있을 경우)
echo [1/4] Cleaning up existing processes...
taskkill /F /IM ngrok.exe >nul 2>&1

:: ngrok 터널 시작
echo [2/4] Starting ngrok tunnels...
start "ngrok" ngrok start --all --config ngrok.yml

:: 3초 대기 (ngrok이 시작될 시간)
timeout /t 3 /nobreak >nul

:: 백엔드 서버 시작
echo [3/4] Starting backend server...
cd packages\backend
start "Backend Server" cmd /c "npm run dev"

:: 2초 대기
timeout /t 2 /nobreak >nul

:: 프론트엔드 서버 시작
echo [4/4] Starting frontend server...
cd ..\frontend
start "Frontend Server" cmd /c "npm run dev"

:: 완료 메시지
echo.
echo ====================================
echo All services started successfully!
echo ====================================
echo.
echo Frontend (Local): http://localhost:5173
echo Frontend (Ngrok): https://broadly-full-monitor.ngrok-free.app
echo.
echo Backend (Local): http://localhost:3000
echo Backend (Ngrok): https://backend.monitor.ngrok.pro
echo.
echo Ngrok Dashboard: http://localhost:4040
echo ====================================
echo.
echo Press any key to open the frontend in browser...
pause >nul

:: 브라우저에서 프론트엔드 열기
start https://broadly-full-monitor.ngrok-free.app