# Naver-Shopify ERP System Startup Script
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "Starting Naver-Shopify ERP System" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# 프로젝트 디렉토리로 이동
Set-Location -Path "C:\Users\yukyu\OneDrive\Desktop\naver"

# 기존 ngrok 프로세스 종료
Write-Host "[1/4] Cleaning up existing processes..." -ForegroundColor Yellow
Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# ngrok 터널 시작
Write-Host "[2/4] Starting ngrok tunnels..." -ForegroundColor Yellow
Start-Process -FilePath "ngrok" -ArgumentList "start --all --config ngrok.yml" -WindowStyle Normal

# 대기
Start-Sleep -Seconds 3

# 백엔드 서버 시작
Write-Host "[3/4] Starting backend server..." -ForegroundColor Yellow
$backendPath = Join-Path $PSScriptRoot "packages\backend"
Start-Process -FilePath "cmd" -ArgumentList "/c cd /d `"$backendPath`" && npm run dev" -WindowStyle Normal

# 대기
Start-Sleep -Seconds 2

# 프론트엔드 서버 시작
Write-Host "[4/4] Starting frontend server..." -ForegroundColor Yellow
$frontendPath = Join-Path $PSScriptRoot "packages\frontend"
Start-Process -FilePath "cmd" -ArgumentList "/c cd /d `"$frontendPath`" && npm run dev" -WindowStyle Normal

# 완료 메시지
Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "All services started successfully!" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""
Write-Host "Frontend (Local): http://localhost:5173" -ForegroundColor Cyan
Write-Host "Frontend (Ngrok): https://broadly-full-monitor.ngrok-free.app" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend (Local): http://localhost:3000" -ForegroundColor Cyan
Write-Host "Backend (Ngrok): https://backend.monitor.ngrok.pro" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ngrok Dashboard: http://localhost:4040" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Green
Write-Host ""

# 브라우저 열기 옵션
$openBrowser = Read-Host "Open frontend in browser? (Y/N)"
if ($openBrowser -eq 'Y' -or $openBrowser -eq 'y') {
    Start-Process "https://broadly-full-monitor.ngrok-free.app"
}

Write-Host "Press any key to exit..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")