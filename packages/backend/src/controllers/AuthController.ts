// packages/backend/src/controllers/AuthController.ts
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import { User } from '../models/index.js';
import { AppError } from '../utils/errors.js';

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
   * JWT 액세스 토큰 생성
   */
  private generateAccessToken(user: any): string {
    const payload = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
    };

    const secret =
      process.env['JWT_SECRET'] || 'default-jwt-secret-change-in-production';
    const expiresIn = process.env['JWT_EXPIRES_IN'] || '7d';

    return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
  }

  /**
   * JWT 리프레시 토큰 생성
   */
  private generateRefreshToken(user: any): string {
    const payload = {
      id: user._id.toString(),
      type: 'refresh',
    };

    const secret =
      process.env['JWT_SECRET'] || 'default-jwt-secret-change-in-production';
    const expiresIn = process.env['JWT_REFRESH_EXPIRES_IN'] || '30d';

    return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
  }

  /**
   * 로그인
   */
  async login(
    req: LoginRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { email, password } = req.body;

      // 입력값 검증
      if (!email || !password) {
        throw new AppError('이메일과 비밀번호를 입력해주세요.', 400);
      }

      // 디버그 로그
      logger.info('Login attempt:', {
        email,
        hasPassword: !!password,
        passwordLength: password?.length,
        timestamp: new Date().toISOString(),
      });

      // 사용자 찾기 (password 필드 포함)
      const user = await User.findOne({ email: email.toLowerCase() }).select(
        '+password'
      );

      if (!user) {
        logger.warn('Login failed - user not found:', { email });
        throw new AppError('이메일 또는 비밀번호가 올바르지 않습니다.', 401);
      }

      logger.info('User found:', {
        email: user.email,
        role: user.role,
        status: user.status,
        hasPassword: !!user.password,
      });

      // 비밀번호 확인
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        logger.warn('Login failed - invalid password:', { email });
        throw new AppError('이메일 또는 비밀번호가 올바르지 않습니다.', 401);
      }

      // 계정 상태 확인
      if (user.status !== 'active') {
        logger.warn('Login failed - inactive account:', {
          email,
          status: user.status,
        });
        throw new AppError('계정이 비활성화되었습니다.', 403);
      }

      // 토큰 생성
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // 리프레시 토큰 저장 및 마지막 로그인 시간 업데이트
      user.refreshToken = refreshToken;
      user.lastLogin = new Date();
      await user.save();

      // 응답 데이터 준비 (민감한 정보 제거)
      const userResponse = user.toObject() as any;
      delete userResponse.password;
      delete userResponse.refreshToken;
      delete userResponse.__v;

      logger.info('Login successful:', {
        email: user.email,
        role: user.role,
      });

      // 응답
      res.json({
        success: true,
        data: {
          user: userResponse,
          accessToken,
          refreshToken,
          expiresIn: process.env['JWT_EXPIRES_IN'] || '7d',
        },
        message: '로그인에 성공했습니다.',
      });
    } catch (error: any) {
      logger.error('Login error:', {
        message: error.message,
        stack: error.stack,
        email: req.body?.email,
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
        await User.findByIdAndUpdate(userId, {
          $unset: { refreshToken: 1 },
        });

        logger.info('User logged out:', { userId });
      }

      res.json({
        success: true,
        message: '로그아웃되었습니다.',
      });
    } catch (error) {
      logger.error('Logout error:', error);
      next(error);
    }
  }

  /**
   * 회원가입
   */
  async register(
    req: RegisterRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { email, password, name } = req.body;

      // 입력값 검증
      if (!email || !password || !name) {
        throw new AppError('필수 정보를 모두 입력해주세요.', 400);
      }

      // 이메일 형식 검증
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new AppError('올바른 이메일 형식이 아닙니다.', 400);
      }

      // 비밀번호 강도 검증 (최소 6자)
      if (password.length < 6) {
        throw new AppError('비밀번호는 최소 6자 이상이어야 합니다.', 400);
      }

      logger.info('Registration attempt:', { email, name });

      // 이메일 중복 확인
      const existingUser = await User.findOne({ email: email.toLowerCase() });

      if (existingUser) {
        logger.warn('Registration failed - email already exists:', { email });
        throw new AppError('이미 사용 중인 이메일입니다.', 409);
      }

      // 비밀번호 해시
      const hashedPassword = await bcrypt.hash(password, 10);

      // 사용자 생성
      const user = await User.create({
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        role: 'user',
        status: 'active',
      });

      // 응답 데이터 준비 (민감한 정보 제거)
      const userResponse = user.toObject() as any;
      delete userResponse.password;
      delete userResponse.__v;

      logger.info('User registered successfully:', {
        email: user.email,
        name: user.name,
      });

      res.status(201).json({
        success: true,
        data: userResponse,
        message: '회원가입이 완료되었습니다.',
      });
    } catch (error: any) {
      logger.error('Registration error:', {
        message: error.message,
        email: req.body?.email,
      });
      next(error);
    }
  }

  /**
   * 토큰 갱신
   */
  async refresh(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        throw new AppError('리프레시 토큰이 필요합니다.', 400);
      }

      // 토큰 검증
      const secret =
        process.env['JWT_SECRET'] || 'default-jwt-secret-change-in-production';
      let decoded: any;

      try {
        decoded = jwt.verify(refreshToken, secret);
      } catch (err) {
        throw new AppError('유효하지 않은 리프레시 토큰입니다.', 401);
      }

      // 사용자 확인
      const user = await User.findById(decoded.id).select('+refreshToken');

      if (!user || user.refreshToken !== refreshToken) {
        throw new AppError('유효하지 않은 리프레시 토큰입니다.', 401);
      }

      // 계정 상태 확인
      if (user.status !== 'active') {
        throw new AppError('계정이 비활성화되었습니다.', 403);
      }

      // 새 토큰 생성
      const newAccessToken = this.generateAccessToken(user);
      const newRefreshToken = this.generateRefreshToken(user);

      // 새 리프레시 토큰 저장
      user.refreshToken = newRefreshToken;
      await user.save();

      logger.info('Token refreshed for user:', {
        userId: user._id,
        email: user.email,
      });

      res.json({
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresIn: process.env['JWT_EXPIRES_IN'] || '7d',
        },
        message: '토큰이 갱신되었습니다.',
      });
    } catch (error) {
      logger.error('Token refresh error:', error);
      next(error);
    }
  }

  /**
   * 현재 사용자 정보 조회
   */
  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        throw new AppError('인증이 필요합니다.', 401);
      }

      const user = await User.findById(userId).select(
        '-password -refreshToken -__v'
      );

      if (!user) {
        throw new AppError('사용자를 찾을 수 없습니다.', 404);
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      logger.error('Get current user error:', error);
      next(error);
    }
  }

  /**
   * 비밀번호 변경
   */
  async changePassword(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        throw new AppError('현재 비밀번호와 새 비밀번호를 입력해주세요.', 400);
      }

      if (newPassword.length < 6) {
        throw new AppError('새 비밀번호는 최소 6자 이상이어야 합니다.', 400);
      }

      const user = await User.findById(userId).select('+password');

      if (!user) {
        throw new AppError('사용자를 찾을 수 없습니다.', 404);
      }

      // 현재 비밀번호 확인
      const isPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password
      );

      if (!isPasswordValid) {
        throw new AppError('현재 비밀번호가 올바르지 않습니다.', 401);
      }

      // 새 비밀번호 해시 및 저장
      user.password = await bcrypt.hash(newPassword, 10);
      await user.save();

      logger.info('Password changed for user:', {
        userId: user._id,
        email: user.email,
      });

      res.json({
        success: true,
        message: '비밀번호가 변경되었습니다.',
      });
    } catch (error) {
      logger.error('Change password error:', error);
      next(error);
    }
  }

  // Method aliases for api.routes.ts compatibility
  refreshToken = this.refresh;
  getProfile = this.me;
  updateProfile = this.updateProfileMethod.bind(this);
  forgotPassword = this.forgotPasswordMethod.bind(this);
  resetPassword = this.resetPasswordMethod.bind(this);

  /**
   * Update profile
   */
  async updateProfileMethod(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const updates = req.body;

      // Remove sensitive fields
      delete updates.password;
      delete updates.role;
      delete updates.email;

      const user = await User.findByIdAndUpdate(
        userId,
        updates,
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        throw new AppError('User not found', 404);
      }

      res.json({
        success: true,
        data: user,
        message: 'Profile updated successfully',
      });
    } catch (error) {
      logger.error('Update profile error:', error);
      next(error);
    }
  }

  /**
   * Forgot password
   */
  async forgotPasswordMethod(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;

      if (!email) {
        throw new AppError('Email is required', 400);
      }

      const user = await User.findOne({ email: email.toLowerCase() });

      if (!user) {
        // Don't reveal if user exists or not
        res.json({
          success: true,
          message: '비밀번호 재설정 이메일이 전송되었습니다.',
        });
        return;
      }

      // In production, you would:
      // 1. Generate a reset token
      // 2. Save it to the user with expiration
      // 3. Send email with reset link

      // Mock implementation
      const resetToken = jwt.sign(
        { id: user._id, type: 'password-reset' },
        process.env['JWT_SECRET'] || 'secret',
        { expiresIn: '1h' }
      );

      logger.info('Password reset requested:', {
        email: user.email,
        token: resetToken, // In production, don't log this
      });

      res.json({
        success: true,
        message: '비밀번호 재설정 이메일이 전송되었습니다.',
        // In development only:
        resetToken,
      });
    } catch (error) {
      logger.error('Forgot password error:', error);
      next(error);
    }
  }

  /**
   * Reset password
   */
  async resetPasswordMethod(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        throw new AppError('Token and new password are required', 400);
      }

      // Verify token
      const decoded = jwt.verify(
        token,
        process.env['JWT_SECRET'] || 'secret'
      ) as any;

      if (decoded.type !== 'password-reset') {
        throw new AppError('Invalid reset token', 400);
      }

      // Update password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const user = await User.findByIdAndUpdate(
        decoded.id,
        { password: hashedPassword },
        { new: true }
      );

      if (!user) {
        throw new AppError('User not found', 404);
      }

      logger.info('Password reset completed:', {
        userId: user._id,
        email: user.email,
      });

      res.json({
        success: true,
        message: '비밀번호가 재설정되었습니다.',
      });
    } catch (error) {
      logger.error('Reset password error:', error);
      next(error);
    }
  }
}
