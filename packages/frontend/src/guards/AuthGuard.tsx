// packages/frontend/src/guards/AuthGuard.tsx
import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAppSelector } from '@/hooks';

interface AuthGuardProps {
  children?: React.ReactNode;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const location = useLocation();
  const { isAuthenticated, loading } = useAppSelector((state) => state.auth);

  // 초기 로딩 중일 때
  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // 인증되지 않았을 때
  if (!isAuthenticated) {
    // 로그인 페이지로 리다이렉트하면서 원래 가려던 경로 저장
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 인증되었을 때
  return children ? <>{children}</> : <Outlet />;
};

export default AuthGuard;