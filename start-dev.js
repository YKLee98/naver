#!/usr/bin/env node

import { spawn, exec } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

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

// 서버가 준비되었는지 확인하는 함수
async function waitForServer(url, maxRetries = 30, retryDelay = 2000) {
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
    
    const [cmd, ...args] = command.split(' ');
    const proc = spawn(cmd, args, {
      cwd,
      shell: true,
      stdio: 'pipe'
    });

    let resolved = false;

    proc.stdout.on('data', (data) => {
      const output = data.toString();
      // 디버그용 로그 - 백엔드의 경우 활성화
      if (name === 'Backend' && !resolved) {
        console.log(`[${name}] ${output.trim()}`);
      }
      
      if (!resolved && output.includes(readyMessage)) {
        resolved = true;
        log(`✅ ${name} is ready!`, colors.green);
        resolve(proc);
      }
    });

    proc.stderr.on('data', (data) => {
      const output = data.toString();
      // Node.js 경고는 무시
      if (!output.includes('Warning:') && !output.includes('DeprecationWarning')) {
        console.error(`[${name} Error] ${output}`);
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
        proc.kill();
        reject(new Error(`${name} startup timeout`));
      }
    }, 60000); // 60초 타임아웃
  });
}

// ngrok 실행 및 URL 가져오기
async function startNgrok() {
  return new Promise((resolve, reject) => {
    log('Starting ngrok tunnel...', colors.yellow);
    
    const ngrok = spawn('ngrok', ['http', '5173'], {
      shell: true,
      stdio: 'pipe'
    });

    // ngrok이 실행되면 API로 URL 가져오기
    setTimeout(async () => {
      try {
        const response = await axios.get('http://127.0.0.1:4040/api/tunnels');
        const tunnel = response.data.tunnels.find(t => t.proto === 'https');
        
        if (tunnel) {
          const url = tunnel.public_url;
          const hostname = new URL(url).hostname;
          
          log(`✅ Ngrok tunnel established!`, colors.green);
          log(`🌐 Public URL: ${colors.bright}${colors.cyan}${url}${colors.reset}`, '');
          
          resolve({ url, hostname, process: ngrok });
        } else {
          reject(new Error('No HTTPS tunnel found'));
        }
      } catch (error) {
        reject(new Error(`Failed to get ngrok URL: ${error.message}`));
      }
    }, 3000); // ngrok이 시작되기를 기다림

    ngrok.on('error', (error) => {
      reject(error);
    });
  });
}

// vite.config.ts 업데이트
function updateViteConfig(hostname) {
  const viteConfigPath = join(__dirname, 'packages', 'frontend', 'vite.config.ts');
  
  try {
    let content = readFileSync(viteConfigPath, 'utf8');
    
    // allowedHosts 배열 찾기
    const allowedHostsRegex = /allowedHosts:\s*\[(.*?)\]/s;
    const match = content.match(allowedHostsRegex);
    
    if (match) {
      const existingHosts = match[1];
      
      // 이미 추가되어 있는지 확인
      if (!existingHosts.includes(hostname)) {
        // 새 호스트 추가
        const newHosts = existingHosts.trim() 
          ? `${existingHosts.trim()}, '${hostname}'`
          : `'${hostname}'`;
        
        const newAllowedHosts = `allowedHosts: [${newHosts}]`;
        content = content.replace(allowedHostsRegex, newAllowedHosts);
        
        writeFileSync(viteConfigPath, content, 'utf8');
        log(`✅ Updated vite.config.ts with ngrok hostname: ${hostname}`, colors.green);
      } else {
        log(`ℹ️  Ngrok hostname already exists in vite.config.ts`, colors.yellow);
      }
    } else {
      log(`⚠️  Could not find allowedHosts in vite.config.ts`, colors.yellow);
    }
  } catch (error) {
    log(`❌ Failed to update vite.config.ts: ${error.message}`, colors.red);
  }
}

// 메인 실행 함수
async function main() {
  const processes = [];
  
  logSection('🚀 Starting Development Environment');

  try {
    // 1. 백엔드 시작
    const backendProcess = await startProcess(
      'Backend',
      'pnpm dev',
      join(__dirname, 'packages', 'backend'),
      'Configuration loaded'  // 설정 로드 완료 메시지
    );
    processes.push(backendProcess);

    // 2. 백엔드가 완전히 준비될 때까지 추가 대기
    process.stdout.write('Waiting for backend API');
    const backendReady = await waitForServer('http://localhost:3000/health');
    if (!backendReady) {
      throw new Error('Backend failed to start');
    }
    console.log(' Ready!');

    // 3. 프론트엔드 시작
    const frontendProcess = await startProcess(
      'Frontend',
      'pnpm dev',
      join(__dirname, 'packages', 'frontend'),
      'ready in'
    );
    processes.push(frontendProcess);

    // 4. 프론트엔드가 완전히 준비될 때까지 대기
    process.stdout.write('Waiting for frontend');
    const frontendReady = await waitForServer('http://localhost:5173');
    if (!frontendReady) {
      throw new Error('Frontend failed to start');
    }
    console.log(' Ready!');

    // 5. ngrok 시작
    const { url, hostname, process: ngrokProcess } = await startNgrok();
    processes.push(ngrokProcess);

    // 6. vite.config.ts 업데이트
    updateViteConfig(hostname);

    logSection('✨ Development Environment Ready!');
    log(`📍 Local Backend:  ${colors.cyan}http://localhost:3000${colors.reset}`, '');
    log(`📍 Local Frontend: ${colors.cyan}http://localhost:5173${colors.reset}`, '');
    log(`🌐 Public URL:     ${colors.bright}${colors.green}${url}${colors.reset}`, '');
    log(`📚 API Docs:       ${colors.cyan}http://localhost:3000/api-docs${colors.reset}`, '');
    log(`💚 Health Check:   ${colors.cyan}http://localhost:3000/health${colors.reset}`, '');
    console.log();
    log('💡 API calls from ngrok URL will be proxied to backend via Vite', colors.cyan);
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