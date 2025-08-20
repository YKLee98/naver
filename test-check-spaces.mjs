import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, 'packages/backend/.env') });

// 하드코딩된 값
const HARD_ID = '42g71Rui1jMS5KKHDyDhIO';
const HARD_SECRET = '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu';

// 환경변수에서 가져온 값
const ENV_ID = process.env.NAVER_CLIENT_ID;
const ENV_SECRET = process.env.NAVER_CLIENT_SECRET;

console.log('🔍 Checking for spaces and hidden characters\n');

console.log('=== HARDCODED VALUES ===');
console.log(`ID: "${HARD_ID}"`);
console.log(`ID length: ${HARD_ID.length}`);
console.log(`ID bytes: ${Buffer.from(HARD_ID).toString('hex')}`);
console.log(`ID chars: [${HARD_ID.split('').map(c => `'${c}'`).join(', ')}]`);
console.log('');

console.log('=== ENV VALUES ===');
console.log(`ID: "${ENV_ID}"`);
console.log(`ID length: ${ENV_ID?.length}`);
console.log(`ID bytes: ${ENV_ID ? Buffer.from(ENV_ID).toString('hex') : 'undefined'}`);
console.log(`ID chars: [${ENV_ID ? ENV_ID.split('').map(c => `'${c}'`).join(', ') : 'undefined'}]`);
console.log('');

console.log('=== COMPARISON ===');
console.log(`Hardcoded === ENV: ${HARD_ID === ENV_ID}`);
console.log(`Trimmed comparison: ${HARD_ID === ENV_ID?.trim()}`);
console.log('');

// Check each character
if (ENV_ID) {
  console.log('=== CHARACTER BY CHARACTER CHECK ===');
  const maxLen = Math.max(HARD_ID.length, ENV_ID.length);
  for (let i = 0; i < maxLen; i++) {
    const hardChar = HARD_ID[i] || 'undefined';
    const envChar = ENV_ID[i] || 'undefined';
    const hardCode = HARD_ID.charCodeAt(i) || 0;
    const envCode = ENV_ID.charCodeAt(i) || 0;
    
    if (hardChar !== envChar) {
      console.log(`Position ${i}: DIFFERENT`);
      console.log(`  Hard: '${hardChar}' (code: ${hardCode}, hex: ${hardCode.toString(16)})`);
      console.log(`  Env:  '${envChar}' (code: ${envCode}, hex: ${envCode.toString(16)})`);
    }
  }
}

// Check for BOM, zero-width spaces, etc.
console.log('\n=== SPECIAL CHARACTERS CHECK ===');
if (ENV_ID) {
  // BOM check
  if (ENV_ID.charCodeAt(0) === 0xFEFF) {
    console.log('⚠️ BOM detected at start!');
  }
  
  // Zero-width space check
  if (ENV_ID.includes('\u200B')) {
    console.log('⚠️ Zero-width space detected!');
  }
  
  // Tab check
  if (ENV_ID.includes('\t')) {
    console.log('⚠️ Tab character detected!');
  }
  
  // Newline check
  if (ENV_ID.includes('\n') || ENV_ID.includes('\r')) {
    console.log('⚠️ Newline character detected!');
  }
  
  // Leading/trailing spaces
  if (ENV_ID !== ENV_ID.trim()) {
    console.log(`⚠️ Whitespace detected!`);
    console.log(`  Original: "${ENV_ID}"`);
    console.log(`  Trimmed:  "${ENV_ID.trim()}"`);
  }
}

console.log('\n=== SECRET CHECK ===');
console.log(`Secret (hard): "${HARD_SECRET}"`);
console.log(`Secret (env):  "${ENV_SECRET}"`);
console.log(`Secrets match: ${HARD_SECRET === ENV_SECRET}`);