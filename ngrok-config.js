#!/usr/bin/env node

/**
 * Cross-platform ngrok configuration script
 * Works on Windows, Ubuntu, macOS
 * 
 * Usage: node ngrok-config.js [ngrok-url]
 * Interactive mode: node ngrok-config.js
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { platform } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cross-platform colors
const colors = (() => {
  const isWindows = platform() === 'win32';
  const supportsColor = process.stdout.isTTY && !isWindows || process.env.FORCE_COLOR;
  
  if (!supportsColor) {
    return {
      green: '',
      yellow: '',
      red: '',
      cyan: '',
      magenta: '',
      reset: ''
    };
  }
  
  return {
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    reset: '\x1b[0m'
  };
})();

class NgrokConfigurator {
  constructor() {
    this.rootDir = process.cwd();
    this.envPaths = {
      root: path.join(this.rootDir, '.env'),
      frontend: path.join(this.rootDir, 'packages', 'frontend', '.env'),
      backend: path.join(this.rootDir, 'packages', 'backend', '.env')
    };
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  async promptForUrl() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      this.log('\n🚀 ngrok Configuration Tool', 'cyan');
      this.log('=' .repeat(50), 'cyan');
      this.log('\nThis tool will configure your app for ngrok access', 'yellow');
      this.log('');
      
      rl.question(`${colors.cyan}Enter your ngrok URL (e.g., https://abc123.ngrok-free.app): ${colors.reset}`, (url) => {
        rl.close();
        resolve(url.trim());
      });
    });
  }

  validateUrl(url) {
    if (!url) return false;
    
    // Clean up the URL
    url = url.trim().replace(/\/$/, '');
    
    // Check if it's a valid ngrok URL
    const ngrokPattern = /^https?:\/\/[a-z0-9-]+\.(ngrok-free\.app|ngrok\.io|ngrok\.app)/i;
    return ngrokPattern.test(url);
  }

  updateEnvFile(filePath, updates) {
    try {
      let content = '';
      
      // Read existing file if it exists
      if (fs.existsSync(filePath)) {
        content = fs.readFileSync(filePath, 'utf8');
      }
      
      // Update or add each key-value pair
      Object.entries(updates).forEach(([key, value]) => {
        const regex = new RegExp(`^${key}=.*$`, 'gm');
        if (regex.test(content)) {
          content = content.replace(regex, `${key}=${value}`);
        } else {
          // Add to the end if not exists
          content = content.trim() + `\n${key}=${value}\n`;
        }
      });
      
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Write the file
      fs.writeFileSync(filePath, content.trim() + '\n');
      return true;
    } catch (error) {
      this.log(`Error updating ${filePath}: ${error.message}`, 'red');
      return false;
    }
  }

  configure(ngrokUrl) {
    // Clean URL
    ngrokUrl = ngrokUrl.trim().replace(/\/$/, '');
    
    this.log(`\n📝 Configuring for: ${ngrokUrl}`, 'yellow');
    this.log('');
    
    // 1. Update root .env
    if (this.updateEnvFile(this.envPaths.root, {
      ngrok_url: ngrokUrl,
      NGROK_URL: ngrokUrl
    })) {
      this.log('✅ Updated root .env', 'green');
    }
    
    // 2. Update frontend .env
    if (this.updateEnvFile(this.envPaths.frontend, {
      VITE_NGROK_URL: ngrokUrl,
      VITE_API_URL: '/api/v1'
    })) {
      this.log('✅ Updated frontend .env', 'green');
    }
    
    // 3. Create backend .env if needed
    if (!fs.existsSync(this.envPaths.backend) && fs.existsSync(this.envPaths.root)) {
      try {
        fs.copyFileSync(this.envPaths.root, this.envPaths.backend);
        this.log('✅ Created backend .env from root', 'green');
      } catch (error) {
        this.log(`⚠️  Could not create backend .env: ${error.message}`, 'yellow');
      }
    }
    
    this.showSuccess(ngrokUrl);
  }

  showSuccess(ngrokUrl) {
    this.log('\n' + '=' .repeat(60), 'green');
    this.log('✨ Configuration Complete!', 'green');
    this.log('=' .repeat(60), 'green');
    
    this.log('\n📋 Quick Start Guide:', 'yellow');
    this.log('');
    
    // Platform-specific instructions
    const isWindows = platform() === 'win32';
    const command = isWindows ? 'Command Prompt or PowerShell' : 'Terminal';
    
    this.log(`1. Open a new ${command} and start ngrok:`, 'cyan');
    this.log(`   ngrok http 5173`, 'magenta');
    this.log('');
    
    this.log('2. Start the development servers:', 'cyan');
    this.log(`   pnpm dev`, 'magenta');
    if (isWindows) {
      this.log('   (or: npm run dev)', 'yellow');
    }
    this.log('');
    
    this.log('3. Access your application:', 'cyan');
    this.log(`   ${ngrokUrl}`, 'magenta');
    this.log('');
    
    this.log('📱 Mobile Access URLs:', 'yellow');
    this.log(`   Dashboard:   ${ngrokUrl}/dashboard`, 'cyan');
    this.log(`   Inventory:   ${ngrokUrl}/inventory`, 'cyan');
    this.log(`   SKU Mapping: ${ngrokUrl}/sku-mapping`, 'cyan');
    this.log(`   Pricing:     ${ngrokUrl}/pricing`, 'cyan');
    this.log('');
    
    this.log('💡 Tips:', 'yellow');
    this.log('   - Make sure both frontend and backend servers are running', 'cyan');
    this.log('   - The ngrok URL will change each time you restart ngrok', 'cyan');
    this.log('   - Run this script again when you get a new ngrok URL', 'cyan');
    
    if (platform() === 'linux') {
      this.log('');
      this.log('🐧 Ubuntu/Linux Users:', 'yellow');
      this.log('   - You may need to use sudo for ngrok installation', 'cyan');
      this.log('   - Check firewall settings if connection fails', 'cyan');
    }
  }

  async run() {
    const args = process.argv.slice(2);
    let ngrokUrl = args[0];
    
    // If no URL provided, prompt for it
    if (!ngrokUrl) {
      ngrokUrl = await this.promptForUrl();
    }
    
    // Validate URL
    if (!this.validateUrl(ngrokUrl)) {
      this.log('\n❌ Invalid ngrok URL', 'red');
      this.log('Please provide a valid ngrok URL (e.g., https://abc123.ngrok-free.app)', 'yellow');
      process.exit(1);
    }
    
    // Configure
    this.configure(ngrokUrl);
  }
}

// Check if running directly and run
const configurator = new NgrokConfigurator();
configurator.run().catch(error => {
  configurator.log(`\n❌ Error: ${error.message}`, 'red');
  process.exit(1);
});

export default NgrokConfigurator;