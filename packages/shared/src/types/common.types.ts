// packages/shared/src/types/common.types.ts
export interface BaseEntity {
  _id: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
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

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
}

export type Platform = 'naver' | 'shopify';
export type SyncStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type TransactionType = 'sale' | 'restock' | 'adjustment' | 'sync';
