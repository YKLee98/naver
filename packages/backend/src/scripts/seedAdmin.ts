// packages/backend/src/scripts/seedAdmin.ts
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { User } from '../models';
import { logger } from '../utils/logger';

// 환경 변수 로드
dotenv.config();

async function createAdminUser() {
  try {
    // MongoDB 연결
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hallyu-pomaholic';
    await mongoose.connect(mongoUri);
    
    logger.info('Connected to MongoDB');

    // 관리자 계정 정보
    const adminData = {
      email: 'admin@hallyu.com',
      password: 'admin123456', // 실제 운영 환경에서는 더 강력한 비밀번호 사용
      name: '관리자',
      role: 'admin',
      status: 'active',
    };

    // 기존 관리자 계정 확인
    const existingAdmin = await User.findOne({ email: adminData.email });
    
    if (existingAdmin) {
      logger.info('Admin user already exists');
      
      // 비밀번호 업데이트
      const hashedPassword = await bcrypt.hash(adminData.password, 10);
      existingAdmin.password = hashedPassword;
      await existingAdmin.save();
      
      logger.info('Admin password updated');
    } else {
      // 새 관리자 계정 생성
      const hashedPassword = await bcrypt.hash(adminData.password, 10);
      
      const adminUser = await User.create({
        ...adminData,
        password: hashedPassword,
      });
      
      logger.info('Admin user created successfully');
      logger.info(`Email: ${adminData.email}`);
      logger.info(`Password: ${adminData.password}`);
    }

    // 일반 사용자 계정도 생성
    const userData = {
      email: 'user@hallyu.com',
      password: 'user123456',
      name: '일반 사용자',
      role: 'user',
      status: 'active',
    };

    const existingUser = await User.findOne({ email: userData.email });
    
    if (!existingUser) {
      const hashedUserPassword = await bcrypt.hash(userData.password, 10);
      
      await User.create({
        ...userData,
        password: hashedUserPassword,
      });
      
      logger.info('Regular user created successfully');
      logger.info(`Email: ${userData.email}`);
      logger.info(`Password: ${userData.password}`);
    }

    logger.info('\n=== 생성된 계정 정보 ===');
    logger.info('관리자 계정:');
    logger.info('- 이메일: admin@hallyu.com');
    logger.info('- 비밀번호: admin123456');
    logger.info('\n일반 사용자 계정:');
    logger.info('- 이메일: user@hallyu.com');
    logger.info('- 비밀번호: user123456');

  } catch (error) {
    logger.error('Error creating admin user:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

// 스크립트 실행
createAdminUser();