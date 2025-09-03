export interface PerformanceMetrics {
  fcp?: number;
  lcp?: number;
  fid?: number;
  cls?: number;
  ttfb?: number;
  inp?: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {};
  private observers: Map<string, PerformanceObserver> = new Map();

  constructor() {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      this.initializeObservers();
    }
  }

  private initializeObservers() {
    this.observePaint();
    this.observeLCP();
    this.observeFID();
    this.observeCLS();
    this.observeINP();
    this.measureTTFB();
  }

  private observePaint() {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            this.metrics.fcp = Math.round(entry.startTime);
            this.logMetric('FCP', this.metrics.fcp);
          }
        }
      });
      observer.observe({ entryTypes: ['paint'] });
      this.observers.set('paint', observer);
    } catch (error) {
      console.error('Failed to observe paint metrics:', error);
    }
  }

  private observeLCP() {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          this.metrics.lcp = Math.round(lastEntry.startTime);
          this.logMetric('LCP', this.metrics.lcp);
        }
      });
      observer.observe({ entryTypes: ['largest-contentful-paint'] });
      this.observers.set('lcp', observer);
    } catch (error) {
      console.error('Failed to observe LCP:', error);
    }
  }

  private observeFID() {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-input') {
            const fidEntry = entry as any;
            this.metrics.fid = Math.round(fidEntry.processingStart - fidEntry.startTime);
            this.logMetric('FID', this.metrics.fid);
          }
        }
      });
      observer.observe({ entryTypes: ['first-input'] });
      this.observers.set('fid', observer);
    } catch (error) {
      console.error('Failed to observe FID:', error);
    }
  }

  private observeCLS() {
    try {
      let clsValue = 0;
      let clsEntries: PerformanceEntry[] = [];

      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            const layoutShiftEntry = entry as any;
            clsValue += layoutShiftEntry.value;
            clsEntries.push(entry);
          }
        }
        this.metrics.cls = Math.round(clsValue * 1000) / 1000;
        this.logMetric('CLS', this.metrics.cls);
      });
      observer.observe({ entryTypes: ['layout-shift'] });
      this.observers.set('cls', observer);
    } catch (error) {
      console.error('Failed to observe CLS:', error);
    }
  }

  private observeINP() {
    try {
      let worstINP = 0;

      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'event' || entry.entryType === 'first-input') {
            const eventEntry = entry as any;
            const inputDelay = eventEntry.processingStart - eventEntry.startTime;
            const processingTime = eventEntry.processingEnd - eventEntry.processingStart;
            const presentationDelay = eventEntry.startTime + eventEntry.duration - eventEntry.processingEnd;
            const inp = inputDelay + processingTime + presentationDelay;

            if (inp > worstINP) {
              worstINP = inp;
              this.metrics.inp = Math.round(worstINP);
              this.logMetric('INP', this.metrics.inp);
            }
          }
        }
      });
      observer.observe({ entryTypes: ['event', 'first-input'] });
      this.observers.set('inp', observer);
    } catch (error) {
      console.error('Failed to observe INP:', error);
    }
  }

  private measureTTFB() {
    try {
      const navigationTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigationTiming) {
        this.metrics.ttfb = Math.round(navigationTiming.responseStart - navigationTiming.fetchStart);
        this.logMetric('TTFB', this.metrics.ttfb);
      }
    } catch (error) {
      console.error('Failed to measure TTFB:', error);
    }
  }

  private logMetric(name: string, value: number) {
    if (import.meta.env.DEV) {
      console.log(`[Performance] ${name}: ${value}ms`);
    }
    
    if (window.gtag && import.meta.env.VITE_GA_TRACKING_ID) {
      window.gtag('event', 'web_vitals', {
        event_category: 'Performance',
        event_label: name,
        value: value,
        metric_name: name,
        metric_value: value,
      });
    }
  }

  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  public reportMetrics() {
    const metrics = this.getMetrics();
    console.table(metrics);
    
    // Metrics reporting disabled - endpoint not available
    /*
    if (import.meta.env.VITE_API_URL) {
      fetch(`${import.meta.env.VITE_API_URL}/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metrics,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href,
        }),
      }).catch(() => {
        // Metrics endpoint may not exist, ignore errors silently
      });
    }
    */
  }

  public destroy() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
  }
}

export const performanceMonitor = new PerformanceMonitor();

export const measurePerformance = (name: string, fn: () => void | Promise<void>) => {
  const startTime = performance.now();
  const result = fn();
  
  if (result instanceof Promise) {
    return result.finally(() => {
      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);
      if (import.meta.env.DEV) {
        console.log(`[Performance] ${name}: ${duration}ms`);
      }
    });
  } else {
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);
    if (import.meta.env.DEV) {
      console.log(`[Performance] ${name}: ${duration}ms`);
    }
  }
};