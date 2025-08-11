// packages/backend/src/scripts/createTestAccounts.ts
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

// 환경 변수 로드 (여러 경로 시도)
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

// User 모델 정의 (스크립트용 간소화 버전)
const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['admin', 'user'],
      default: 'user',
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
    },
    refreshToken: {
      type: String,
      select: false,
    },
    lastLogin: Date,
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model('User', UserSchema);

async function createTestAccounts() {
  try {
    // MongoDB 연결
    const mongoUri =
      process.env.MONGODB_URI || 'mongodb://localhost:27017/hallyu-pomaholic';
    console.log('========================================');
    console.log('🔌 Connecting to MongoDB...');
    console.log('URI:', mongoUri);
    console.log('========================================\n');

    await mongoose.connect(mongoUri);
    console.log('✅ Successfully connected to MongoDB\n');

    // 테스트 계정 데이터
    const accounts = [
      {
        email: 'admin@example.com',
        password: 'password123',
        name: 'Test Admin',
        role: 'admin',
        status: 'active',
      },
      {
        email: 'user@example.com',
        password: 'password123',
        name: 'Test User',
        role: 'user',
        status: 'active',
      },
      {
        email: 'admin@hallyu.com',
        password: 'admin123456',
        name: '관리자',
        role: 'admin',
        status: 'active',
      },
      {
        email: 'user@hallyu.com',
        password: 'user123456',
        name: '일반 사용자',
        role: 'user',
        status: 'active',
      },
    ];

    console.log('📝 Creating/Updating test accounts...\n');

    for (const account of accounts) {
      try {
        // 기존 계정 확인
        const existing = await User.findOne({ email: account.email });

        if (existing) {
          // 비밀번호 업데이트
          const hashedPassword = await bcrypt.hash(account.password, 10);

          await User.updateOne(
            { email: account.email },
            {
              $set: {
                password: hashedPassword,
                name: account.name,
                role: account.role,
                status: 'active',
              },
            }
          );

          console.log(
            `  ✅ Updated account: ${account.email} (${account.role})`
          );
        } else {
          // 새 계정 생성
          const hashedPassword = await bcrypt.hash(account.password, 10);

          const newUser = new User({
            email: account.email,
            password: hashedPassword,
            name: account.name,
            role: account.role,
            status: account.status,
          });

          await newUser.save();
          console.log(
            `  ✅ Created account: ${account.email} (${account.role})`
          );
        }
      } catch (err) {
        console.error(`  ❌ Error with account ${account.email}:`, err.message);
      }
    }

    // 생성된 계정 확인
    console.log('\n📊 Verifying accounts in database...\n');
    const allUsers = await User.find({}, 'email name role status').sort({
      email: 1,
    });

    if (allUsers.length > 0) {
      console.log('  Found users:');
      allUsers.forEach((user) => {
        console.log(
          `    - ${user.email} | ${user.name} | ${user.role} | ${user.status}`
        );
      });
    } else {
      console.log('  ⚠️  No users found in database');
    }

    console.log('\n========================================');
    console.log('🎉 TEST ACCOUNT CREDENTIALS');
    console.log('========================================\n');
    console.log('Admin Account 1:');
    console.log('  📧 Email: admin@example.com');
    console.log('  🔑 Password: password123');
    console.log('  👤 Role: admin\n');

    console.log('Admin Account 2:');
    console.log('  📧 Email: admin@hallyu.com');
    console.log('  🔑 Password: admin123456');
    console.log('  👤 Role: admin\n');

    console.log('User Account 1:');
    console.log('  📧 Email: user@example.com');
    console.log('  🔑 Password: password123');
    console.log('  👤 Role: user\n');

    console.log('User Account 2:');
    console.log('  📧 Email: user@hallyu.com');
    console.log('  🔑 Password: user123456');
    console.log('  👤 Role: user');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n❌ Fatal Error:', error);
    console.error('\n💡 Troubleshooting tips:');
    console.error('  1. Make sure MongoDB is running');
    console.error('  2. Check MONGODB_URI in .env file');
    console.error('  3. Verify network connectivity to MongoDB');
  } finally {
    await mongoose.disconnect();
    console.log('✅ Database connection closed\n');
    process.exit(0);
  }
}

// 스크립트 실행
console.log('\n🚀 Starting Test Account Creation Script...\n');
createTestAccounts();
