// API 응답 타입
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// 상품 매핑 타입
export interface ProductMapping {
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

// 재고 트랜잭션 타입
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

// 가격 이력 타입
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

// 환율 타입
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

// 대시보드 통계 타입
export interface DashboardStats {
  mappings: {
    total: number;
    active: number;
    pending: number;
    failed: number;
  };
  transactions: {
    today: number;
    week: number;
  };
  orders: {
    today: number;
    week: number;
  };
}

// 동기화 상태 타입
export interface SyncStatus {
  isRunning: boolean;
  lastSync: string | null;
  statistics: {
    totalMappings: number;
    syncedMappings: number;
    pendingMappings: number;
    errorMappings: number;
  };
}

// 동기화 설정 타입
export interface SyncSettings {
  syncInterval: string;
  autoSync: boolean;
  priceMargin: string;
  lastSync: string | null;
}

// WebSocket 이벤트 타입
export interface InventoryUpdateEvent {
  sku: string;
  quantity: number;
  platform: string;
  transactionType: string;
  reason?: string;
  timestamp: string;
}

export interface PriceUpdateEvent {
  sku: string;
  naverPrice: number;
  shopifyPrice: number;
  exchangeRate: number;
  margin: number;
  timestamp: string;
}

export interface ExchangeRateUpdateEvent {
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  timestamp: string;
}

// 검색/필터 타입
export interface ProductFilter {
  search?: string;
  vendor?: string;
  isActive?: boolean;
  syncStatus?: 'synced' | 'pending' | 'error';
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

// 사용자 타입
export interface User {
  id: string;
  email: string;
  role: string;
}

// 알림 타입
export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}
