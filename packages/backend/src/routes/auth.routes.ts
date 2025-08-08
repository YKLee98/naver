// packages/backend/src/routes/auth.routes.ts
import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validation.middleware';
import { body } from 'express-validator';

const router = Router();
const authController = new AuthController();

// 로그인 (인증 불필요)
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('유효한 이메일을 입력하세요'),
    body('password').notEmpty().withMessage('비밀번호를 입력하세요'),
  ],
  validateRequest,
  authController.login.bind(authController)
);

// 회원가입 (인증 불필요)
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail().withMessage('유효한 이메일을 입력하세요'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('비밀번호는 최소 6자 이상이어야 합니다'),
    body('name').notEmpty().trim().withMessage('이름을 입력하세요'),
  ],
  validateRequest,
  authController.register.bind(authController)
);

// 토큰 갱신 (인증 불필요)
router.post(
  '/refresh',
  [body('refreshToken').notEmpty().withMessage('리프레시 토큰이 필요합니다')],
  validateRequest,
  authController.refresh.bind(authController)
);

// 로그아웃 (인증 필요)
router.post('/logout', authMiddleware, authController.logout.bind(authController));

// 토큰 검증 (인증 필요)
router.get('/verify', authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    user: (req as any).user
  });
});

// 현재 사용자 정보 (인증 필요)
router.get('/me', authMiddleware, authController.me.bind(authController));

// 비밀번호 변경 (인증 필요)
router.post(
  '/change-password',
  authMiddleware,
  [
    body('currentPassword').notEmpty().withMessage('현재 비밀번호를 입력하세요'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('새 비밀번호는 최소 6자 이상이어야 합니다'),
  ],
  validateRequest,
  authController.changePassword.bind(authController)
);

export default router;