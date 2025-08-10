// packages/frontend/src/types/models.ts

// 기본 타입 정의
export interface Product {
  _id: string;
  sku: string;
  productName: string;
  naverProductId: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  naverPrice: number;
  shopifyPrice: number;
  naverQuantity: number;
  shopifyQuantity: number;
  isActive: boolean;
  lastSyncedAt: string | null;
  syncStatus: 'synced' | 'pending' | 'error';
  syncError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryStatus {
  sku: string;
  naverQuantity: number;
  shopifyQuantity: number;
  difference: number;
  status: 'in_sync' | 'out_of_sync' | 'critical';
  lastChecked: string;
}

export interface InventoryTransaction {
  _id: string;
  sku: string;
  platform: 'naver' | 'shopify' | 'manual';
  transactionType: 'sale' | 'restock' | 'adjustment' | 'sync';
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  orderId?: string;
  orderLineItemId?: string;
  reason?: string;
  performedBy: 'system' | 'manual' | 'webhook';
  syncStatus: 'pending' | 'completed' | 'failed';
  syncedAt?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface PriceHistory {
  _id: string;
  sku: string;
  naverPrice: number;
  exchangeRate: number;
  calculatedShopifyPrice: number;
  finalShopifyPrice: number;
  priceMargin: number;
  currency: string;
  syncStatus: 'pending' | 'completed' | 'failed';
  syncedAt?: string;
  errorMessage?: string;
  metadata?: {
    manualOverride?: boolean;
    overrideReason?: string;
    originalPrice?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Mapping {
  _id: string;
  sku: string;
  naverProductId: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  shopifyInventoryItemId: string;
  shopifyLocationId: string;
  productName: string;
  vendor: string;
  isActive: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR';
  lastSyncedAt: string | null;
  syncStatus: 'synced' | 'pending' | 'error';
  syncError?: string;
  priceMargin: number;
  metadata?: {
    naverCategory?: string;
    shopifyTags?: string[];
    customFields?: Record<string, any>;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ExchangeRate {
  _id: string;
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  source: string;
  isManual: boolean;
  validFrom: string;
  validUntil: string;
  metadata?: {
    apiResponse?: Record<string, any>;
    manualReason?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalProducts: number;
  activeProducts: number;
  totalSales: number;
  syncStatus: {
    synced: number;
    pending: number;
    error: number;
  };
  inventoryStatus: {
    inStock: number;
    lowStock: number;
    outOfStock: number;
  };
  recentActivity: Activity[];
}

export interface Activity {
  _id: string;
  type: 'sync' | 'inventory_update' | 'price_update' | 'mapping_change' | 'error';
  action: string;
  details: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface User {
  _id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  _id: string;
  category: 'api' | 'sync' | 'notification' | 'general';
  settings: Record<string, any>;
  updatedBy: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  metadata?: Record<string, any>;
}

export interface SyncJob {
  _id: string;
  type: 'full' | 'inventory' | 'price' | 'mapping';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
  stats?: {
    processed: number;
    success: number;
    failed: number;
    skipped: number;
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
  }>;
}

export interface Alert {
  id: string;
  type: 'error' | 'warning' | 'info';
  severity: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  timestamp: string;
  status: 'active' | 'acknowledged' | 'dismissed';
  metadata?: Record<string, any>;
}

export interface Widget {
  id: string;
  type: string;
  title: string;
  position: { x: number; y: number; w: number; h: number };
  config: Record<string, any>;
  data?: any;
}

export interface DashboardConfig {
  userId: string;
  layout: any[];
  widgets: Widget[];
  theme: 'light' | 'dark';
  refreshInterval: number;
  preferences: Record<string, any>;
}

export interface ExportRequest {
  format: 'json' | 'csv' | 'excel' | 'pdf';
  type: 'all' | 'products' | 'inventory' | 'sync' | 'pricing';
  dateRange?: {
    start: string;
    end: string;
  };
}

export interface ExportStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  message?: string;
  url?: string;
  expiresAt?: string;
}
