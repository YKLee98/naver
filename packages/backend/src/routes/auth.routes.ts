// packages/backend/src/routes/auth.routes.ts
import { Router } from 'express';
import { AuthController } from '../controllers/AuthController.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { body } from 'express-validator';
import { logger } from '../utils/logger.js';

export function setupAuthRoutes(authController: AuthController): Router {
  const router = Router();

  // Validation rules
  const loginValidation = [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 6 })
      .trim()
      .withMessage('Password must be at least 6 characters'),
  ];

  const registerValidation = [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage(
        'Password must be at least 8 characters with uppercase, lowercase and number'
      ),
    body('name')
      .isLength({ min: 2 })
      .trim()
      .withMessage('Name must be at least 2 characters'),
    body('company').optional().trim(),
    body('role')
      .optional()
      .isIn(['admin', 'user', 'viewer'])
      .withMessage('Invalid role'),
  ];

  const forgotPasswordValidation = [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
  ];

  const resetPasswordValidation = [
    body('password')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage(
        'Password must be at least 8 characters with uppercase, lowercase and number'
      ),
  ];

  const changePasswordValidation = [
    body('oldPassword')
      .isLength({ min: 6 })
      .withMessage('Old password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage(
        'New password must be at least 8 characters with uppercase, lowercase and number'
      ),
  ];

  // Public routes
  router.post(
    '/login',
    loginValidation,
    validateRequest,
    authController.login.bind(authController)
  );

  router.post(
    '/register',
    registerValidation,
    validateRequest,
    authController.register.bind(authController)
  );

  router.post('/logout', authController.logout.bind(authController));

  router.post('/refresh', authController.refreshToken.bind(authController));

  router.post(
    '/forgot-password',
    forgotPasswordValidation,
    validateRequest,
    authController.forgotPassword.bind(authController)
  );

  router.post(
    '/reset-password/:token',
    resetPasswordValidation,
    validateRequest,
    authController.resetPassword.bind(authController)
  );

  router.get('/verify/:token', authController.verifyEmail.bind(authController));

  // Protected routes
  router.get(
    '/me',
    authenticate,
    authController.getCurrentUser.bind(authController)
  );

  router.put(
    '/me',
    authenticate,
    [
      body('name').optional().isLength({ min: 2 }).trim(),
      body('company').optional().trim(),
      body('phone').optional().isMobilePhone('any'),
      body('timezone').optional().trim(),
    ],
    validateRequest,
    authController.updateProfile.bind(authController)
  );

  router.post(
    '/change-password',
    authenticate,
    changePasswordValidation,
    validateRequest,
    authController.changePassword.bind(authController)
  );

  router.delete(
    '/me',
    authenticate,
    authController.deleteAccount.bind(authController)
  );

  // Session management
  router.get(
    '/sessions',
    authenticate,
    authController.getSessions.bind(authController)
  );

  router.delete(
    '/sessions/:sessionId',
    authenticate,
    authController.revokeSession.bind(authController)
  );

  router.delete(
    '/sessions',
    authenticate,
    authController.revokeAllSessions.bind(authController)
  );

  logger.info('✅ Auth routes initialized');
  return router;
}

export default setupAuthRoutes;
