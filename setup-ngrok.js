#!/usr/bin/env node

/**
 * ngrok 설정 자동화 스크립트
 * - 프론트엔드 ngrok URL을 .env 파일에 자동 업데이트
 * - 백엔드 API 호출을 프록시로 처리
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 색상 코드
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function updateEnvFile(ngrokUrl) {
  const rootEnvPath = path.join(__dirname, '.env');
  const frontendEnvPath = path.join(__dirname, 'packages', 'frontend', '.env');
  
  try {
    // 1. 루트 .env 업데이트
    let rootEnv = '';
    if (fs.existsSync(rootEnvPath)) {
      rootEnv = fs.readFileSync(rootEnvPath, 'utf8');
    }
    
    // ngrok_url 업데이트 또는 추가
    if (rootEnv.includes('ngrok_url=')) {
      rootEnv = rootEnv.replace(/ngrok_url=.*/g, `ngrok_url=${ngrokUrl}`);
    } else {
      rootEnv += `\nngrok_url=${ngrokUrl}\n`;
    }
    
    fs.writeFileSync(rootEnvPath, rootEnv);
    log(`✅ Updated root .env with ngrok URL: ${ngrokUrl}`, 'green');
    
    // 2. 프론트엔드 .env 업데이트 (백엔드를 localhost로 유지)
    const frontendEnv = `# Local development settings
# ngrok을 통해 접속 시 백엔드는 프록시로 처리됨
VITE_API_URL=/api/v1
VITE_NGROK_URL=${ngrokUrl}
`;
    
    fs.writeFileSync(frontendEnvPath, frontendEnv);
    log(`✅ Updated frontend .env`, 'green');
    
  } catch (error) {
    log(`❌ Error updating env files: ${error.message}`, 'red');
    return false;
  }
  
  return true;
}

function updateViteConfig() {
  const viteConfigPath = path.join(__dirname, 'packages', 'frontend', 'vite.config.ts');
  
  try {
    let viteConfig = fs.readFileSync(viteConfigPath, 'utf8');
    
    // proxy 설정이 올바른지 확인
    if (!viteConfig.includes("'/api/v1': {")) {
      log('⚠️  Vite proxy configuration might need adjustment', 'yellow');
    }
    
    log('✅ Vite config checked', 'green');
    return true;
  } catch (error) {
    log(`❌ Error checking Vite config: ${error.message}`, 'red');
    return false;
  }
}

async function getNgrokUrl() {
  return new Promise((resolve) => {
    rl.question(`${colors.cyan}Enter your ngrok URL (e.g., https://abc123.ngrok-free.app): ${colors.reset}`, (url) => {
      // URL 정리
      url = url.trim();
      if (!url.startsWith('http')) {
        url = 'https://' + url;
      }
      // 트레일링 슬래시 제거
      url = url.replace(/\/$/, '');
      resolve(url);
    });
  });
}

async function main() {
  log('\n🚀 ngrok Setup Script\n', 'bright');
  log('This script will configure your app to work with ngrok tunneling.\n', 'blue');
  
  // 1. ngrok URL 입력받기
  const ngrokUrl = await getNgrokUrl();
  
  if (!ngrokUrl || !ngrokUrl.includes('ngrok')) {
    log('❌ Invalid ngrok URL', 'red');
    rl.close();
    process.exit(1);
  }
  
  log(`\n📝 Configuring for: ${ngrokUrl}\n`, 'yellow');
  
  // 2. 환경 파일 업데이트
  if (!updateEnvFile(ngrokUrl)) {
    rl.close();
    process.exit(1);
  }
  
  // 3. Vite 설정 확인
  updateViteConfig();
  
  // 4. 사용 안내
  log('\n' + '='.repeat(60), 'cyan');
  log('✨ Setup Complete!', 'green');
  log('='.repeat(60) + '\n', 'cyan');
  
  log('📋 Next Steps:', 'yellow');
  log('1. Start ngrok with your frontend port:', 'blue');
  log(`   ${colors.bright}ngrok http 5173${colors.reset}`);
  log('');
  log('2. Start the servers:', 'blue');
  log(`   ${colors.bright}pnpm dev${colors.reset} (in root directory)`);
  log('');
  log('3. Access your app:', 'blue');
  log(`   ${colors.bright}${ngrokUrl}${colors.reset}`);
  log('');
  log('📱 Mobile Access:', 'yellow');
  log(`   Open ${ngrokUrl} on your mobile device`);
  log('');
  log('⚠️  Important:', 'yellow');
  log('   - The backend API calls will be proxied through Vite');
  log('   - Make sure both frontend and backend servers are running');
  log('   - If you get a new ngrok URL, run this script again');
  log('');
  
  rl.close();
}

// 프로세스 종료 처리
process.on('SIGINT', () => {
  log('\n\n👋 Bye!', 'cyan');
  rl.close();
  process.exit(0);
});

// 실행
main().catch((error) => {
  log(`\n❌ Error: ${error.message}`, 'red');
  rl.close();
  process.exit(1);
});