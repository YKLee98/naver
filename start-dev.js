#!/usr/bin/env node

import { spawn, exec, execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(message) {
  console.log(`\n${colors.bright}${colors.blue}${'='.repeat(50)}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${message}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${'='.repeat(50)}${colors.reset}\n`);
}

// 포트가 사용 중인지 확인
function isPortInUse(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(true))
      .once('listening', () => {
        tester.once('close', () => resolve(false)).close();
      })
      .listen(port);
  });
}

// 기존 프로세스 종료
async function killExistingProcesses() {
  try {
    // Windows
    if (process.platform === 'win32') {
      // 포트 3000, 5173 사용 프로세스 종료
      try {
        execSync('netstat -ano | findstr :3000', { encoding: 'utf8' });
        execSync('taskkill /F /IM node.exe 2>nul', { encoding: 'utf8' });
      } catch (e) {}
      
      // ngrok 프로세스 종료
      try {
        execSync('taskkill /F /IM ngrok.exe 2>nul', { encoding: 'utf8' });
      } catch (e) {}
    } else {
      // Mac/Linux
      try {
        execSync('lsof -ti:3000 | xargs kill -9 2>/dev/null', { encoding: 'utf8' });
      } catch (e) {}
      try {
        execSync('lsof -ti:5173 | xargs kill -9 2>/dev/null', { encoding: 'utf8' });
      } catch (e) {}
      try {
        execSync('pkill -f ngrok 2>/dev/null', { encoding: 'utf8' });
      } catch (e) {}
    }
    
    // 잠시 대기
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (error) {
    // 무시
  }
}

// 서버가 준비되었는지 확인하는 함수
async function waitForServer(url, maxRetries = 60, retryDelay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await axios.get(url, { timeout: 1000 });
      return true;
    } catch (error) {
      if (i < maxRetries - 1) {
        process.stdout.write('.');
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  return false;
}

// 프로세스 실행 함수
function startProcess(name, command, cwd, readyMessage) {
  return new Promise((resolve, reject) => {
    log(`Starting ${name}...`, colors.yellow);
    
    const proc = spawn(command, [], {
      cwd,
      shell: true,
      stdio: 'pipe',
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    let resolved = false;
    let output = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
      const lines = data.toString().split('\n');
      
      lines.forEach(line => {
        if (line.trim()) {
          // 디버그 모드 - 모든 로그 출력
          if (process.env.DEBUG) {
            console.log(`[${name}] ${line.trim()}`);
          } else {
            // 중요한 로그만 출력
            if (line.includes('🌐') || line.includes('✅') || line.includes('ready') || 
                line.includes('Server started') || line.includes('listening') || line.includes('HTTP server')) {
              console.log(`[${name}] ${line.trim()}`);
            }
          }
        }
      });
      
      if (!resolved && (output.includes(readyMessage) || 
          (name === 'Backend' && (output.includes('Server started successfully') || output.includes('HTTP server listening') || output.includes('🎉 Server started successfully!'))) ||
          (name === 'Frontend' && (output.includes('ready in') || output.includes('Local:'))))) {
        resolved = true;
        log(`✅ ${name} is ready!`, colors.green);
        resolve(proc);
      }
    });

    proc.stderr.on('data', (data) => {
      const output = data.toString();
      // 경고 및 일부 에러 무시
      if (!output.includes('Warning:') && 
          !output.includes('DeprecationWarning') &&
          !output.includes('MONGOOSE') &&
          !output.includes('Port 3000 is already in use')) {
        if (output.includes('error') || output.includes('Error')) {
          console.error(`[${name} Error] ${output.trim()}`);
        }
      }
    });

    proc.on('error', (error) => {
      log(`❌ Failed to start ${name}: ${error.message}`, colors.red);
      reject(error);
    });

    proc.on('exit', (code) => {
      if (code !== 0 && !resolved) {
        reject(new Error(`${name} exited with code ${code}`));
      }
    });

    // 타임아웃 설정
    setTimeout(() => {
      if (!resolved) {
        // 타임아웃이어도 계속 진행
        resolved = true;
        log(`⚠️ ${name} startup timeout (60s), but continuing...`, colors.yellow);
        resolve(proc);
      }
    }, 60000); // 60초 타임아웃
  });
}

// ngrok 실행 및 URL 가져오기
async function startNgrok() {
  return new Promise((resolve, reject) => {
    log('Starting ngrok tunnels...', colors.yellow);
    
    // ngrok.yml 설정 파일 사용
    const ngrokConfigPath = join(__dirname, 'ngrok.yml');
    const ngrokCommand = existsSync(ngrokConfigPath) 
      ? `ngrok start --all --config="${ngrokConfigPath}"`
      : 'ngrok http 5173';
    
    const ngrok = spawn(ngrokCommand, [], {
      shell: true,
      stdio: 'pipe'
    });

    // ngrok이 실행되면 API로 URL 가져오기
    setTimeout(async () => {
      try {
        const response = await axios.get('http://127.0.0.1:4040/api/tunnels');
        const tunnels = response.data.tunnels;
        
        // frontend와 backend 터널 찾기
        const frontendTunnel = tunnels.find(t => t.name === 'frontend' && t.proto === 'https') || 
                               tunnels.find(t => t.config.addr.includes('5173') && t.proto === 'https');
        const backendTunnel = tunnels.find(t => t.name === 'backend' && t.proto === 'https') || 
                              tunnels.find(t => t.config.addr.includes('3000') && t.proto === 'https');
        
        if (frontendTunnel) {
          const frontendUrl = frontendTunnel.public_url;
          const backendUrl = backendTunnel ? backendTunnel.public_url : null;
          const hostname = new URL(frontendUrl).hostname;
          
          log(`✅ Ngrok tunnels established!`, colors.green);
          log(`🌐 Frontend URL: ${colors.bright}${colors.cyan}${frontendUrl}${colors.reset}`, '');
          if (backendUrl) {
            log(`🌐 Backend URL: ${colors.bright}${colors.cyan}${backendUrl}${colors.reset}`, '');
          }
          
          resolve({ 
            frontendUrl, 
            backendUrl,
            hostname, 
            process: ngrok 
          });
        } else {
          reject(new Error('No HTTPS tunnel found'));
        }
      } catch (error) {
        reject(new Error(`Failed to get ngrok URLs: ${error.message}`));
      }
    }, 5000); // ngrok이 시작되기를 기다림 (설정 파일 사용시 더 오래 걸림)

    ngrok.on('error', (error) => {
      reject(error);
    });
  });
}

// 환경변수 파일 및 설정 업데이트
function updateConfigs(frontendUrl, backendUrl, hostname) {
  // 백엔드 .env 업데이트
  const backendEnvPath = join(__dirname, 'packages', 'backend', '.env');
  const frontendEnvPath = join(__dirname, 'packages', 'frontend', '.env');
  
  try {
    // 백엔드 CORS 설정 업데이트 (CORS는 이미 cors.ts에서 ngrok를 자동 허용함)
    if (existsSync(backendEnvPath)) {
      let backendContent = readFileSync(backendEnvPath, 'utf8');
      const corsRegex = /CORS_ORIGIN=.*/;
      
      if (corsRegex.test(backendContent)) {
        // 기존 CORS_ORIGIN에 ngrok URL 추가
        const currentCors = backendContent.match(corsRegex)[0];
        if (!currentCors.includes(frontendUrl)) {
          const origins = currentCors.replace('CORS_ORIGIN=', '').split(',').filter(o => o);
          if (!origins.includes('http://localhost:5173')) {
            origins.push('http://localhost:5173');
          }
          origins.push(frontendUrl);
          const newCors = `CORS_ORIGIN=${origins.join(',')}`;
          backendContent = backendContent.replace(corsRegex, newCors);
          writeFileSync(backendEnvPath, backendContent, 'utf8');
          log(`✅ Updated backend .env with ngrok URL`, colors.green);
        }
      } else {
        // CORS_ORIGIN이 없으면 추가
        backendContent += `\nCORS_ORIGIN=http://localhost:5173,${frontendUrl}\n`;
        writeFileSync(backendEnvPath, backendContent, 'utf8');
        log(`✅ Added CORS_ORIGIN to backend .env`, colors.green);
      }
    }
    
    // 프론트엔드 .env 파일 생성/업데이트
    // ngrok URL을 사용할 때는 백엔드 URL을 직접 사용
    const frontendEnvContent = `VITE_NGROK_URL=${frontendUrl}
VITE_API_URL=${backendUrl}/api/v1
VITE_BACKEND_URL=${backendUrl}
`;
    writeFileSync(frontendEnvPath, frontendEnvContent, 'utf8');
    log(`✅ Updated frontend .env with ngrok URLs`, colors.green);
    
  } catch (error) {
    log(`⚠️  Could not update configuration files: ${error.message}`, colors.yellow);
  }
}

// 메인 실행 함수
async function main() {
  const processes = [];
  
  logSection('🚀 Starting Development Environment with ngrok');

  try {
    // 0. 기존 프로세스 정리
    log('🧹 Cleaning up existing processes...', colors.yellow);
    await killExistingProcesses();
    
    // 1. 포트 확인
    const backendPortInUse = await isPortInUse(3000);
    const frontendPortInUse = await isPortInUse(5173);
    
    if (backendPortInUse || frontendPortInUse) {
      log('⚠️  Some ports are still in use, waiting...', colors.yellow);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // 2. 백엔드 시작
    log('🎯 Starting Backend Server...', colors.cyan);
    const backendProcess = await startProcess(
      'Backend',
      'pnpm dev',
      join(__dirname, 'packages', 'backend'),
      'Server started successfully'
    );
    processes.push(backendProcess);

    // 3. 백엔드 API 확인
    process.stdout.write('\n🔍 Checking backend API');
    const backendReady = await waitForServer('http://localhost:3000/health', 60, 1000);
    if (!backendReady) {
      log('\n⚠️  Backend API check timeout, but continuing...', colors.yellow);
    } else {
      console.log(' ✅ Ready!');
    }

    // 4. 프론트엔드 시작
    log('\n🎨 Starting Frontend Server...', colors.cyan);
    const frontendProcess = await startProcess(
      'Frontend',
      'pnpm dev --host',
      join(__dirname, 'packages', 'frontend'),
      'ready in'
    );
    processes.push(frontendProcess);

    // 5. 프론트엔드 확인
    process.stdout.write('\n🔍 Checking frontend');
    const frontendReady = await waitForServer('http://localhost:5173', 60, 1000);
    if (!frontendReady) {
      log('\n⚠️  Frontend check timeout, but continuing...', colors.yellow);
    } else {
      console.log(' ✅ Ready!');
    }

    // 6. ngrok 시작
    log('\n🌐 Starting ngrok tunnels...', colors.cyan);
    const { frontendUrl, backendUrl, hostname, process: ngrokProcess } = await startNgrok();
    processes.push(ngrokProcess);
    
    // 백엔드 URL이 없으면 프론트엔드 URL과 동일하게 설정 (ngrok가 하나의 도메인만 제공하는 경우)
    const finalBackendUrl = backendUrl || frontendUrl;

    // 7. 환경변수 및 설정 업데이트
    log('\n🔧 Updating configurations...', colors.yellow);
    updateConfigs(frontendUrl, finalBackendUrl, hostname);
    
    // 8. 서버 재시작 여부 확인
    // 환경변수가 변경되었을 때만 재시작
    const needRestart = !existsSync(join(__dirname, 'packages', 'frontend', '.env')) || 
                       !readFileSync(join(__dirname, 'packages', 'frontend', '.env'), 'utf8').includes(frontendUrl);
    
    if (needRestart) {
      log('🔄 Restarting servers with updated config...', colors.yellow);
      
      // 백엔드 재시작 (환경변수 변경 적용)
      processes[0].kill();
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const newBackendProcess = await startProcess(
        'Backend',
        'pnpm dev',
        join(__dirname, 'packages', 'backend'),
        'Server started successfully'
      );
      processes[0] = newBackendProcess;
      
      // 프론트엔드 재시작
      processes[1].kill();
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const newFrontendProcess = await startProcess(
        'Frontend',
        'pnpm dev --host',
        join(__dirname, 'packages', 'frontend'),
        'ready in'
      );
      processes[1] = newFrontendProcess;
      
      // 재시작 후 서버 안정화 대기
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    
    logSection('✨ Development Environment Ready!');
    console.log();
    log(`📍 Local Access:`, colors.bright);
    log(`   Backend:  ${colors.cyan}http://localhost:3000${colors.reset}`, '');
    log(`   Frontend: ${colors.cyan}http://localhost:5173${colors.reset}`, '');
    console.log();
    log(`🌐 Public Access (ngrok):`, colors.bright);
    log(`   Frontend: ${colors.bright}${colors.green}${frontendUrl}${colors.reset}`, '');
    if (backendUrl) {
      log(`   Backend:  ${colors.bright}${colors.green}${backendUrl}${colors.reset}`, '');
    }
    console.log();
    log(`📚 Additional:`, colors.bright);
    log(`   API Docs:    ${colors.cyan}http://localhost:3000/api-docs${colors.reset}`, '');
    log(`   Health:      ${colors.cyan}http://localhost:3000/health${colors.reset}`, '');
    if (backendUrl) {
      log(`   Public API:  ${colors.cyan}${backendUrl}/api/v1${colors.reset}`, '');
    }
    console.log();
    log('💡 Tips:', colors.bright);
    log('   - ngrok URL에서 모든 기능이 정상 작동합니다', colors.cyan);
    log('   - API 호출은 자동으로 처리됩니다', colors.cyan);
    log('   - CORS 설정이 자동으로 업데이트됩니다', colors.cyan);
    log('   - 외부에서 접속 가능한 URL입니다', colors.cyan);
    console.log();
    log('Press Ctrl+C to stop all services', colors.yellow);

    // Ctrl+C 처리
    process.on('SIGINT', () => {
      console.log('\n');
      log('Shutting down services...', colors.yellow);
      
      processes.forEach(proc => {
        if (proc && !proc.killed) {
          proc.kill();
        }
      });
      
      log('👋 Goodbye!', colors.green);
      process.exit(0);
    });

  } catch (error) {
    log(`❌ Error: ${error.message}`, colors.red);
    
    // 에러 발생 시 모든 프로세스 종료
    processes.forEach(proc => {
      if (proc && !proc.killed) {
        proc.kill();
      }
    });
    
    process.exit(1);
  }
}

// 스크립트 실행
main().catch(error => {
  log(`❌ Unexpected error: ${error.message}`, colors.red);
  process.exit(1);
});