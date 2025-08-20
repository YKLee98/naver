// packages/frontend/vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import compression from 'vite-plugin-compression';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isDev = mode === 'development';
  const isProd = mode === 'production';
  
  return {
    plugins: [
      react({
        fastRefresh: isDev,
        babel: {
          plugins: isProd ? ['transform-remove-console'] : [],
        },
      }),
      isProd && compression({
        algorithm: 'gzip',
        ext: '.gz',
        threshold: 10240,
      }),
      isProd && compression({
        algorithm: 'brotliCompress',
        ext: '.br',
        threshold: 10240,
      }),
      isProd && visualizer({
        filename: 'dist/stats.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
      }),
    ].filter(Boolean),
    
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
        'prop-types': path.resolve(__dirname, '../../node_modules/prop-types'),
      },
    },
    
    server: {
      port: 5173,
      strictPort: false,
      allowedHosts: ['.ngrok-free.app', '.ngrok.io', 'localhost', '27b68fa0194c.ngrok-free.app', '3eb63ab2112e.ngrok-free.app'],
      host: true,
      open: false,
      cors: true,
      hmr: {
        overlay: true,
      },
      watch: {
        usePolling: process.platform === 'win32',
        interval: 1000,
        binaryInterval: 1000,
        ignored: [
          '**/node_modules/**',
          '**/.ignored_node_modules/**',
          '**/dist/**',
          '**/.git/**',
          '**/.idea/**',
          '**/.vscode/**',
          '**/coverage/**',
          '**/cypress/**',
          '**/.DS_Store',
          '**/package-lock.json',
          '**/yarn.lock',
          '**/pnpm-lock.yaml',
          '**/node_modules/@mui/icons-material/**',
        ],
        depth: 3,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100,
        },
      },
      fs: {
        strict: false,
        allow: ['..'],
      },
      proxy: {
        '/api/v1': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('proxy error', err);
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              // ngrok 헤더 추가
              proxyReq.setHeader('ngrok-skip-browser-warning', 'true');
              proxyReq.setHeader('X-Forwarded-Host', req.headers.host || '');
              console.log('Sending Request to the Target:', req.method, req.url);
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
            });
          },
        },
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              proxyReq.setHeader('ngrok-skip-browser-warning', 'true');
              proxyReq.setHeader('X-Forwarded-Host', req.headers.host || '');
            });
          },
        },
        '/socket.io': {
          target: 'ws://localhost:3001',
          ws: true,
          changeOrigin: true,
        },
        '/health': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/auth': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/webhooks': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@mui/material',
        '@mui/icons-material',
        '@mui/x-data-grid',
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
        '@mui/system',
        '@mui/utils',
        'prop-types',
      ],
      exclude: [
        '@mui/lab',
      ],
      force: false,
      entries: [],
      esbuildOptions: {
        target: 'es2020',
        keepNames: true,
        loader: {
          '.js': 'jsx',
        },
        define: {
          'process.env.NODE_ENV': JSON.stringify(mode),
        },
      },
      holdUntilCrawlEnd: false,
    },
    
    build: {
      outDir: 'dist',
      sourcemap: isDev,
      minify: isProd ? 'terser' : false,
      target: 'es2020',
      chunkSizeWarningLimit: 2000,
      reportCompressedSize: false,
      cssCodeSplit: true,
      assetsInlineLimit: 4096,
      terserOptions: isProd ? {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info'],
        },
        format: {
          comments: false,
        },
      } : undefined,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              if (id.includes('@mui/icons-material')) {
                const parts = id.split('/');
                const iconName = parts[parts.length - 1].replace('.js', '');
                return `icons/${iconName.slice(0, 2).toLowerCase()}`;
              }
              if (id.includes('react') || id.includes('react-dom')) {
                return 'react-core';
              }
              if (id.includes('react-router')) {
                return 'react-router';
              }
              if (id.includes('@mui/material')) {
                return 'mui-core';
              }
              if (id.includes('@mui/x-data-grid')) {
                return 'mui-grid';
              }
              if (id.includes('@mui')) {
                return 'mui-others';
              }
              if (id.includes('redux') || id.includes('@reduxjs')) {
                return 'state-management';
              }
              if (id.includes('recharts')) {
                return 'charts';
              }
              if (id.includes('axios') || id.includes('socket.io')) {
                return 'network';
              }
              if (id.includes('date-fns') || id.includes('yup') || id.includes('react-hook-form')) {
                return 'utils';
              }
              return 'vendor';
            }
          },
          chunkFileNames: (chunkInfo) => {
            const facadeModuleId = chunkInfo.facadeModuleId ? chunkInfo.facadeModuleId.split('/').pop() : 'chunk';
            return `js/[name]-${facadeModuleId}-[hash].js`;
          },
          entryFileNames: 'js/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            const extType = assetInfo.name?.split('.').pop() || 'asset';
            if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType)) {
              return 'images/[name]-[hash][extname]';
            }
            if (/woff2?|ttf|otf|eot/i.test(extType)) {
              return 'fonts/[name]-[hash][extname]';
            }
            if (extType === 'css') {
              return 'css/[name]-[hash][extname]';
            }
            return 'assets/[name]-[hash][extname]';
          },
        },
        external: [],
        treeshake: {
          moduleSideEffects: false,
          propertyReadSideEffects: false,
          tryCatchDeoptimization: false,
        },
      },
    },
    
    esbuild: {
      logLevel: 'info',
      logOverride: { 'this-is-undefined-in-esm': 'silent' },
      treeShaking: true,
      legalComments: 'none',
    },
    
    preview: {
      port: 4173,
      strictPort: false,
      host: true,
      cors: true,
    },
    
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    
    clearScreen: false,
    logLevel: isDev ? 'info' : 'warn',
  };
});