// packages/backend/src/models/PriceSyncRule.ts
import { Schema, model, Document } from 'mongoose';

export interface IPriceSyncRule extends Document {
  name: string;
  type: 'category' | 'sku' | 'brand' | 'price_range';
  value: string;
  marginRate: number;
  priority: number;
  enabled: boolean;
  conditions?: {
    minPrice?: number;
    maxPrice?: number;
    tags?: string[];
  };
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const PriceSyncRuleSchema = new Schema<IPriceSyncRule>({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['category', 'sku', 'brand', 'price_range']
  },
  value: {
    type: String,
    required: true
  },
  marginRate: {
    type: Number,
    required: true,
    min: 0.01,
    max: 10
  },
  priority: {
    type: Number,
    default: 0,
    index: true
  },
  enabled: {
    type: Boolean,
    default: true,
    index: true
  },
  conditions: {
    minPrice: Number,
    maxPrice: Number,
    tags: [String]
  },
  createdBy: {
    type: String,
    required: true
  },
  updatedBy: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// 복합 인덱스
PriceSyncRuleSchema.index({ type: 1, enabled: 1, priority: -1 });

export const PriceSyncRule = model<IPriceSyncRule>('PriceSyncRule', PriceSyncRuleSchema);
