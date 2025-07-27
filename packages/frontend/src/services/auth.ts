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
    const response = await apiService.post<LoginResponse>('/auth/login', data);
    
    // 토큰 저장
    localStorage.setItem('token', response.token);
    localStorage.setItem('refreshToken', response.refreshToken);
    localStorage.setItem('user', JSON.stringify(response.user));
    
    return response;
  }

  async logout(): Promise<void> {
    try {
      await apiService.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // 로컬 스토리지 정리
      localStorage.removeItem('token');
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
    
    const response = await apiService.post<{ token: string; refreshToken: string }>('/auth/refresh', {
      refreshToken,
    });
    
    // 새 토큰 저장
    localStorage.setItem('token', response.token);
    if (response.refreshToken) {
      localStorage.setItem('refreshToken', response.refreshToken);
    }
    
    return response.token;
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
    return !!localStorage.getItem('token');
  }

  hasRole(role: string): boolean {
    const user = this.getCurrentUser();
    return user?.role === role;
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }
}

export default new AuthService();