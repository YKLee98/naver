#!/usr/bin/env node

/**
 * 간단한 ngrok 설정 스크립트
 * 사용법: node ngrok-simple.js <ngrok-url>
 * 예시: node ngrok-simple.js https://abc123.ngrok-free.app
 */

const fs = require('fs');
const path = require('path');

// 색상
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const red = '\x1b[31m';
const reset = '\x1b[0m';

function updateEnvFiles(ngrokUrl) {
  // URL 정리
  ngrokUrl = ngrokUrl.trim().replace(/\/$/, '');
  
  console.log(`\n${yellow}📝 Updating configuration for: ${ngrokUrl}${reset}\n`);
  
  try {
    // 1. 루트 .env 업데이트
    const rootEnvPath = path.join(__dirname, '.env');
    let rootEnv = fs.readFileSync(rootEnvPath, 'utf8');
    
    if (rootEnv.includes('ngrok_url=')) {
      rootEnv = rootEnv.replace(/ngrok_url=.*/g, `ngrok_url=${ngrokUrl}`);
    } else {
      rootEnv = rootEnv.trim() + `\nngrok_url=${ngrokUrl}\n`;
    }
    
    fs.writeFileSync(rootEnvPath, rootEnv);
    console.log(`${green}✅ Updated root .env${reset}`);
    
    // 2. 프론트엔드 .env 생성
    const frontendEnvPath = path.join(__dirname, 'packages', 'frontend', '.env');
    const frontendEnv = `# ngrok configuration
VITE_NGROK_URL=${ngrokUrl}
VITE_API_URL=/api/v1
`;
    
    fs.writeFileSync(frontendEnvPath, frontendEnv);
    console.log(`${green}✅ Updated frontend .env${reset}`);
    
    // 3. 성공 메시지
    console.log(`\n${green}========================================${reset}`);
    console.log(`${green}✨ Configuration updated successfully!${reset}`);
    console.log(`${green}========================================${reset}\n`);
    
    console.log(`${yellow}📋 How to use:${reset}`);
    console.log(`1. Run: ${yellow}ngrok http 5173${reset}`);
    console.log(`2. Run: ${yellow}pnpm dev${reset} (in root directory)`);
    console.log(`3. Access: ${yellow}${ngrokUrl}${reset}\n`);
    
    console.log(`${green}📱 Mobile URLs:${reset}`);
    console.log(`   Dashboard: ${ngrokUrl}/dashboard`);
    console.log(`   Inventory: ${ngrokUrl}/inventory`);
    console.log(`   SKU Mapping: ${ngrokUrl}/sku-mapping`);
    console.log(`   Pricing: ${ngrokUrl}/pricing\n`);
    
  } catch (error) {
    console.error(`${red}❌ Error: ${error.message}${reset}`);
    process.exit(1);
  }
}

// 메인 실행
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`${yellow}Usage: node ngrok-simple.js <ngrok-url>${reset}`);
  console.log(`${yellow}Example: node ngrok-simple.js https://abc123.ngrok-free.app${reset}\n`);
  process.exit(0);
}

const ngrokUrl = args[0];

if (!ngrokUrl.includes('ngrok')) {
  console.error(`${red}❌ Invalid ngrok URL${reset}`);
  process.exit(1);
}

updateEnvFiles(ngrokUrl);