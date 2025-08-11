// packages/backend/src/test/factories/product.factory.ts
import { faker } from '@faker-js/faker';
import { ProductMapping } from '@/models/ProductMapping';

export const createProductMapping = (overrides = {}) => {
  return new ProductMapping({
    sku: faker.string.alphanumeric(10).toUpperCase(),
    naverProductId: faker.string.numeric(8),
    shopifyProductId: faker.string.numeric(10),
    shopifyVariantId: faker.string.numeric(12),
    shopifyInventoryItemId: faker.string.numeric(12),
    shopifyLocationId: faker.string.numeric(10),
    productName: faker.commerce.productName(),
    vendor: faker.company.name(),
    isActive: true,
    status: 'ACTIVE',
    syncStatus: 'synced',
    priceMargin: 0.1,
    ...overrides,
  });
};
