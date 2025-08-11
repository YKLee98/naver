// packages/backend/src/utils/metrics.ts
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { logger } from './logger.js';

export interface Metrics {
  requests: RequestMetrics;
  database: DatabaseMetrics;
  cache: CacheMetrics;
  system: SystemMetrics;
  business: BusinessMetrics;
  errors: ErrorMetrics;
}

export interface RequestMetrics {
  total: number;
  successful: number;
  failed: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerSecond: number;
  activeRequests: number;
  byMethod: Record<string, number>;
  byStatusCode: Record<string, number>;
  byEndpoint: Record<string, number>;
}

export interface DatabaseMetrics {
  queries: number;
  slowQueries: number;
  averageQueryTime: number;
  connectionPoolSize: number;
  activeConnections: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  memoryUsage: number;
}

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkIn: number;
  networkOut: number;
  uptime: number;
}

export interface BusinessMetrics {
  syncJobs: {
    total: number;
    successful: number;
    failed: number;
    pending: number;
    averageDuration: number;
  };
  products: {
    total: number;
    active: number;
    synced: number;
    outOfStock: number;
  };
  inventory: {
    totalValue: number;
    averageStockLevel: number;
    lowStockItems: number;
  };
}

export interface ErrorMetrics {
  total: number;
  byType: Record<string, number>;
  byService: Record<string, number>;
  rate: number;
  lastError?: {
    message: string;
    timestamp: Date;
    stack?: string;
  };
}

export class MetricsCollector extends EventEmitter {
  private metrics: Metrics;
  private responseTimes: number[] = [];
  private startTime: Date;
  private metricsInterval?: NodeJS.Timeout;
  private readonly MAX_RESPONSE_TIMES = 10000;

  constructor() {
    super();
    this.startTime = new Date();

    this.metrics = this.initializeMetrics();
    this.startMetricsCollection();
  }

  private initializeMetrics(): Metrics {
    return {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        averageResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        requestsPerSecond: 0,
        activeRequests: 0,
        byMethod: {},
        byStatusCode: {},
        byEndpoint: {},
      },
      database: {
        queries: 0,
        slowQueries: 0,
        averageQueryTime: 0,
        connectionPoolSize: 0,
        activeConnections: 0,
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0,
        evictions: 0,
        memoryUsage: 0,
      },
      system: {
        cpuUsage: 0,
        memoryUsage: 0,
        diskUsage: 0,
        networkIn: 0,
        networkOut: 0,
        uptime: 0,
      },
      business: {
        syncJobs: {
          total: 0,
          successful: 0,
          failed: 0,
          pending: 0,
          averageDuration: 0,
        },
        products: {
          total: 0,
          active: 0,
          synced: 0,
          outOfStock: 0,
        },
        inventory: {
          totalValue: 0,
          averageStockLevel: 0,
          lowStockItems: 0,
        },
      },
      errors: {
        total: 0,
        byType: {},
        byService: {},
        rate: 0,
      },
    };
  }

  private startMetricsCollection(): void {
    // Calculate metrics every 10 seconds
    this.metricsInterval = setInterval(() => {
      this.calculateDerivedMetrics();
      this.emit('metrics:updated', this.metrics);
    }, 10000);
  }

  /**
   * Record HTTP request
   */
  recordRequest(
    method: string,
    endpoint: string,
    statusCode: number,
    responseTime: number
  ): void {
    this.metrics.requests.total++;

    if (statusCode >= 200 && statusCode < 400) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
    }

    // Track response time
    this.responseTimes.push(responseTime);
    if (this.responseTimes.length > this.MAX_RESPONSE_TIMES) {
      this.responseTimes.shift();
    }

    // Track by method
    this.metrics.requests.byMethod[method] =
      (this.metrics.requests.byMethod[method] || 0) + 1;

    // Track by status code
    const statusGroup = `${Math.floor(statusCode / 100)}xx`;
    this.metrics.requests.byStatusCode[statusGroup] =
      (this.metrics.requests.byStatusCode[statusGroup] || 0) + 1;

    // Track by endpoint (limit to top 100)
    const endpointKey = `${method} ${endpoint}`;
    this.metrics.requests.byEndpoint[endpointKey] =
      (this.metrics.requests.byEndpoint[endpointKey] || 0) + 1;

    // Keep only top 100 endpoints
    if (Object.keys(this.metrics.requests.byEndpoint).length > 100) {
      const sorted = Object.entries(this.metrics.requests.byEndpoint)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100);
      this.metrics.requests.byEndpoint = Object.fromEntries(sorted);
    }
  }

  /**
   * Record database query
   */
  recordDatabaseQuery(duration: number, slow: boolean = false): void {
    this.metrics.database.queries++;

    if (slow) {
      this.metrics.database.slowQueries++;
    }

    // Update average query time
    const totalQueries = this.metrics.database.queries;
    const currentAverage = this.metrics.database.averageQueryTime;
    this.metrics.database.averageQueryTime =
      (currentAverage * (totalQueries - 1) + duration) / totalQueries;
  }

  /**
   * Record cache operation
   */
  recordCacheOperation(hit: boolean): void {
    if (hit) {
      this.metrics.cache.hits++;
    } else {
      this.metrics.cache.misses++;
    }

    // Calculate hit rate
    const total = this.metrics.cache.hits + this.metrics.cache.misses;
    this.metrics.cache.hitRate =
      total > 0 ? (this.metrics.cache.hits / total) * 100 : 0;
  }

  /**
   * Record error
   */
  recordError(error: Error, service?: string): void {
    this.metrics.errors.total++;

    // Track by error type
    const errorType = error.constructor.name;
    this.metrics.errors.byType[errorType] =
      (this.metrics.errors.byType[errorType] || 0) + 1;

    // Track by service
    if (service) {
      this.metrics.errors.byService[service] =
        (this.metrics.errors.byService[service] || 0) + 1;
    }

    // Store last error
    this.metrics.errors.lastError = {
      message: error.message,
      timestamp: new Date(),
      ...(error.stack && { stack: error.stack }),
    };

    // Log critical errors
    logger.error('Metrics: Error recorded', {
      error: error.message,
      service,
      type: errorType,
    });
  }

  /**
   * Update business metrics
   */
  updateBusinessMetrics(type: string, data: any): void {
    switch (type) {
      case 'syncJob':
        if (data.status === 'completed') {
          this.metrics.business.syncJobs.successful++;
        } else if (data.status === 'failed') {
          this.metrics.business.syncJobs.failed++;
        }
        this.metrics.business.syncJobs.total++;
        break;

      case 'products':
        Object.assign(this.metrics.business.products, data);
        break;

      case 'inventory':
        Object.assign(this.metrics.business.inventory, data);
        break;
    }
  }

  /**
   * Calculate derived metrics
   */
  private calculateDerivedMetrics(): void {
    // Calculate response time percentiles
    if (this.responseTimes.length > 0) {
      const sorted = [...this.responseTimes].sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      const p99Index = Math.floor(sorted.length * 0.99);

      this.metrics.requests.p95ResponseTime = sorted[p95Index] || 0;
      this.metrics.requests.p99ResponseTime = sorted[p99Index] || 0;

      const sum = sorted.reduce((a, b) => a + b, 0);
      this.metrics.requests.averageResponseTime = sum / sorted.length;
    }

    // Calculate requests per second
    const uptime = (Date.now() - this.startTime.getTime()) / 1000;
    this.metrics.requests.requestsPerSecond =
      this.metrics.requests.total / uptime;

    // Calculate error rate
    this.metrics.errors.rate =
      this.metrics.requests.total > 0
        ? (this.metrics.errors.total / this.metrics.requests.total) * 100
        : 0;

    // Update system uptime
    this.metrics.system.uptime = uptime;
  }

  /**
   * Get current metrics
   */
  async getMetrics(): Promise<Metrics> {
    this.calculateDerivedMetrics();
    return { ...this.metrics };
  }

  /**
   * Get metrics summary
   */
  getSummary(): any {
    return {
      uptime: this.metrics.system.uptime,
      requests: {
        total: this.metrics.requests.total,
        rps: this.metrics.requests.requestsPerSecond.toFixed(2),
        errorRate: `${this.metrics.errors.rate.toFixed(2)}%`,
        avgResponseTime: `${this.metrics.requests.averageResponseTime.toFixed(2)}ms`,
      },
      cache: {
        hitRate: `${this.metrics.cache.hitRate.toFixed(2)}%`,
      },
      database: {
        queries: this.metrics.database.queries,
        avgQueryTime: `${this.metrics.database.averageQueryTime.toFixed(2)}ms`,
      },
    };
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = this.initializeMetrics();
    this.responseTimes = [];
    logger.info('Metrics reset');
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    this.removeAllListeners();
  }

  /**
   * Export metrics for monitoring systems
   */
  exportPrometheus(): string {
    const lines: string[] = [];

    // Request metrics
    lines.push(`# HELP http_requests_total Total number of HTTP requests`);
    lines.push(`# TYPE http_requests_total counter`);
    lines.push(`http_requests_total ${this.metrics.requests.total}`);

    lines.push(`# HELP http_request_duration_seconds HTTP request latencies`);
    lines.push(`# TYPE http_request_duration_seconds histogram`);
    lines.push(
      `http_request_duration_seconds{quantile="0.95"} ${this.metrics.requests.p95ResponseTime / 1000}`
    );
    lines.push(
      `http_request_duration_seconds{quantile="0.99"} ${this.metrics.requests.p99ResponseTime / 1000}`
    );

    // Error metrics
    lines.push(`# HELP errors_total Total number of errors`);
    lines.push(`# TYPE errors_total counter`);
    lines.push(`errors_total ${this.metrics.errors.total}`);

    // Cache metrics
    lines.push(`# HELP cache_hit_rate Cache hit rate`);
    lines.push(`# TYPE cache_hit_rate gauge`);
    lines.push(`cache_hit_rate ${this.metrics.cache.hitRate}`);

    return lines.join('\n');
  }
}

// Singleton instance
export const metricsCollector = new MetricsCollector();
