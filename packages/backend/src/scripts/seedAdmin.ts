// packages/backend/src/scripts/seedAdmin.ts
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { User } from '../models/User';
import { config } from '../config';
import { logger } from '../utils/logger';

async function seedAdmin() {
  try {
    // MongoDB 연결
    await mongoose.connect(config.mongodb.uri);
    logger.info('Connected to MongoDB');

    // 기존 관리자 확인
    const existingAdmin = await User.findOne({ email: 'admin@example.com' });
    
    if (existingAdmin) {
      logger.info('Admin user already exists');
      process.exit(0);
    }

    // 관리자 계정 생성
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    const adminUser = await User.create({
      email: 'admin@example.com',
      password: hashedPassword,
      name: 'System Administrator',
      role: 'admin',
      status: 'active',
    });

    logger.info('Admin user created successfully:', {
      email: adminUser.email,
      name: adminUser.name,
      role: adminUser.role,
    });

    logger.info('Login credentials:');
    logger.info('Email: admin@example.com');
    logger.info('Password: password123');
    logger.info('⚠️  Please change the password after first login!');

    process.exit(0);
  } catch (error) {
    logger.error('Error seeding admin user:', error);
    process.exit(1);
  }
}

// 실행
seedAdmin();