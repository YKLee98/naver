import apiService from './api';
import { User } from '@/types';

interface LoginCredentials {
  email: string;
  password: string;
}

interface LoginResponse {
  token: string;
  user: User;
}

class AuthService {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await apiService.post<LoginResponse>('/auth/login', credentials);
    
    // 토큰 저장
    localStorage.setItem('token', response.token);
    localStorage.setItem('user', JSON.stringify(response.user));
    
    return response;
  }

  async logout(): Promise<void> {
    try {
      await apiService.post('/auth/logout');
    } finally {
      // 로컬 스토리지 정리
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // 로그인 페이지로 리다이렉트
      window.location.href = '/login';
    }
  }

  async refreshToken(): Promise<string> {
    const response = await apiService.post<{ token: string }>('/auth/refresh');
    
    // 새 토큰 저장
    localStorage.setItem('token', response.token);
    
    return response.token;
  }

  async verifyToken(): Promise<boolean> {
    try {
      await apiService.get('/auth/verify');
      return true;
    } catch {
      return false;
    }
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
}

export default new AuthService();

