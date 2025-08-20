#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 색상
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function updateEnvFiles(ngrokUrl) {
  // URL 정리
  ngrokUrl = ngrokUrl.trim().replace(/\/$/, '');
  
  log(`\n📝 Updating configuration for: ${ngrokUrl}`, 'yellow');
  
  try {
    // 1. 루트 .env 업데이트
    const rootEnvPath = path.join(__dirname, '.env');
    let rootEnv = '';
    
    if (fs.existsSync(rootEnvPath)) {
      rootEnv = fs.readFileSync(rootEnvPath, 'utf8');
    }
    
    // ngrok_url 업데이트
    if (rootEnv.includes('ngrok_url=')) {
      rootEnv = rootEnv.replace(/ngrok_url=.*/g, `ngrok_url=${ngrokUrl}`);
    } else {
      rootEnv = rootEnv.trim() + `\nngrok_url=${ngrokUrl}\n`;
    }
    
    fs.writeFileSync(rootEnvPath, rootEnv);
    log('✅ Updated root .env', 'green');
    
    // 2. 프론트엔드 .env 생성
    const frontendEnvPath = path.join(__dirname, 'packages', 'frontend', '.env');
    const frontendEnv = `# ngrok configuration
VITE_NGROK_URL=${ngrokUrl}
VITE_API_URL=/api/v1
`;
    
    fs.writeFileSync(frontendEnvPath, frontendEnv);
    log('✅ Updated frontend .env', 'green');
    
    // 3. 백엔드 .env 확인 (없으면 루트에서 복사)
    const backendEnvPath = path.join(__dirname, 'packages', 'backend', '.env');
    if (!fs.existsSync(backendEnvPath) && fs.existsSync(rootEnvPath)) {
      fs.copyFileSync(rootEnvPath, backendEnvPath);
      log('✅ Created backend .env from root', 'green');
    }
    
    return true;
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    return false;
  }
}

// 메인 실행
const args = process.argv.slice(2);

if (args.length === 0) {
  log('\n🚀 ngrok URL Setup Script', 'cyan');
  log('=' .repeat(40), 'cyan');
  log('\nUsage: node setup-ngrok-url.js <ngrok-url>', 'yellow');
  log('Example: node setup-ngrok-url.js https://abc123.ngrok-free.app', 'yellow');
  log('\nSteps:', 'cyan');
  log('1. Start ngrok: ngrok http 5173', 'yellow');
  log('2. Copy the https URL from ngrok', 'yellow');
  log('3. Run this script with the URL', 'yellow');
  log('4. Start servers: pnpm dev', 'yellow');
  process.exit(0);
}

const ngrokUrl = args[0];

if (!ngrokUrl.includes('ngrok')) {
  log('❌ Invalid ngrok URL', 'red');
  log('URL should contain "ngrok" (e.g., https://abc123.ngrok-free.app)', 'yellow');
  process.exit(1);
}

if (updateEnvFiles(ngrokUrl)) {
  log('\n' + '=' .repeat(50), 'green');
  log('✨ Configuration updated successfully!', 'green');
  log('=' .repeat(50), 'green');
  
  log('\n📋 Next steps:', 'yellow');
  log('1. Make sure ngrok is running: ngrok http 5173', 'cyan');
  log('2. Start the servers: pnpm dev', 'cyan');
  log(`3. Access the app: ${ngrokUrl}`, 'cyan');
  
  log('\n📱 Mobile URLs:', 'yellow');
  log(`   Dashboard: ${ngrokUrl}/dashboard`, 'cyan');
  log(`   Inventory: ${ngrokUrl}/inventory`, 'cyan');
  log(`   SKU Mapping: ${ngrokUrl}/sku-mapping`, 'cyan');
  log(`   Pricing: ${ngrokUrl}/pricing`, 'cyan');
  
  log('\n✅ Done!', 'green');
}