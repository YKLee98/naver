// scripts/mongo-init.js
// MongoDB 초기화 스크립트
db = db.getSiblingDB('hallyu-pomaholic');

// Create collections
db.createCollection('productmappings');
db.createCollection('inventorytransactions');
db.createCollection('pricehistories');
db.createCollection('exchangerates');
db.createCollection('ordersyncstatuses');
db.createCollection('systemlogs');
db.createCollection('conflictlogs');

// Create indexes
// ProductMapping indexes
db.productmappings.createIndex({ sku: 1 }, { unique: true });
db.productmappings.createIndex({ naverProductId: 1 });
db.productmappings.createIndex({ shopifyProductId: 1 });
db.productmappings.createIndex({ isActive: 1, syncStatus: 1 });
db.productmappings.createIndex({ lastSyncedAt: -1 });
db.productmappings.createIndex({ vendor: 1 });

// InventoryTransaction indexes
db.inventorytransactions.createIndex({ sku: 1, createdAt: -1 });
db.inventorytransactions.createIndex({ platform: 1, transactionType: 1 });
db.inventorytransactions.createIndex({ orderId: 1 });
db.inventorytransactions.createIndex({ syncStatus: 1 });
db.inventorytransactions.createIndex({ createdAt: -1 });

// PriceHistory indexes
db.pricehistories.createIndex({ sku: 1, createdAt: -1 });
db.pricehistories.createIndex({ syncStatus: 1 });
db.pricehistories.createIndex({ createdAt: -1 });

// ExchangeRate indexes
db.exchangerates.createIndex({ fromCurrency: 1, toCurrency: 1, createdAt: -1 });
db.exchangerates.createIndex({ validFrom: 1, validTo: 1 });

// OrderSyncStatus indexes
db.ordersyncstatuses.createIndex({ naverOrderId: 1 }, { unique: true });
db.ordersyncstatuses.createIndex({ shopifyOrderId: 1 });
db.ordersyncstatuses.createIndex({ syncStatus: 1 });
db.ordersyncstatuses.createIndex({ createdAt: -1 });

// SystemLog indexes
db.systemlogs.createIndex({ level: 1, category: 1 });
db.systemlogs.createIndex({ createdAt: -1 });
db.systemlogs.createIndex({ userId: 1 });

// ConflictLog indexes
db.conflictlogs.createIndex({ sku: 1, resolvedAt: -1 });
db.conflictlogs.createIndex({ type: 1, resolved: 1 });
db.conflictlogs.createIndex({ createdAt: -1 });

// Create admin user
db.createUser({
  user: 'hallyu_admin',
  pwd: process.env.MONGO_ADMIN_PASSWORD || 'changeme',
  roles: [
    {
      role: 'readWrite',
      db: 'hallyu-pomaholic'
    }
  ]
});

print('MongoDB initialization completed');

