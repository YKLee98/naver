#!/bin/bash
# Redis setup script for local development

set -e

log_info() {
    echo "[INFO] $1"
}

log_error() {
    echo "[ERROR] $1"
}

# Check if Redis is installed
if ! command -v redis-cli &> /dev/null; then
    log_error "Redis is not installed"
    log_info "Installing Redis..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        brew install redis
        brew services start redis
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        sudo apt-get update
        sudo apt-get install -y redis-server
        sudo systemctl start redis-server
    else
        log_error "Unsupported operating system"
        exit 1
    fi
fi

# Wait for Redis to be ready
log_info "Waiting for Redis to be ready..."
while ! redis-cli ping > /dev/null 2>&1; do
    sleep 1
done

log_info "Redis is ready"

# Set initial configuration
log_info "Configuring Redis..."
redis-cli CONFIG SET maxmemory 256mb
redis-cli CONFIG SET maxmemory-policy allkeys-lru

log_info "Redis setup completed"

// scripts/seed/seed-dev.js
// Development data seeding script
const { MongoClient } = require('mongodb');
const { faker } = require('@faker-js/faker');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hallyu-pomaholic';

async function seed() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db();
    
    // Clear existing data
    console.log('Clearing existing data...');
    await db.collection('productmappings').deleteMany({});
    await db.collection('inventorytransactions').deleteMany({});
    await db.collection('pricehistories').deleteMany({});
    await db.collection('exchangerates').deleteMany({});
    
    // Seed product mappings
    console.log('Seeding product mappings...');
    const productMappings = [];
    const vendors = ['BigHit', 'SM', 'YG', 'JYP', 'HYBE'];
    const categories = ['album', 'merch', 'photobook', 'lightstick'];
    
    for (let i = 1; i <= 50; i++) {
      const vendor = vendors[Math.floor(Math.random() * vendors.length)];
      const category = categories[Math.floor(Math.random() * categories.length)];
      
      productMappings.push({
        sku: `${category.toUpperCase()}-${vendor.toUpperCase()}-${i.toString().padStart(3, '0')}`,
        naverProductId: faker.number.int({ min: 10000000, max: 99999999 }).toString(),
        shopifyProductId: faker.number.int({ min: 1000000000, max: 9999999999 }).toString(),
        shopifyVariantId: faker.number.int({ min: 10000000000, max: 99999999999 }).toString(),
        shopifyInventoryItemId: faker.number.int({ min: 10000000000, max: 99999999999 }).toString(),
        shopifyLocationId: '12345678901',
        productName: faker.commerce.productName(),
        vendor: vendor,
        isActive: Math.random() > 0.1,
        status: Math.random() > 0.1 ? 'ACTIVE' : 'INACTIVE',
        lastSyncedAt: faker.date.recent({ days: 7 }),
        syncStatus: ['synced', 'pending', 'error'][Math.floor(Math.random() * 3)],
        priceMargin: 0.1 + Math.random() * 0.3,
        metadata: {
          naverCategory: category,
          shopifyTags: [category, vendor.toLowerCase(), 'kpop'],
        },
        createdAt: faker.date.past({ years: 1 }),
        updatedAt: faker.date.recent({ days: 30 }),
      });
    }
    
    await db.collection('productmappings').insertMany(productMappings);
    console.log(`Inserted ${productMappings.length} product mappings`);
    
    // Seed inventory transactions
    console.log('Seeding inventory transactions...');
    const inventoryTransactions = [];
    
    for (const mapping of productMappings.slice(0, 20)) {
      // Generate 5-10 transactions per product
      const transactionCount = faker.number.int({ min: 5, max: 10 });
      
      for (let i = 0; i < transactionCount; i++) {
        const transactionType = ['sale', 'restock', 'adjustment', 'sync'][Math.floor(Math.random() * 4)];
        const platform = ['naver', 'shopify'][Math.floor(Math.random() * 2)];
        const quantity = transactionType === 'sale' 
          ? -faker.number.int({ min: 1, max: 5 })
          : faker.number.int({ min: 10, max: 50 });
        
        inventoryTransactions.push({
          sku: mapping.sku,
          platform,
          transactionType,
          quantity,
          previousQuantity: faker.number.int({ min: 0, max: 100 }),
          newQuantity: faker.number.int({ min: 0, max: 100 }),
          orderId: transactionType === 'sale' ? faker.string.numeric(10) : undefined,
          reason: transactionType === 'adjustment' ? faker.lorem.sentence() : undefined,
          performedBy: ['system', 'manual', 'webhook'][Math.floor(Math.random() * 3)],
          syncStatus: 'completed',
          syncedAt: faker.date.recent({ days: 7 }),
          createdAt: faker.date.recent({ days: 30 }),
          updatedAt: faker.date.recent({ days: 30 }),
        });
      }
    }
    
    await db.collection('inventorytransactions').insertMany(inventoryTransactions);
    console.log(`Inserted ${inventoryTransactions.length} inventory transactions`);
    
    // Seed price histories
    console.log('Seeding price histories...');
    const priceHistories = [];
    
    for (const mapping of productMappings.slice(0, 20)) {
      // Generate 3-5 price changes per product
      const priceChangeCount = faker.number.int({ min: 3, max: 5 });
      
      for (let i = 0; i < priceChangeCount; i++) {
        const naverPrice = faker.number.int({ min: 10000, max: 100000 });
        const exchangeRate = 1300 + faker.number.int({ min: -50, max: 50 });
        
        priceHistories.push({
          sku: mapping.sku,
          naverPrice,
          exchangeRate,
          calculatedShopifyPrice: naverPrice / exchangeRate * (1 + mapping.priceMargin),
          finalShopifyPrice: naverPrice / exchangeRate * (1 + mapping.priceMargin),
          priceMargin: mapping.priceMargin,
          currency: 'USD',
          syncStatus: 'completed',
          syncedAt: faker.date.recent({ days: 7 }),
          createdAt: faker.date.recent({ days: 30 }),
          updatedAt: faker.date.recent({ days: 30 }),
        });
      }
    }
    
    await db.collection('pricehistories').insertMany(priceHistories);
    console.log(`Inserted ${priceHistories.length} price histories`);
    
    // Seed exchange rates
    console.log('Seeding exchange rates...');
    const exchangeRates = [];
    const now = new Date();
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      exchangeRates.push({
        rate: 1300 + faker.number.int({ min: -50, max: 50 }),
        fromCurrency: 'KRW',
        toCurrency: 'USD',
        source: 'exchangerate-api',
        validFrom: new Date(date.setHours(0, 0, 0, 0)),
        validTo: new Date(date.setHours(23, 59, 59, 999)),
        createdAt: date,
        updatedAt: date,
      });
    }
    
    await db.collection('exchangerates').insertMany(exchangeRates);
    console.log(`Inserted ${exchangeRates.length} exchange rates`);
    
    console.log('Seeding completed successfully');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Run seeding
seed();
