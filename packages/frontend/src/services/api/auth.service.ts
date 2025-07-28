// packages/frontend/src/services/api/auth.service.ts
import apiClient from './config';
import { User } from '@/types/models';

export const authApi = {
  // 로그인
  login: async (credentials: {
    email: string;
    password: string;
  }) => {
    const response = await apiClient.post<{
      user: User;
      accessToken: string;
      refreshToken: string;
    }>('/auth/login', credentials);
    return response.data;
  },

  // 로그아웃
  logout: async () => {
    const response = await apiClient.post('/auth/logout');
    return response.data;
  },

  // 토큰 갱신
  refreshToken: async (refreshToken: string) => {
    const response = await apiClient.post<{
      accessToken: string;
      refreshToken: string;
    }>('/auth/refresh', { refreshToken });
    return response.data;
  },

  // 현재 사용자 정보 조회
  getCurrentUser: async () => {
    const response = await apiClient.get<User>('/auth/me');
    return response.data;
  },

  // 사용자 정보 업데이트
  updateProfile: async (data: {
    name?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
  }) => {
    const response = await apiClient.put<User>('/auth/profile', data);
    return response.data;
  },

  // 비밀번호 재설정 요청
  requestPasswordReset: async (email: string) => {
    const response = await apiClient.post('/auth/password/reset-request', { email });
    return response.data;
  },

  // 비밀번호 재설정
  resetPassword: async (data: {
    token: string;
    newPassword: string;
  }) => {
    const response = await apiClient.post('/auth/password/reset', data);
    return response.data;
  },

  // 이메일 인증
  verifyEmail: async (token: string) => {
    const response = await apiClient.post('/auth/verify-email', { token });
    return response.data;
  },

  // 2FA 활성화
  enable2FA: async () => {
    const response = await apiClient.post<{
      secret: string;
      qrCode: string;
    }>('/auth/2fa/enable');
    return response.data;
  },

  // 2FA 확인
  verify2FA: async (code: string) => {
    const response = await apiClient.post('/auth/2fa/verify', { code });
    return response.data;
  },

  // 2FA 비활성화
  disable2FA: async (code: string) => {
    const response = await apiClient.post('/auth/2fa/disable', { code });
    return response.data;
  },
};