// packages/frontend/src/utils/iconPreloader.ts
import { preloadIcons, type IconName } from './iconLoader';

/**
 * Most commonly used icons that should be preloaded
 * Based on the frequency analysis of your codebase
 */
const HIGH_PRIORITY_ICONS: IconName[] = [
  'Add',       // Used in 2 files (Products, InventoryAdjustDialog)
  'Close',     // Used in 2 files (Products, PerformanceMonitor)
  'Error',     // Used in 2 files (SyncStatusCard, ErrorBoundary)
  'Sync',      // Used in 2 files (Products, SyncStatusCard)
  'Schedule',  // Used in 2 files (SyncStatusCard, PerformanceMonitor)
  'FiberManualRecord', // Used in 2 files (WebSocketStatus components)
];

/**
 * Medium priority icons - load after high priority
 */
const MEDIUM_PRIORITY_ICONS: IconName[] = [
  'Edit',
  'Delete',
  'Home',
  'CheckCircle',
  'TrendingUp',
  'TrendingDown',
];

/**
 * Low priority icons - load when idle
 */
const LOW_PRIORITY_ICONS: IconName[] = [
  'Remove',
  'Speed',
  'Memory',
  'Circle',
];

/**
 * Preload icons with priority-based loading
 */
export const initializeIconPreloading = () => {
  // Load high priority icons immediately
  preloadIcons(HIGH_PRIORITY_ICONS);
  
  // Load medium priority icons after a short delay
  setTimeout(() => {
    preloadIcons(MEDIUM_PRIORITY_ICONS);
  }, 100);
  
  // Load low priority icons when the browser is idle
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => {
      preloadIcons(LOW_PRIORITY_ICONS);
    });
  } else {
    // Fallback for browsers that don't support requestIdleCallback
    setTimeout(() => {
      preloadIcons(LOW_PRIORITY_ICONS);
    }, 1000);
  }
};

/**
 * Get all icons used in the application
 */
export const getAllUsedIcons = (): IconName[] => [
  ...HIGH_PRIORITY_ICONS,
  ...MEDIUM_PRIORITY_ICONS,
  ...LOW_PRIORITY_ICONS,
];

/**
 * Preload icons for a specific page/component
 */
export const preloadPageIcons = (page: string) => {
  const pageIconMap: Record<string, IconName[]> = {
    products: ['Add', 'Edit', 'Delete', 'Sync', 'Close'],
    dashboard: ['FiberManualRecord', 'Sync', 'CheckCircle', 'Error', 'Schedule', 'TrendingUp', 'TrendingDown'],
    inventory: ['Add', 'Remove'],
    monitoring: ['Close', 'Speed', 'Memory', 'Schedule'],
    notfound: ['Home'],
  };
  
  const icons = pageIconMap[page.toLowerCase()] || [];
  if (icons.length > 0) {
    preloadIcons(icons);
  }
};