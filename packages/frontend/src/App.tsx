// packages/frontend/src/App.tsx
import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Box } from '@mui/material';
import { useAppDispatch, useAppSelector } from './hooks';
import { getCurrentUser } from './store/slices/authSlice';
import AuthGuard from './guards/AuthGuard';
import Layout from './components/common/Layout';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard/index';
import Products from './pages/Products/index';
import Inventory from './pages/Inventory/index';
import Pricing from './pages/Pricing/index';
import Reports from './pages/Reports/index';
import Settings from './pages/Settings';

function App() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { isAuthenticated } = useAppSelector((state) => state.auth);

  useEffect(() => {
    // 앱 시작 시 토큰 확인
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    if (token) {
      // 토큰이 있으면 사용자 정보 조회
      dispatch(getCurrentUser())
        .unwrap()
        .catch(() => {
          // 토큰이 유효하지 않으면 로그인 페이지로
          localStorage.removeItem('authToken');
          localStorage.removeItem('token');
          navigate('/login');
        });
    }
  }, [dispatch, navigate]);

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={
        isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />
      } />

      {/* Protected Routes */}
      <Route element={
        <AuthGuard>
          <Layout />
        </AuthGuard>
      }>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;