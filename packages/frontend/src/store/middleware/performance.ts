// packages/frontend/src/store/middleware/performance.ts
import { Middleware } from '@reduxjs/toolkit';

/**
 * Performance monitoring middleware for Redux
 */
export const performanceMiddleware: Middleware = (store) => (next) => (action) => {
  if (import.meta.env.DEV) {
    const startTime = performance.now();
    const prevState = store.getState();
    
    const result = next(action);
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Log slow actions
    if (duration > 16) { // Longer than one frame (60fps)
      console.warn(
        `[Redux Performance] Slow action detected:`,
        {
          action: action.type,
          duration: `${duration.toFixed(2)}ms`,
          payload: action.payload,
        }
      );
    }
    
    // Detect state mutations
    const nextState = store.getState();
    if (prevState === nextState && action.type !== '@@INIT') {
      console.warn(
        `[Redux Performance] State not updated for action:`,
        action.type
      );
    }
    
    return result;
  }
  
  return next(action);
};

/**
 * Action batching middleware to reduce re-renders
 */
export const batchingMiddleware: Middleware = (store) => {
  let batchedActions: any[] = [];
  let batchTimeout: NodeJS.Timeout | null = null;
  
  const flushBatch = () => {
    if (batchedActions.length === 0) return;
    
    const actions = [...batchedActions];
    batchedActions = [];
    
    // Dispatch all actions at once
    actions.forEach(action => {
      store.dispatch(action);
    });
  };
  
  return (next) => (action) => {
    // Skip batching for certain action types
    const skipBatching = [
      'auth/login',
      'auth/logout',
      '@@INIT',
    ].includes(action.type);
    
    if (skipBatching || !action.meta?.batch) {
      return next(action);
    }
    
    // Add to batch
    batchedActions.push(action);
    
    // Clear existing timeout
    if (batchTimeout) {
      clearTimeout(batchTimeout);
    }
    
    // Set new timeout to flush batch
    batchTimeout = setTimeout(flushBatch, 10);
    
    return action;
  };
};

/**
 * Cache middleware for expensive selectors
 */
export const cacheMiddleware: Middleware = () => {
  const cache = new Map<string, { value: any; timestamp: number }>();
  const CACHE_DURATION = 60000; // 1 minute
  
  return (next) => (action) => {
    // Clear cache for certain actions
    if (action.type.includes('/fulfilled') || action.type.includes('/rejected')) {
      cache.clear();
    }
    
    // Store cache reference in action meta
    if (action.meta) {
      action.meta.cache = {
        get: (key: string) => {
          const cached = cache.get(key);
          if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            return cached.value;
          }
          return null;
        },
        set: (key: string, value: any) => {
          cache.set(key, { value, timestamp: Date.now() });
        },
      };
    }
    
    return next(action);
  };
};