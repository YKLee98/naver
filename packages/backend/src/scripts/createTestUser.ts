// packages/backend/src/scripts/createTestUser.ts
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

async function createTestUsers() {
  try {
    // MongoDB 연결
    await mongoose.connect(config.mongodb.uri);
    logger.info('MongoDB connected');

    // 관리자 계정 생성
    const adminPassword = await bcrypt.hash('admin123!', 10);
    const adminUser = await User.findOneAndUpdate(
      { email: 'admin@test.com' },
      {
        username: 'admin',
        email: 'admin@test.com',
        password: adminPassword,
        role: 'admin',
        isActive: true,
        isEmailVerified: true,
        firstName: 'Admin',
        lastName: 'User',
      },
      { upsert: true, new: true }
    );
    logger.info('Admin user created:', {
      email: adminUser.email,
      password: 'admin123!'
    });

    // 일반 테스트 계정 생성
    const testPassword = await bcrypt.hash('test123!', 10);
    const testUser = await User.findOneAndUpdate(
      { email: 'test@test.com' },
      {
        username: 'testuser',
        email: 'test@test.com',
        password: testPassword,
        role: 'user',
        isActive: true,
        isEmailVerified: true,
        firstName: 'Test',
        lastName: 'User',
      },
      { upsert: true, new: true }
    );
    logger.info('Test user created:', {
      email: testUser.email,
      password: 'test123!'
    });

    // 매니저 계정 생성
    const managerPassword = await bcrypt.hash('manager123!', 10);
    const managerUser = await User.findOneAndUpdate(
      { email: 'manager@test.com' },
      {
        username: 'manager',
        email: 'manager@test.com',
        password: managerPassword,
        role: 'manager',
        isActive: true,
        isEmailVerified: true,
        firstName: 'Manager',
        lastName: 'User',
      },
      { upsert: true, new: true }
    );
    logger.info('Manager user created:', {
      email: managerUser.email,
      password: 'manager123!'
    });

    console.log('\n========================================');
    console.log('테스트 계정이 생성되었습니다:');
    console.log('========================================');
    console.log('\n관리자 계정:');
    console.log('  Email: admin@test.com');
    console.log('  Password: admin123!');
    console.log('\n매니저 계정:');
    console.log('  Email: manager@test.com');
    console.log('  Password: manager123!');
    console.log('\n일반 사용자 계정:');
    console.log('  Email: test@test.com');
    console.log('  Password: test123!');
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    logger.error('Error creating test users:', error);
    process.exit(1);
  }
}

createTestUsers();