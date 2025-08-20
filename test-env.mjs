import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.join(__dirname, 'packages/backend/.env');
console.log('📁 Loading .env from:', envPath);

const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('❌ Error loading .env:', result.error);
} else {
  console.log('✅ .env loaded successfully');
  console.log('📋 Parsed values:', result.parsed);
}

console.log('\n🔍 Environment Variables Check:\n');
console.log('NAVER_CLIENT_ID:', process.env.NAVER_CLIENT_ID);
console.log('NAVER_CLIENT_ID length:', process.env.NAVER_CLIENT_ID?.length);
console.log('NAVER_CLIENT_ID chars:', process.env.NAVER_CLIENT_ID?.split('').map(c => `'${c}'`).join(' '));

console.log('\nNAVER_CLIENT_SECRET:', process.env.NAVER_CLIENT_SECRET);
console.log('NAVER_CLIENT_SECRET length:', process.env.NAVER_CLIENT_SECRET?.length);
console.log('NAVER_CLIENT_SECRET starts with $2a:', process.env.NAVER_CLIENT_SECRET?.startsWith('$2a'));

console.log('\nNAVER_API_BASE_URL:', process.env.NAVER_API_BASE_URL);
console.log('NAVER_STORE_ID:', process.env.NAVER_STORE_ID);

// Test if there are any hidden characters
console.log('\n🔬 Checking for hidden characters:');
const clientId = process.env.NAVER_CLIENT_ID;
if (clientId) {
  console.log('Client ID bytes:', Buffer.from(clientId).toString('hex'));
  console.log('Client ID JSON:', JSON.stringify(clientId));
  
  // Check for BOM or other invisible characters
  if (clientId.charCodeAt(0) === 0xFEFF) {
    console.log('⚠️  BOM detected in CLIENT_ID!');
  }
  
  // Check for trailing spaces or newlines
  if (clientId !== clientId.trim()) {
    console.log('⚠️  Whitespace detected in CLIENT_ID!');
    console.log('Trimmed:', clientId.trim());
    console.log('Trimmed length:', clientId.trim().length);
  }
}

const clientSecret = process.env.NAVER_CLIENT_SECRET;
if (clientSecret) {
  console.log('\nClient Secret bytes (first 20):', Buffer.from(clientSecret).slice(0, 20).toString('hex'));
  console.log('Client Secret JSON:', JSON.stringify(clientSecret));
  
  if (clientSecret !== clientSecret.trim()) {
    console.log('⚠️  Whitespace detected in CLIENT_SECRET!');
  }
}