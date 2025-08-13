// packages/backend/src/scripts/fix-inventory-transaction-index.ts
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { logger } from '../utils/logger.js';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function fixInventoryTransactionIndex() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ERP_NAVER';
    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('inventory_transactions');

    // List existing indexes
    const indexes = await collection.indexes();
    logger.info('Current indexes:', indexes.map(idx => ({ name: idx.name, key: idx.key })));

    // Find the problematic index
    const problematicIndex = indexes.find(idx => 
      idx.key?.orderId === 1 && 
      idx.key?.orderLineItemId === 1 && 
      idx.key?.transactionType === 1
    );

    if (problematicIndex) {
      logger.info(`Found problematic index: ${problematicIndex.name}`);
      
      // Drop the old index
      await collection.dropIndex(problematicIndex.name);
      logger.info(`Dropped index: ${problematicIndex.name}`);
    }

    // Create the new index with partialFilterExpression
    // This index will only apply to documents where orderId exists
    // Note: Cannot use $ne in partialFilterExpression, only $exists
    await collection.createIndex(
      { orderId: 1, orderLineItemId: 1, transactionType: 1 },
      {
        unique: true,
        partialFilterExpression: {
          orderId: { $exists: true }
        },
        name: 'unique_order_transaction'
      }
    );
    logger.info('Created new index with partialFilterExpression');

    // Verify the new indexes
    const newIndexes = await collection.indexes();
    logger.info('Updated indexes:', newIndexes.map(idx => ({ 
      name: idx.name, 
      key: idx.key,
      partialFilterExpression: idx.partialFilterExpression 
    })));

    logger.info('✅ Index fix completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Failed to fix index:', error);
    process.exit(1);
  }
}

// Run the script
fixInventoryTransactionIndex();