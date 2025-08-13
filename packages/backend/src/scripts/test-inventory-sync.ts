// packages/backend/src/scripts/test-inventory-sync.ts
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeMongoDB } from '../config/mongodb.js';
import { initializeRedis } from '../config/redis.js';
import { ServiceContainer } from '../services/ServiceContainer.js';
import { EnhancedInventorySyncJob } from '../jobs/EnhancedInventorySyncJob.js';
import { logger } from '../utils/logger.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '../../../.env') });

/**
 * Test script for Enhanced Inventory Sync
 */
async function testInventorySync() {
  let services: ServiceContainer | null = null;
  let syncJob: EnhancedInventorySyncJob | null = null;

  try {
    logger.info('🧪 Starting Inventory Sync Test...');
    
    // Initialize infrastructure
    logger.info('Initializing MongoDB...');
    await initializeMongoDB();
    
    logger.info('Initializing Redis...');
    await initializeRedis();
    
    // Initialize services
    logger.info('Initializing services...');
    const { getRedisClient } = await import('../config/redis.js');
    const redis = getRedisClient();
    services = await ServiceContainer.initialize(redis);
    
    // Create sync job
    logger.info('Creating Enhanced Inventory Sync Job...');
    syncJob = new EnhancedInventorySyncJob(services);
    
    // Test 1: Get current status
    logger.info('\n📊 Test 1: Getting sync status...');
    const status = await syncJob.getStatus();
    logger.info('Current status:', JSON.stringify(status, null, 2));
    
    // Test 2: Generate discrepancy report
    logger.info('\n📈 Test 2: Generating discrepancy report...');
    const report = await syncJob.getDiscrepancyReport();
    logger.info('Discrepancy report:', JSON.stringify(report, null, 2));
    
    // Test 3: Trigger manual sync
    logger.info('\n🔄 Test 3: Triggering manual sync...');
    const syncResult = await syncJob.triggerManualSync();
    logger.info('Sync result:', JSON.stringify(syncResult, null, 2));
    
    // Test 4: Test specific SKU sync (if you have a known SKU)
    const testSku = process.argv[2]; // Pass SKU as command line argument
    if (testSku) {
      logger.info(`\n🎯 Test 4: Syncing specific SKU: ${testSku}`);
      const skuResult = await syncJob.syncSpecificSku(testSku);
      logger.info('SKU sync result:', JSON.stringify(skuResult, null, 2));
    }
    
    // Test 5: Start the cron job and let it run for a minute
    if (process.argv.includes('--with-cron')) {
      logger.info('\n⏰ Test 5: Starting cron job (will run for 1 minute)...');
      syncJob.start();
      
      // Wait for 1 minute to see if cron executes
      await new Promise(resolve => setTimeout(resolve, 60000));
      
      // Get status after cron run
      const finalStatus = await syncJob.getStatus();
      logger.info('Final status after cron run:', JSON.stringify(finalStatus, null, 2));
      
      // Stop the cron job
      syncJob.stop();
    }
    
    logger.info('\n✅ All tests completed successfully!');
    
  } catch (error) {
    logger.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    if (syncJob) {
      syncJob.stop();
      await syncJob.cleanup();
    }
    
    // ServiceContainer doesn't have shutdown method, just clear reference
    services = null;
    
    // Close database connections
    const mongoose = await import('mongoose');
    await mongoose.connection.close();
    
    // Close Redis
    const { getRedisClient } = await import('../config/redis.js');
    const redis = getRedisClient();
    if (redis) {
      await redis.quit();
    }
    
    logger.info('🧹 Cleanup completed');
    process.exit(0);
  }
}

// Run the test
testInventorySync().catch(error => {
  logger.error('Unexpected error:', error);
  process.exit(1);
});

// Usage:
// npm run test:inventory-sync
// npm run test:inventory-sync YOUR_SKU
// npm run test:inventory-sync --with-cron