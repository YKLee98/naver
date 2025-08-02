// packages/frontend/src/services/auth.ts
import apiService from './api';
import { User } from '@/types/models';

interface LoginData {
  email: string;
  password: string;
}

interface LoginResponse {
  token: string;
  refreshToken: string;
  user: User;
}

class AuthService {
  async login(data: LoginData): Promise<LoginResponse> {
    // 백엔드 응답 형식에 맞춰 수정
    const response = await apiService.post<{
      user: User;
      accessToken: string;
      refreshToken: string;
    }>('/auth/login', data);
    
    // 응답을 프론트엔드 형식으로 변환
    const loginResponse: LoginResponse = {
      token: response.accessToken,
      refreshToken: response.refreshToken,
      user: response.user
    };
    
    // 토큰 저장
    localStorage.setItem('token', loginResponse.token);
    localStorage.setItem('authToken', loginResponse.token); // App.tsx에서 authToken을 찾음
    localStorage.setItem('refreshToken', loginResponse.refreshToken);
    localStorage.setItem('user', JSON.stringify(loginResponse.user));
    
    return loginResponse;
  }

  async logout(): Promise<void> {
    try {
      await apiService.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // 로컬 스토리지 정리
      localStorage.removeItem('token');
      localStorage.removeItem('authToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      
      // 로그인 페이지로 리다이렉트
      window.location.href = '/login';
    }
  }

  async refreshToken(): Promise<string> {
    const refreshToken = localStorage.getItem('refreshToken');
    
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }
    
    const response = await apiService.post<{ 
      accessToken: string; 
      refreshToken: string 
    }>('/auth/refresh', {
      refreshToken,
    });
    
    // 새 토큰 저장
    localStorage.setItem('token', response.accessToken);
    localStorage.setItem('authToken', response.accessToken);
    if (response.refreshToken) {
      localStorage.setItem('refreshToken', response.refreshToken);
    }
    
    return response.accessToken;
  }

  async register(data: { email: string; password: string; name: string }): Promise<User> {
    const response = await apiService.post<User>('/auth/register', data);
    return response;
  }

  async verifyToken(): Promise<boolean> {
    try {
      await apiService.get('/auth/verify');
      return true;
    } catch {
      return false;
    }
  }

  async changePassword(data: { currentPassword: string; newPassword: string }): Promise<void> {
    await apiService.post('/auth/change-password', data);
  }

  async resetPassword(email: string): Promise<void> {
    await apiService.post('/auth/reset-password', { email });
  }

  async confirmResetPassword(data: { token: string; newPassword: string }): Promise<void> {
    await apiService.post('/auth/confirm-reset-password', data);
  }

  getCurrentUser(): User | null {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  isAuthenticated(): boolean {
    // token 또는 authToken 둘 중 하나라도 있으면 인증된 것으로 판단
    return !!(localStorage.getItem('token') || localStorage.getItem('authToken'));
  }

  hasRole(role: string): boolean {
    const user = this.getCurrentUser();
    return user?.role === role;
  }

  getToken(): string | null {
    // authToken을 먼저 확인하고, 없으면 token 확인
    return localStorage.getItem('authToken') || localStorage.getItem('token');
  }
}

export default new AuthService();