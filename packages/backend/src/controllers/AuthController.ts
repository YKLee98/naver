// packages/backend/src/controllers/AuthController.ts
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { User } from '../models';
import { AppError } from '../utils/errors';

interface LoginRequest extends Request {
  body: {
    email: string;
    password: string;
  };
}

interface RegisterRequest extends Request {
  body: {
    email: string;
    password: string;
    name: string;
  };
}

export class AuthController {
  /**
   * 로그인
   */
  async login(req: LoginRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;

      // 디버그 로그 추가
      logger.info('Login attempt:', { 
        email, 
        hasPassword: !!password,
        passwordLength: password?.length,
        bodyKeys: Object.keys(req.body),
        headers: {
          contentType: req.headers['content-type'],
          origin: req.headers.origin,
          userAgent: req.headers['user-agent']
        }
      });

      // 사용자 찾기
      const user = await User.findOne({ email }).select('+password');
      
      logger.info('User lookup result:', { 
        found: !!user, 
        email,
        userEmail: user?.email,
        userRole: user?.role,
        userStatus: user?.status,
        hasPasswordHash: !!user?.password,
        passwordHashLength: user?.password?.length,
        passwordHashPrefix: user?.password?.substring(0, 10) // 해시 일부만 로그
      });
      
      if (!user) {
        logger.warn('User not found:', { email });
        throw new AppError('이메일 또는 비밀번호가 올바르지 않습니다.', 401);
      }

      // 비밀번호 확인
      logger.info('Comparing passwords...', {
        inputPasswordLength: password?.length,
        storedHashLength: user.password?.length
      });
      
      const isPasswordValid = await bcrypt.compare(password, user.password);
      
      logger.info('Password validation result:', { 
        isPasswordValid,
        email: user.email
      });
      
      if (!isPasswordValid) {
        logger.warn('Invalid password for user:', { email });
        throw new AppError('이메일 또는 비밀번호가 올바르지 않습니다.', 401);
      }

      // 계정 활성화 확인
      if (user.status !== 'active') {
        logger.warn('Inactive account login attempt:', { email, status: user.status });
        throw new AppError('계정이 비활성화되었습니다.', 403);
      }

      // 토큰 생성
      logger.info('Generating tokens for user:', { email });
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // 리프레시 토큰 저장
      user.refreshToken = refreshToken;
      user.lastLogin = new Date();
      await user.save();

      // 비밀번호 제거
      const userResponse = user.toObject();
      delete userResponse.password;
      delete userResponse.refreshToken;

      logger.info(`User logged in successfully: ${email}`);

      res.json({
        success: true,
        data: {
          user: userResponse,
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      logger.error('Login error:', { 
        message: error.message,
        stack: error.stack,
        name: error.name,
        email: req.body?.email 
      });
      next(error);
    }
  }

  /**
   * 로그아웃
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;

      if (userId) {
        // 리프레시 토큰 제거
        await User.findByIdAndUpdate(userId, { refreshToken: null });
        logger.info(`User logged out: ${userId}`);
      }

      res.json({
        success: true,
        message: '로그아웃되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 회원가입
   */
  async register(req: RegisterRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, name } = req.body;

      logger.info('Registration attempt:', { email, name });

      // 이메일 중복 확인
      const existingUser = await User.findOne({ email });
      
      if (existingUser) {
        logger.warn('Registration failed - email already exists:', { email });
        throw new AppError('이미 사용 중인 이메일입니다.', 409);
      }

      // 비밀번호 해시
      const hashedPassword = await bcrypt.hash(password, 10);

      // 사용자 생성
      const user = await User.create({
        email,
        password: hashedPassword,
        name,
        role: 'user',
        status: 'active',
      });

      // 비밀번호 제거
      const userResponse = user.toObject();
      delete userResponse.password;

      logger.info(`New user registered: ${email}`);

      res.status(201).json({
        success: true,
        data: userResponse,
      });
    } catch (error) {
      logger.error('Registration error:', { 
        message: error.message,
        email: req.body?.email 
      });
      next(error);
    }
  }

  /**
   * 토큰 갱신
   */
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        throw new AppError('리프레시 토큰이 필요합니다.', 400);
      }

      // 토큰 검증
      const decoded = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET!
      ) as any;

      // 사용자 찾기
      const user = await User.findById(decoded.id);
      
      if (!user || user.refreshToken !== refreshToken) {
        throw new AppError('유효하지 않은 리프레시 토큰입니다.', 401);
      }

      // 새 토큰 생성
      const newAccessToken = this.generateAccessToken(user);
      const newRefreshToken = this.generateRefreshToken(user);

      // 리프레시 토큰 업데이트
      user.refreshToken = newRefreshToken;
      await user.save();

      res.json({
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
      });
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        next(new AppError('리프레시 토큰이 만료되었습니다.', 401));
      } else {
        next(error);
      }
    }
  }

  /**
   * 토큰 검증
   */
  async verify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = (req as any).user;

      if (!user) {
        throw new AppError('인증되지 않았습니다.', 401);
      }

      res.json({
        success: true,
        data: { valid: true },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 현재 사용자 정보 조회
   */
  async getCurrentUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        throw new AppError('인증되지 않았습니다.', 401);
      }

      const user = await User.findById(userId).select('-password -refreshToken');

      if (!user) {
        throw new AppError('사용자를 찾을 수 없습니다.', 404);
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 비밀번호 변경
   */
  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const { currentPassword, newPassword } = req.body;

      const user = await User.findById(userId).select('+password');
      
      if (!user) {
        throw new AppError('사용자를 찾을 수 없습니다.', 404);
      }

      // 현재 비밀번호 확인
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      
      if (!isPasswordValid) {
        throw new AppError('현재 비밀번호가 올바르지 않습니다.', 401);
      }

      // 새 비밀번호 해시
      user.password = await bcrypt.hash(newPassword, 10);
      await user.save();

      logger.info(`Password changed for user: ${user.email}`);

      res.json({
        success: true,
        message: '비밀번호가 변경되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 액세스 토큰 생성
   */
  private generateAccessToken(user: any): string {
    logger.debug('Generating access token:', { 
      userId: user._id,
      email: user.email,
      jwtSecretExists: !!process.env.JWT_SECRET,
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h'
    });

    return jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET!,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '1h',
      }
    );
  }

  /**
   * 리프레시 토큰 생성
   */
  private generateRefreshToken(user: any): string {
    logger.debug('Generating refresh token:', { 
      userId: user._id,
      refreshSecretExists: !!process.env.JWT_REFRESH_SECRET,
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
    });

    return jwt.sign(
      {
        id: user._id,
      },
      process.env.JWT_REFRESH_SECRET!,
      {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      }
    );
  }
}