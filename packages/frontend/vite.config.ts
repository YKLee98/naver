// packages/frontend/vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@components': path.resolve(__dirname, './src/components'),
        '@pages': path.resolve(__dirname, './src/pages'),
        '@services': path.resolve(__dirname, './src/services'),
        '@hooks': path.resolve(__dirname, './src/hooks'),
        '@utils': path.resolve(__dirname, './src/utils'),
        '@types': path.resolve(__dirname, './src/types'),
        '@store': path.resolve(__dirname, './src/store'),
        '@styles': path.resolve(__dirname, './src/styles'),
        '@assets': path.resolve(__dirname, './src/assets'),
      },
    },
    
    server: {
      port: 5173,
      strictPort: false,
      host: true,
      open: false,
      cors: true,
      watch: {
        usePolling: true,
        interval: 1000,
      },
      fs: {
        strict: false,
        allow: ['..'],
      },
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
          ws: true,
          rewrite: (path) => path,
        },
        '/socket.io': {
          target: env.VITE_WS_URL || 'ws://localhost:3001',
          ws: true,
          changeOrigin: true,
        },
      },
    },
    
    optimizeDeps: {
      // 실제로 설치된 패키지만 include
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@mui/material',
        // '@mui/lab', // 설치 확인 후 추가
        // '@mui/x-date-pickers', // 설치 확인 후 추가
        '@emotion/react',
        '@emotion/styled',
        '@reduxjs/toolkit',
        'react-redux',
        'axios',
        'date-fns',
        'recharts',
        'react-hook-form',
        'yup',
        'socket.io-client',
      ],
      // MUI icons는 exclude
      exclude: [
        '@mui/icons-material',
      ],
      // 강제 재최적화 옵션
      force: false, // development에서도 false로 변경
    },
    
    build: {
      outDir: 'dist',
      sourcemap: mode === 'development',
      minify: mode === 'production' ? 'terser' : false,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // node_modules 패키지 분리
            if (id.includes('node_modules')) {
              // MUI icons는 별도 청크
              if (id.includes('@mui/icons-material')) {
                return 'mui-icons';
              }
              // React 코어
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                return 'react-vendor';
              }
              // MUI 코어
              if (id.includes('@mui') && !id.includes('icons')) {
                return 'mui-vendor';
              }
              // Redux
              if (id.includes('redux') || id.includes('@reduxjs')) {
                return 'redux-vendor';
              }
              // 기타 유틸리티
              if (id.includes('axios') || id.includes('date-fns') || id.includes('lodash')) {
                return 'utils-vendor';
              }
            }
          },
        },
      },
    },
    
    esbuild: {
      logLevel: 'info',
      logOverride: { 'this-is-undefined-in-esm': 'silent' },
    },
  };
});