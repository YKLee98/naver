// API 엔드포인트
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    VERIFY: '/auth/verify',
  },
  PRODUCTS: {
    LIST: '/products',
    DETAIL: (sku: string) => `/products/${sku}`,
    SEARCH_NAVER: '/products/search/naver',
    SEARCH_SHOPIFY: '/products/search/shopify',
  },
  INVENTORY: {
    STATUS: (sku: string) => `/inventory/${sku}/status`,
    HISTORY: (sku: string) => `/inventory/${sku}/history`,
    ADJUST: (sku: string) => `/inventory/${sku}/adjust`,
    LOW_STOCK: '/inventory/low-stock',
  },
  SYNC: {
    FULL: '/sync/full',
    SKU: (sku: string) => `/sync/sku/${sku}`,
    STATUS: '/sync/status',
    SETTINGS: '/sync/settings',
  },
  MAPPINGS: {
    LIST: '/mappings',
    CREATE: '/mappings',
    UPDATE: (id: string) => `/mappings/${id}`,
    DELETE: (id: string) => `/mappings/${id}`,
    AUTO_DISCOVER: '/mappings/auto-discover',
    VALIDATE: (id: string) => `/mappings/${id}/validate`,
    BULK: '/mappings/bulk',
  },
  DASHBOARD: {
    STATS: '/dashboard/statistics',
    ACTIVITIES: '/dashboard/activities',
    PRICE_CHART: '/dashboard/charts/price',
    INVENTORY_CHART: '/dashboard/charts/inventory',
  },
} as const;

// 동기화 간격 옵션
export const SYNC_INTERVALS = [
  { value: 5, label: '5분' },
  { value: 15, label: '15분' },
  { value: 30, label: '30분' },
  { value: 60, label: '1시간' },
  { value: 180, label: '3시간' },
  { value: 360, label: '6시간' },
  { value: 720, label: '12시간' },
  { value: 1440, label: '24시간' },
] as const;

// 마진율 옵션
export const MARGIN_OPTIONS = [
  { value: 1.0, label: '0%' },
  { value: 1.05, label: '5%' },
  { value: 1.1, label: '10%' },
  { value: 1.15, label: '15%' },
  { value: 1.2, label: '20%' },
  { value: 1.25, label: '25%' },
  { value: 1.3, label: '30%' },
  { value: 1.5, label: '50%' },
] as const;

// 재고 임계값
export const STOCK_THRESHOLDS = {
  LOW: 10,
  CRITICAL: 5,
  OUT_OF_STOCK: 0,
} as const;

// 페이지 크기 옵션
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

// 날짜 범위 프리셋
export const DATE_RANGE_PRESETS = [
  { label: '오늘', days: 0 },
  { label: '어제', days: 1 },
  { label: '최근 7일', days: 7 },
  { label: '최근 30일', days: 30 },
  { label: '최근 90일', days: 90 },
] as const;

// 차트 색상
export const CHART_COLORS = {
  primary: '#1976d2',
  secondary: '#dc004e',
  success: '#4caf50',
  warning: '#ff9800',
  error: '#f44336',
  info: '#2196f3',
} as const;

// 네비게이션 메뉴
export const NAVIGATION_MENU = [
  { path: '/dashboard', label: '대시보드', icon: 'Dashboard' },
  { path: '/inventory', label: '재고 관리', icon: 'Inventory' },
  { path: '/pricing', label: '가격 관리', icon: 'AttachMoney' },
  { path: '/mapping', label: 'SKU 매핑', icon: 'Link' },
  { path: '/reports', label: '리포트', icon: 'Assessment' },
  { path: '/settings', label: '설정', icon: 'Settings' },
] as const;

// 알림 음향 파일
export const NOTIFICATION_SOUNDS = {
  SUCCESS: '/sounds/success.mp3',
  WARNING: '/sounds/warning.mp3',
  ERROR: '/sounds/error.mp3',
  INFO: '/sounds/info.mp3',
} as const;

// 테이블 컬럼 기본 설정
export const DEFAULT_TABLE_COLUMNS = {
  PRODUCTS: ['sku', 'productName', 'naverPrice', 'shopifyPrice', 'quantity', 'syncStatus'],
  INVENTORY: ['sku', 'quantity', 'platform', 'transactionType', 'createdAt'],
  PRICE_HISTORY: ['sku', 'naverPrice', 'exchangeRate', 'shopifyPrice', 'margin', 'createdAt'],
} as const;

// 정규 표현식
export const REGEX_PATTERNS = {
  SKU: /^[A-Za-z0-9\-_]+$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  NAVER_PRODUCT_ID: /^\d+$/,
  SHOPIFY_ID: /^\d+$/,
} as const;

// 에러 메시지
export const ERROR_MESSAGES = {
  NETWORK: '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  UNAUTHORIZED: '인증이 필요합니다. 다시 로그인해주세요.',
  FORBIDDEN: '접근 권한이 없습니다.',
  NOT_FOUND: '요청한 리소스를 찾을 수 없습니다.',
  SERVER_ERROR: '서버 오류가 발생했습니다. 관리자에게 문의하세요.',
  VALIDATION: '입력한 정보를 다시 확인해주세요.',
} as const;

// 성공 메시지
export const SUCCESS_MESSAGES = {
  SYNC_COMPLETE: '동기화가 완료되었습니다.',
  SAVE_COMPLETE: '저장이 완료되었습니다.',
  DELETE_COMPLETE: '삭제가 완료되었습니다.',
  UPDATE_COMPLETE: '업데이트가 완료되었습니다.',
} as const;

