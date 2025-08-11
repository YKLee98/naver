// packages/backend/src/cluster.ts
import cluster, { Worker } from 'cluster';
import os from 'os';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

/**
 * Enterprise-grade Cluster Manager for horizontal scaling
 */
export class ClusterManager {
  private workerCount: number;
  private restartDelay: number = 1000;
  private maxRestarts: number = 5;
  private restartCounts: Map<number, number> = new Map();

  constructor() {
    this.workerCount = config.features.workerCount || os.cpus().length;
  }

  /**
   * Start the cluster
   */
  async start(): Promise<void> {
    if (!cluster.isPrimary) {
      throw new Error('ClusterManager can only be started from primary process');
    }

    logger.info(`🚀 Starting cluster with ${this.workerCount} workers`);

    // Setup cluster events
    this.setupClusterEvents();

    // Fork workers
    for (let i = 0; i < this.workerCount; i++) {
      this.forkWorker();
    }

    // Setup graceful shutdown
    this.setupGracefulShutdown();

    logger.info('✅ Cluster started successfully');
  }

  /**
   * Fork a new worker
   */
  private forkWorker(): void {
    const worker = cluster.fork();
    logger.info(`Worker ${worker.process.pid} started`);
  }

  /**
   * Setup cluster event handlers
   */
  private setupClusterEvents(): void {
    // Handle worker exit
    cluster.on('exit', (worker, code, signal) => {
      logger.error(
        `Worker ${worker.process.pid} died (${signal || code})`
      );

      // Track restart count
      const restartCount = this.restartCounts.get(worker.id) || 0;
      
      if (restartCount < this.maxRestarts) {
        logger.info(`Restarting worker...`);
        this.restartCounts.set(worker.id, restartCount + 1);
        
        // Delay restart to prevent rapid restart loops
        setTimeout(() => {
          this.forkWorker();
        }, this.restartDelay);
      } else {
        logger.error(
          `Worker ${worker.id} exceeded max restart attempts (${this.maxRestarts})`
        );
      }
    });

    // Handle worker online
    cluster.on('online', (worker) => {
      logger.info(`Worker ${worker.process.pid} is online`);
    });

    // Handle worker disconnect
    cluster.on('disconnect', (worker) => {
      logger.warn(`Worker ${worker.process.pid} disconnected`);
    });

    // Handle worker listening
    cluster.on('listening', (worker, address) => {
      logger.info(
        `Worker ${worker.process.pid} is listening on ${address.address}:${address.port}`
      );
    });

    // Handle worker message
    cluster.on('message', (worker, message) => {
      // Handle inter-process communication
      if (message.type === 'broadcast') {
        // Broadcast message to all workers
        for (const id in cluster.workers) {
          if (cluster.workers[id] && id !== worker.id.toString()) {
            cluster.workers[id]!.send(message);
          }
        }
      }
    });
  }

  /**
   * Setup graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);

      // Disconnect all workers
      for (const id in cluster.workers) {
        const worker = cluster.workers[id];
        if (worker) {
          worker.disconnect();
        }
      }

      // Wait for workers to exit
      setTimeout(() => {
        for (const id in cluster.workers) {
          const worker = cluster.workers[id];
          if (worker && !worker.isDead()) {
            worker.kill();
          }
        }
        process.exit(0);
      }, 10000); // 10 seconds timeout
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Perform rolling restart of all workers
   */
  async rollingRestart(): Promise<void> {
    const workers = Object.values(cluster.workers || {}).filter(Boolean) as Worker[];
    
    for (const worker of workers) {
      if (!worker) continue;
      
      logger.info(`Restarting worker ${worker.process.pid}...`);
      
      // Fork new worker before killing old one
      const newWorker = cluster.fork();
      
      // Wait for new worker to be ready
      await new Promise<void>((resolve) => {
        newWorker.once('listening', () => {
          // Kill old worker
          worker.disconnect();
          setTimeout(() => {
            if (!worker.isDead()) {
              worker.kill();
            }
          }, 5000);
          resolve();
        });
      });
      
      // Add delay between restarts
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    logger.info('✅ Rolling restart completed');
  }

  /**
   * Get cluster statistics
   */
  getStats(): {
    workers: number;
    activeWorkers: number;
    memory: NodeJS.MemoryUsage;
    uptime: number;
  } {
    const workers = Object.values(cluster.workers || {}).filter(Boolean) as Worker[];
    
    return {
      workers: this.workerCount,
      activeWorkers: workers.length,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
    };
  }
}

/**
 * Worker process handler
 */
export async function startWorker(): Promise<void> {
  try {
    // Import and start the server - server.js auto-starts
    await import('./server.js');
    
    // Setup worker-specific handlers
    process.on('message', (message: any) => {
      if (message === 'shutdown') {
        logger.info('Worker received shutdown signal');
        process.exit(0);
      }
    });

    logger.info(`Worker ${process.pid} started`);
  } catch (error) {
    logger.error('Worker startup failed:', error);
    process.exit(1);
  }
}

/**
 * Main cluster entry point
 */
export async function startCluster(): Promise<void> {
  if (cluster.isPrimary) {
    const manager = new ClusterManager();
    await manager.start();
  } else {
    await startWorker();
  }
}