// packages/frontend/src/App.optimized.tsx
import React, { lazy, Suspense, useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ThemeProvider, CssBaseline, CircularProgress, Box } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { store } from '@store/index';
import { theme } from '@styles/theme';
import { ErrorBoundary } from '@components/common/ErrorBoundary';
import { PrivateRoute } from '@components/auth/PrivateRoute';
import { MainLayout } from '@layouts/MainLayout';
import { websocketService } from '@services/websocket/WebSocketService';
import { PerformanceMonitor } from '@components/monitoring/PerformanceMonitor';

// Lazy load pages for better performance
const Dashboard = lazy(() => import('@pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Products = lazy(() => import('@pages/Products').then(m => ({ default: m.Products })));
const Inventory = lazy(() => import('@pages/Inventory').then(m => ({ default: m.Inventory })));
const PriceSync = lazy(() => import('@pages/PriceSync').then(m => ({ default: m.PriceSync })));
const ProductMapping = lazy(() => import('@pages/ProductMapping').then(m => ({ default: m.ProductMapping })));
const Settings = lazy(() => import('@pages/Settings').then(m => ({ default: m.Settings })));
const Analytics = lazy(() => import('@pages/Analytics').then(m => ({ default: m.Analytics })));
const Reports = lazy(() => import('@pages/Reports').then(m => ({ default: m.Reports })));
const Login = lazy(() => import('@pages/Login').then(m => ({ default: m.Login })));
const NotFound = lazy(() => import('@pages/NotFound').then(m => ({ default: m.NotFound })));

// Loading component
const PageLoader: React.FC = () => (
  <Box
    display="flex"
    justifyContent="center"
    alignItems="center"
    minHeight="100vh"
    bgcolor="background.default"
  >
    <CircularProgress size={60} thickness={4} />
  </Box>
);

// Error fallback component
const ErrorFallback: React.FC<{ error?: Error }> = ({ error }) => (
  <Box
    display="flex"
    flexDirection="column"
    justifyContent="center"
    alignItems="center"
    minHeight="100vh"
    bgcolor="background.default"
    p={3}
  >
    <h1>Something went wrong</h1>
    <p>{error?.message || 'An unexpected error occurred'}</p>
    <button onClick={() => window.location.reload()}>Reload Page</button>
  </Box>
);

/**
 * Optimized App Component with Enterprise Features
 */
const App: React.FC = () => {
  // Initialize WebSocket connection on mount
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      websocketService.connect().catch(console.error);
    }

    // Cleanup on unmount
    return () => {
      websocketService.disconnect();
    };
  }, []);

  // Memoize theme to prevent unnecessary re-renders
  const memoizedTheme = useMemo(() => theme, []);

  // Performance monitoring in development
  const enablePerformanceMonitoring = import.meta.env.DEV;

  return (
    <ErrorBoundary fallback={ErrorFallback}>
      <Provider store={store}>
        <ThemeProvider theme={memoizedTheme}>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <CssBaseline />
            <Router>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Public routes */}
                  <Route path="/login" element={<Login />} />

                  {/* Private routes with layout */}
                  <Route
                    path="/"
                    element={
                      <PrivateRoute>
                        <MainLayout />
                      </PrivateRoute>
                    }
                  >
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="products" element={<Products />} />
                    <Route path="inventory" element={<Inventory />} />
                    <Route path="price-sync" element={<PriceSync />} />
                    <Route path="product-mapping" element={<ProductMapping />} />
                    <Route path="analytics" element={<Analytics />} />
                    <Route path="reports" element={<Reports />} />
                    <Route path="settings/*" element={<Settings />} />
                  </Route>

                  {/* 404 route */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </Router>

            {/* Toast notifications */}
            <ToastContainer
              position="top-right"
              autoClose={5000}
              hideProgressBar={false}
              newestOnTop
              closeOnClick
              rtl={false}
              pauseOnFocusLoss
              draggable
              pauseOnHover
              theme="light"
              limit={5}
            />

            {/* Performance monitoring in development */}
            {enablePerformanceMonitoring && <PerformanceMonitor />}
          </LocalizationProvider>
        </ThemeProvider>
      </Provider>
    </ErrorBoundary>
  );
};

export default App;