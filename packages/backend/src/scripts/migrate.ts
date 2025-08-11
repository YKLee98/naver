import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  ProductMapping,
  InventoryTransaction,
  PriceHistory,
  ExchangeRate,
  OrderSyncStatus,
  SystemLog,
} from '../models';
import { logger } from '../utils/logger';

interface Migration {
  version: string;
  name: string;
  up: () => Promise<void>;
  down: () => Promise<void>;
}

class MigrationRunner {
  private migrations: Migration[] = [
    {
      version: '001',
      name: 'add_indexes',
      up: async () => {
        logger.info('Creating indexes...');

        // ProductMapping 인덱스
        await ProductMapping.collection.createIndex({ sku: 1, vendor: 1 });
        await ProductMapping.collection.createIndex({
          syncStatus: 1,
          lastSyncedAt: -1,
        });

        // InventoryTransaction 인덱스
        await InventoryTransaction.collection.createIndex({
          sku: 1,
          createdAt: -1,
        });
        await InventoryTransaction.collection.createIndex({
          orderId: 1,
          orderLineItemId: 1,
        });

        // PriceHistory 인덱스
        await PriceHistory.collection.createIndex({ sku: 1, createdAt: -1 });

        // OrderSyncStatus 인덱스
        await OrderSyncStatus.collection.createIndex({
          platform: 1,
          orderDate: -1,
        });

        logger.info('Indexes created successfully');
      },
      down: async () => {
        // 인덱스 제거는 위험하므로 구현하지 않음
        logger.warn('Index removal not implemented');
      },
    },
    {
      version: '002',
      name: 'add_ttl_indexes',
      up: async () => {
        logger.info('Creating TTL indexes...');

        // SystemLog TTL 인덱스 (30일)
        await SystemLog.collection.createIndex(
          { createdAt: 1 },
          { expireAfterSeconds: 2592000 }
        );

        // ExchangeRate TTL 인덱스
        await ExchangeRate.collection.createIndex(
          { validUntil: 1 },
          { expireAfterSeconds: 0 }
        );

        logger.info('TTL indexes created successfully');
      },
      down: async () => {
        logger.warn('TTL index removal not implemented');
      },
    },
    {
      version: '003',
      name: 'update_product_mapping_schema',
      up: async () => {
        logger.info('Updating ProductMapping schema...');

        // 기존 문서에 새 필드 추가
        await ProductMapping.updateMany(
          { priceMargin: { $exists: false } },
          { $set: { priceMargin: 1.15 } }
        );

        await ProductMapping.updateMany(
          { vendor: { $exists: false } },
          { $set: { vendor: 'album' } }
        );

        logger.info('ProductMapping schema updated');
      },
      down: async () => {
        // 필드 제거
        await ProductMapping.updateMany(
          {},
          { $unset: { priceMargin: '', vendor: '' } }
        );
      },
    },
    {
      version: '004',
      name: 'create_migration_collection',
      up: async () => {
        logger.info('Creating migrations collection...');

        const db = ProductMapping.db;
        const collections = await db
          .listCollections({ name: 'migrations' })
          .toArray();

        if (collections.length === 0) {
          await db.createCollection('migrations');
        }

        logger.info('Migrations collection created');
      },
      down: async () => {
        const db = ProductMapping.db;
        await db.dropCollection('migrations');
      },
    },
  ];

  async run(): Promise<void> {
    logger.info('Starting migration runner...');

    const db = ProductMapping.db;
    const migrationCollection = db.collection('migrations');

    // 실행된 마이그레이션 조회
    const executedMigrations = await migrationCollection.find({}).toArray();
    const executedVersions = new Set(executedMigrations.map((m) => m.version));

    // 실행되지 않은 마이그레이션 찾기
    const pendingMigrations = this.migrations.filter(
      (m) => !executedVersions.has(m.version)
    );

    if (pendingMigrations.length === 0) {
      logger.info('No pending migrations');
      return;
    }

    logger.info(`Found ${pendingMigrations.length} pending migrations`);

    // 마이그레이션 실행
    for (const migration of pendingMigrations) {
      logger.info(`Running migration ${migration.version}: ${migration.name}`);

      try {
        await migration.up();

        // 마이그레이션 기록
        await migrationCollection.insertOne({
          version: migration.version,
          name: migration.name,
          executedAt: new Date(),
        });

        logger.info(`Migration ${migration.version} completed`);
      } catch (error) {
        logger.error(`Migration ${migration.version} failed:`, error);
        throw error;
      }
    }

    logger.info('All migrations completed');
  }

  async rollback(version?: string): Promise<void> {
    logger.info('Starting migration rollback...');

    const db = ProductMapping.db;
    const migrationCollection = db.collection('migrations');

    let migrationsToRollback: Migration[];

    if (version) {
      // 특정 버전까지 롤백
      const executedMigrations = await migrationCollection
        .find({ version: { $gt: version } })
        .sort({ version: -1 })
        .toArray();

      migrationsToRollback = this.migrations.filter((m) =>
        executedMigrations.some((em) => em.version === m.version)
      );
    } else {
      // 마지막 마이그레이션 롤백
      const lastMigration = await migrationCollection.findOne(
        {},
        { sort: { version: -1 } }
      );

      if (!lastMigration) {
        logger.info('No migrations to rollback');
        return;
      }

      migrationsToRollback = this.migrations.filter(
        (m) => m.version === lastMigration.version
      );
    }

    // 롤백 실행
    for (const migration of migrationsToRollback.reverse()) {
      logger.info(
        `Rolling back migration ${migration.version}: ${migration.name}`
      );

      try {
        await migration.down();

        // 마이그레이션 기록 삭제
        await migrationCollection.deleteOne({ version: migration.version });

        logger.info(`Rollback ${migration.version} completed`);
      } catch (error) {
        logger.error(`Rollback ${migration.version} failed:`, error);
        throw error;
      }
    }

    logger.info('Rollback completed');
  }

  async status(): Promise<void> {
    const db = ProductMapping.db;
    const migrationCollection = db.collection('migrations');

    const executedMigrations = await migrationCollection.find({}).toArray();
    const executedVersions = new Set(executedMigrations.map((m) => m.version));

    logger.info('Migration Status:');
    logger.info('=================');

    this.migrations.forEach((migration) => {
      const status = executedVersions.has(migration.version) ? '✓' : ' ';
      const executed = executedMigrations.find(
        (m) => m.version === migration.version
      );
      const executedAt = executed
        ? executed.executedAt.toISOString()
        : 'Not executed';

      logger.info(
        `[${status}] ${migration.version} - ${migration.name} (${executedAt})`
      );
    });
  }
}

// CLI 실행
async function main() {
  const command = process.argv[2];
  const version = process.argv[3];

  try {
    await connectDatabase();

    const runner = new MigrationRunner();

    switch (command) {
      case 'up':
        await runner.run();
        break;
      case 'down':
        await runner.rollback(version);
        break;
      case 'status':
        await runner.status();
        break;
      default:
        console.log(`
Usage: npm run migrate [command] [options]

Commands:
  up        Run pending migrations
  down      Rollback migrations
  status    Show migration status

Examples:
  npm run migrate up
  npm run migrate down
  npm run migrate down 002
  npm run migrate status
        `);
    }
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await disconnectDatabase();
    process.exit(0);
  }
}

main();
