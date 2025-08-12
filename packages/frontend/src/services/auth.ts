// packages/frontend/src/services/auth.ts
import apiService from './api';
import { User } from '@/types';

class AuthService {
  /**
   * 로그인
   */
  async login(credentials: { email: string; password: string }): Promise<User> {
    try {
      console.log('[AuthService] Login attempt:', { email: credentials.email });
      
      const response = await apiService.post<{
        user: User;
        accessToken: string;
        refreshToken: string;
        expiresIn?: string;
      }>('/auth/login', credentials);

      console.log('[AuthService] Login response received:', {
        hasUser: !!response.user,
        hasAccessToken: !!response.accessToken,
        hasRefreshToken: !!response.refreshToken
      });

      const { user, accessToken, refreshToken } = response;

      // 토큰 저장 (호환성을 위해 두 가지 키 모두 저장)
      if (accessToken) {
        localStorage.setItem('authToken', accessToken);
        localStorage.setItem('token', accessToken);
        console.log('[AuthService] Access token saved');
      }

      if (refreshToken) {
        localStorage.setItem('refreshToken', refreshToken);
        console.log('[AuthService] Refresh token saved');
      }

      if (user) {
        localStorage.setItem('user', JSON.stringify(user));
        console.log('[AuthService] User data saved:', { 
          email: user.email, 
          role: user.role 
        });
      }

      return user;
    } catch (error) {
      console.error('[AuthService] Login failed:', error);
      
      // 에러 메시지 개선
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      } else if (error.response?.status === 401) {
        throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else if (error.response?.status === 403) {
        throw new Error('계정이 비활성화되었습니다.');
      } else if (error.response?.status === 500) {
        throw new Error('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error('서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.');
      } else {
        throw new Error('로그인 중 오류가 발생했습니다.');
      }
    }
  }

  /**
   * 로그아웃
   */
  logout(): void {
    console.log('[AuthService] Logging out...');
    
    // 모든 인증 관련 데이터 제거
    localStorage.removeItem('authToken');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    
    console.log('[AuthService] Local storage cleared');
    
    // 로그인 페이지로 리다이렉트
    window.location.href = '/login';
  }

  /**
   * 회원가입
   */
  async register(data: { email: string; password: string; name: string }): Promise<User> {
    try {
      const response = await apiService.post<User>('/auth/register', data);
      console.log('[AuthService] Registration successful:', { email: data.email });
      return response;
    } catch (error) {
      console.error('[AuthService] Registration failed:', error);
      
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      } else if (error.response?.status === 409) {
        throw new Error('이미 사용 중인 이메일입니다.');
      } else {
        throw new Error('회원가입 중 오류가 발생했습니다.');
      }
    }
  }

  /**
   * 토큰 검증
   */
  async verifyToken(): Promise<boolean> {
    try {
      const token = this.getToken();
      if (!token) {
        console.log('[AuthService] No token found');
        return false;
      }

      await apiService.get('/auth/verify');
      console.log('[AuthService] Token verified successfully');
      return true;
    } catch (error) {
      console.error('[AuthService] Token verification failed:', error);
      return false;
    }
  }

  /**
   * 비밀번호 변경
   */
  async changePassword(data: { currentPassword: string; newPassword: string }): Promise<void> {
    try {
      await apiService.post('/auth/change-password', data);
      console.log('[AuthService] Password changed successfully');
    } catch (error) {
      console.error('[AuthService] Password change failed:', error);
      
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      } else {
        throw new Error('비밀번호 변경 중 오류가 발생했습니다.');
      }
    }
  }

  /**
   * 비밀번호 재설정 요청
   */
  async resetPassword(email: string): Promise<void> {
    try {
      await apiService.post('/auth/reset-password', { email });
      console.log('[AuthService] Password reset requested for:', email);
    } catch (error) {
      console.error('[AuthService] Password reset request failed:', error);
      throw new Error('비밀번호 재설정 요청 중 오류가 발생했습니다.');
    }
  }

  /**
   * 비밀번호 재설정 확인
   */
  async confirmResetPassword(data: { token: string; newPassword: string }): Promise<void> {
    try {
      await apiService.post('/auth/confirm-reset-password', data);
      console.log('[AuthService] Password reset confirmed');
    } catch (error) {
      console.error('[AuthService] Password reset confirmation failed:', error);
      throw new Error('비밀번호 재설정 중 오류가 발생했습니다.');
    }
  }

  /**
   * 현재 사용자 정보 가져오기
   */
  getCurrentUser(): User | null {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      console.log('[AuthService] No user data in localStorage');
      return null;
    }
    
    try {
      const user = JSON.parse(userStr);
      console.log('[AuthService] Current user:', { 
        email: user.email, 
        role: user.role 
      });
      return user;
    } catch (error) {
      console.error('[AuthService] Failed to parse user data:', error);
      return null;
    }
  }

  /**
   * 인증 여부 확인
   */
  isAuthenticated(): boolean {
    const token = this.getToken();
    const isAuth = !!token;
    console.log('[AuthService] Authentication check:', { isAuthenticated: isAuth });
    return isAuth;
  }

  /**
   * 사용자 역할 확인
   */
  hasRole(role: string): boolean {
    const user = this.getCurrentUser();
    const hasRequiredRole = user?.role === role;
    console.log('[AuthService] Role check:', { 
      required: role, 
      current: user?.role, 
      hasRole: hasRequiredRole 
    });
    return hasRequiredRole;
  }

  /**
   * 토큰 가져오기
   */
  getToken(): string | null {
    // authToken을 먼저 확인하고, 없으면 token 확인
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    if (token) {
      console.log('[AuthService] Token found, length:', token.length);
    }
    return token;
  }

  /**
   * 토큰 갱신
   */
  async refreshToken(): Promise<string | null> {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        console.log('[AuthService] No refresh token found');
        return null;
      }

      const response = await apiService.post<{
        accessToken: string;
        refreshToken: string;
      }>('/auth/refresh', { refreshToken });

      const { accessToken, refreshToken: newRefreshToken } = response;

      // 새 토큰 저장
      if (accessToken) {
        localStorage.setItem('authToken', accessToken);
        localStorage.setItem('token', accessToken);
        console.log('[AuthService] Access token refreshed');
      }

      if (newRefreshToken) {
        localStorage.setItem('refreshToken', newRefreshToken);
        console.log('[AuthService] Refresh token updated');
      }

      return accessToken;
    } catch (error) {
      console.error('[AuthService] Token refresh failed:', error);
      // 토큰 갱신 실패 시 로그아웃
      this.logout();
      return null;
    }
  }

  /**
   * 현재 사용자 정보 갱신
   */
  async updateCurrentUser(): Promise<User | null> {
    try {
      // 개발 모드에서는 로컬 데이터 반환
      if (import.meta.env.DEV) {
        const localUser = this.getCurrentUser();
        if (localUser) {
          console.log('[AuthService] Development mode - using local user data');
          return localUser;
        }
        // 개발 모드 기본 사용자 반환
        const devUser = {
          id: '1',
          email: 'test@example.com',
          name: 'Test User',
          role: 'admin' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem('user', JSON.stringify(devUser));
        return devUser as User;
      }
      
      const response = await apiService.get<User>('/auth/me');
      
      if (response) {
        localStorage.setItem('user', JSON.stringify(response));
        console.log('[AuthService] User data updated:', { 
          email: response.email, 
          role: response.role 
        });
      }
      
      return response;
    } catch (error) {
      console.error('[AuthService] Failed to update user data:', error);
      return null;
    }
  }
}

export default new AuthService();