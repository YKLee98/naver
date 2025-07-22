// packages/backend/src/test/integration/sync.test.ts
import request from 'supertest';
import { app } from '@/app';
import { ProductMapping } from '@/models/ProductMapping';
import { createProductMapping } from '../factories/product.factory';

describe('Sync API', () => {
  describe('POST /api/v1/sync/full', () => {
    it('should start a full sync', async () => {
      // Create test data
      await createProductMapping().save();

      const response = await request(app)
        .post('/api/v1/sync/full')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('jobId');
      expect(response.body.data.status).toBe('started');
    });

    it('should return error if sync is already running', async () => {
      // Mock sync in progress
      jest.spyOn(SyncService.prototype, 'isSyncRunning').mockResolvedValue(true);

      const response = await request(app)
        .post('/api/v1/sync/full')
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('SYNC_IN_PROGRESS');
    });
  });
});
