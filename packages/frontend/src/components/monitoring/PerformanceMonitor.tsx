// packages/frontend/src/components/monitoring/PerformanceMonitor.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { Box, Paper, Typography, IconButton, Collapse } from '@mui/material';
import { Close, Speed, Memory, Schedule } from '@mui/icons-material';

interface PerformanceMetrics {
  fps: number;
  memory: {
    used: number;
    limit: number;
    percent: number;
  };
  renderTime: number;
  componentCount: number;
  domNodes: number;
}

/**
 * Performance Monitor Component for Development
 */
export const PerformanceMonitor: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 60,
    memory: { used: 0, limit: 0, percent: 0 },
    renderTime: 0,
    componentCount: 0,
    domNodes: 0,
  });

  // Calculate FPS
  const calculateFPS = useCallback(() => {
    let lastTime = performance.now();
    let frames = 0;
    let fps = 60;

    const frame = () => {
      const currentTime = performance.now();
      frames++;

      if (currentTime >= lastTime + 1000) {
        fps = Math.round((frames * 1000) / (currentTime - lastTime));
        frames = 0;
        lastTime = currentTime;
      }

      return fps;
    };

    return frame;
  }, []);

  // Get memory usage
  const getMemoryUsage = useCallback(() => {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        used: Math.round(memory.usedJSHeapSize / 1048576),
        limit: Math.round(memory.jsHeapSizeLimit / 1048576),
        percent: Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100),
      };
    }
    return { used: 0, limit: 0, percent: 0 };
  }, []);

  // Count React components
  const countReactComponents = useCallback(() => {
    const reactRoot = document.getElementById('root');
    if (!reactRoot) return 0;

    let count = 0;
    const traverse = (element: Element) => {
      if (element._reactInternalFiber || element._reactInternalInstance) {
        count++;
      }
      Array.from(element.children).forEach(traverse);
    };

    traverse(reactRoot);
    return count;
  }, []);

  // Monitor performance
  useEffect(() => {
    if (!isOpen) return;

    const fpsCounter = calculateFPS();
    
    const interval = setInterval(() => {
      setMetrics({
        fps: fpsCounter(),
        memory: getMemoryUsage(),
        renderTime: performance.now(),
        componentCount: countReactComponents(),
        domNodes: document.getElementsByTagName('*').length,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, calculateFPS, getMemoryUsage, countReactComponents]);

  // Keyboard shortcut to toggle
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        setIsOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  return (
    <>
      {/* Toggle button */}
      <IconButton
        onClick={() => setIsOpen(!isOpen)}
        sx={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 9999,
          bgcolor: 'background.paper',
          boxShadow: 2,
          '&:hover': {
            bgcolor: 'background.paper',
          },
        }}
      >
        <Speed />
      </IconButton>

      {/* Performance panel */}
      <Collapse in={isOpen}>
        <Paper
          elevation={4}
          sx={{
            position: 'fixed',
            bottom: 60,
            right: 16,
            width: 300,
            zIndex: 9998,
            p: 2,
            bgcolor: 'background.paper',
          }}
        >
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Performance Monitor</Typography>
            <IconButton size="small" onClick={() => setIsOpen(false)}>
              <Close />
            </IconButton>
          </Box>

          <Box display="flex" flexDirection="column" gap={1}>
            {/* FPS */}
            <Box display="flex" alignItems="center" gap={1}>
              <Speed fontSize="small" />
              <Typography variant="body2">
                FPS: <strong>{metrics.fps}</strong>
              </Typography>
              <Box
                sx={{
                  ml: 'auto',
                  width: 50,
                  height: 4,
                  bgcolor: metrics.fps > 50 ? 'success.main' : metrics.fps > 30 ? 'warning.main' : 'error.main',
                  borderRadius: 1,
                }}
              />
            </Box>

            {/* Memory */}
            <Box display="flex" alignItems="center" gap={1}>
              <Memory fontSize="small" />
              <Typography variant="body2">
                Memory: <strong>{metrics.memory.used} MB</strong> / {metrics.memory.limit} MB
              </Typography>
            </Box>
            <Box
              sx={{
                width: '100%',
                height: 4,
                bgcolor: 'grey.300',
                borderRadius: 1,
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  width: `${metrics.memory.percent}%`,
                  height: '100%',
                  bgcolor: metrics.memory.percent < 50 ? 'success.main' : metrics.memory.percent < 80 ? 'warning.main' : 'error.main',
                  transition: 'width 0.3s',
                }}
              />
            </Box>

            {/* DOM Nodes */}
            <Box display="flex" alignItems="center" gap={1}>
              <Schedule fontSize="small" />
              <Typography variant="body2">
                DOM Nodes: <strong>{metrics.domNodes}</strong>
              </Typography>
              {metrics.domNodes > 1500 && (
                <Typography variant="caption" color="warning.main">
                  (High)
                </Typography>
              )}
            </Box>

            {/* React Components */}
            <Typography variant="body2">
              React Components: <strong>{metrics.componentCount}</strong>
            </Typography>

            {/* Instructions */}
            <Typography variant="caption" color="text.secondary" mt={1}>
              Press Ctrl+Shift+P to toggle
            </Typography>
          </Box>
        </Paper>
      </Collapse>
    </>
  );
};