// packages/frontend/src/types/index.ts

// 사용자 관련
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'viewer';
  createdAt: Date;
  updatedAt: Date;
}

// 상품 매핑
export interface ProductMapping {
  _id?: string;
  sku: string;
  naverProductId: string;
  shopifyProductId: string;
  shopifyVariantId?: string;
  productName?: string;
  vendor?: string;
  priceMargin: number;
  isActive: boolean;
  status?: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'WARNING';
  syncStatus?: string;
  lastSyncAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// 네이버 상품
export interface NaverProduct {
  id: string;
  productNo?: string;
  name: string;
  sellerManagementCode?: string;
  sellerProductTag?: string;
  salePrice: number;
  stockQuantity: number;
  statusType?: 'SALE' | 'SUSPENSION' | 'OUTOFSTOCK';
  status?: string;
  representativeImage?: {
    url: string;
  };
  imageUrl?: string;
  options?: NaverProductOption[];
}

export interface NaverProductOption {
  id: string;
  name: string;
  value: string;
  price: number;
  stockQuantity: number;
}

// Shopify 상품
export interface ShopifyProduct {
  id: string;
  title: string;
  vendor: string;
  productType: string;
  tags: string[];
  featuredImage?: {
    url: string;
  };
  variants: ShopifyVariant[];
}

export interface ShopifyVariant {
  id: string;
  title: string;
  sku: string;
  price: string;
  compareAtPrice?: string;
  inventoryQuantity: number;
  inventoryItemId?: string;
  image?: {
    url: string;
  };
}

// 재고 관련
export interface InventoryStatus {
  sku: string;
  naverStock: number;
  shopifyStock: number;
  difference: number;
  status: 'SYNCED' | 'OUT_OF_SYNC' | 'ERROR';
  lastSyncAt?: Date;
}

export interface InventoryTransaction {
  id: string;
  sku: string;
  platform: 'naver' | 'shopify';
  type: 'sale' | 'adjustment' | 'return' | 'restock';
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  orderId?: string;
  reason?: string;
  createdAt: Date;
}

export interface InventoryAdjustment {
  sku: string;
  platform: 'naver' | 'shopify' | 'both';
  quantity: number;
  reason: string;
}

// 가격 관련
export interface PriceInfo {
  sku: string;
  naverPrice: number;
  shopifyPrice: number;
  exchangeRate: number;
  margin: number;
  calculatedPrice: number;
  difference: number;
  status: 'SYNCED' | 'OUT_OF_SYNC' | 'ERROR';
}

export interface PriceHistory {
  id: string;
  sku: string;
  platform: 'naver' | 'shopify';
  oldPrice: number;
  newPrice: number;
  exchangeRate?: number;
  reason?: string;
  createdAt: Date;
}

// 동기화 관련
export interface SyncJob {
  id: string;
  type: 'FULL' | 'INVENTORY' | 'PRICE' | 'SINGLE_SKU';
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  totalItems: number;
  processedItems: number;
  successCount: number;
  failureCount: number;
  errors?: SyncError[];
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
}

export interface SyncError {
  sku: string;
  error: string;
  timestamp: Date;
}

export interface SyncSettings {
  autoSync: boolean;
  syncInterval: number; // 분 단위
  syncInventory: boolean;
  syncPrice: boolean;
  priceMargin: number;
  exchangeRateMode: 'AUTO' | 'MANUAL';
  manualExchangeRate?: number;
}

export interface SyncHistory {
  id: string;
  type: string;
  status: string;
  details?: any;
  createdAt: Date;
}

// 대시보드 관련
export interface DashboardStatistics {
  totalMappings: number;
  activeMappings: number;
  totalProducts: number;
  inventorySyncStatus: {
    synced: number;
    outOfSync: number;
    error: number;
  };
  priceSyncStatus: {
    synced: number;
    outOfSync: number;
    error: number;
  };
  lastSyncTime?: Date;
  todaySales?: number;
  monthSales?: number;
}

export interface Activity {
  id: string;
  type: 'SYNC' | 'MAPPING' | 'INVENTORY' | 'PRICE' | 'ERROR';
  action: string;
  details?: string;
  user?: string;
  status: 'SUCCESS' | 'FAILURE' | 'WARNING';
  timestamp: Date;
}

// 환율 관련
export interface ExchangeRate {
  id?: string;
  rate: number;
  source: 'AUTO' | 'MANUAL';
  baseCurrency: string;
  targetCurrency: string;
  validFrom: Date;
  validTo?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// API 응답
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// 파일 업로드
export interface FileUploadResult {
  total: number;
  success: number;
  failed: number;
  errors?: Array<{
    row: number;
    error: string;
  }>;
}

// 필터 및 정렬
export interface FilterOptions {
  search?: string;
  status?: string;
  isActive?: boolean;
  vendor?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface SortOptions {
  field: string;
  order: 'asc' | 'desc';
}

// 알림
export interface Notification {
  id: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

// 설정
export interface AppSettings {
  theme: 'light' | 'dark';
  language: 'ko' | 'en';
  notifications: {
    email: boolean;
    push: boolean;
    inApp: boolean;
  };
  display: {
    itemsPerPage: number;
    dateFormat: string;
    currencyFormat: string;
  };
}