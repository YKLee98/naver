// packages/frontend/src/App.tsx
import React, { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useAppDispatch, useAppSelector } from './hooks';
import { getCurrentUser } from './store/slices/authSlice';
import AuthGuard from './guards/AuthGuard';
import Layout from './components/common/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import { performanceMonitor } from './utils/performance';

// Lazy load pages for better performance
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Products = lazy(() => import('./pages/Products'));
const Inventory = lazy(() => import('./pages/Inventory'));
const SkuMapping = lazy(() => import('./pages/SkuMapping'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));

// Loading component
const LoadingFallback = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
    <CircularProgress />
  </Box>
);

// MUI 테마 설정
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
    background: {
      default: '#f5f5f5',
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
  },
});

function App() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { isAuthenticated } = useAppSelector((state) => state.auth);

  useEffect(() => {
    // Report performance metrics after page load
    const reportMetrics = () => {
      setTimeout(() => {
        performanceMonitor.reportMetrics();
      }, 3000);
    };
    
    if (document.readyState === 'complete') {
      reportMetrics();
    } else {
      window.addEventListener('load', reportMetrics);
    }

    return () => {
      window.removeEventListener('load', reportMetrics);
    };
  }, []);

  useEffect(() => {
    // 개발 모드에서 자동 로그인
    if (process.env.NODE_ENV === 'development') {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      if (!token) {
        // 개발 모드에서 토큰이 없으면 자동으로 테스트 토큰 설정
        localStorage.setItem('authToken', 'dev-token-' + Date.now());
        localStorage.setItem('token', 'dev-token-' + Date.now());
        localStorage.setItem('user', JSON.stringify({
          id: '1',
          email: 'test@example.com',
          name: 'Test User',
          role: 'admin'
        }));
      }
    }
    
    // 앱 시작 시 토큰 확인
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    if (token) {
      // 토큰이 있으면 사용자 정보 조회
      dispatch(getCurrentUser())
        .unwrap()
        .catch(() => {
          // 토큰이 유효하지 않으면 로그인 페이지로
          if (process.env.NODE_ENV !== 'development') {
            localStorage.removeItem('authToken');
            localStorage.removeItem('token');
            navigate('/login');
          }
        });
    }
  }, [dispatch, navigate]);

  return (
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
          <Suspense fallback={<LoadingFallback />}>
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
            <Route path="/sku-mapping" element={<SkuMapping />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </Box>
      
      {/* Toast 알림 컨테이너 */}
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
        style={{
          fontSize: '14px',
          fontFamily: theme.typography.fontFamily,
        }}
      />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;