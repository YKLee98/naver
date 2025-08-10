// packages/backend/src/models/base/BaseModel.ts
import { Document, Model, FilterQuery, UpdateQuery, QueryOptions } from 'mongoose';
import { logger } from '../../utils/logger.js';

export interface IBaseDocument extends Document {
  createdAt: Date;
  updatedAt: Date;
  _deleted?: boolean;
  _deletedAt?: Date;
  _deletedBy?: string;
}

export interface IBaseModel<T extends IBaseDocument> extends Model<T> {
  findByIdActive(id: string): Promise<T | null>;
  findActive(filter?: FilterQuery<T>): Promise<T[]>;
  findOneActive(filter: FilterQuery<T>): Promise<T | null>;
  softDelete(id: string, userId?: string): Promise<T | null>;
  restore(id: string): Promise<T | null>;
  findWithPagination(
    filter: FilterQuery<T>,
    page: number,
    limit: number,
    sort?: any
  ): Promise<{
    docs: T[];
    total: number;
    page: number;
    pages: number;
    limit: number;
  }>;
}

export class BaseModelHelper {
  static addSoftDeleteMethods<T extends IBaseDocument>(schema: any): void {
    // Add soft delete fields
    schema.add({
      _deleted: {
        type: Boolean,
        default: false,
        index: true
      },
      _deletedAt: Date,
      _deletedBy: String
    });

    // Static method: Find active documents
    schema.statics.findActive = async function(filter: FilterQuery<T> = {}) {
      return this.find({ ...filter, _deleted: { $ne: true } });
    };

    // Static method: Find one active document
    schema.statics.findOneActive = async function(filter: FilterQuery<T>) {
      return this.findOne({ ...filter, _deleted: { $ne: true } });
    };

    // Static method: Find by ID (active only)
    schema.statics.findByIdActive = async function(id: string) {
      return this.findOne({ _id: id, _deleted: { $ne: true } });
    };

    // Static method: Soft delete
    schema.statics.softDelete = async function(id: string, userId?: string) {
      return this.findByIdAndUpdate(
        id,
        {
          _deleted: true,
          _deletedAt: new Date(),
          _deletedBy: userId || 'system'
        },
        { new: true }
      );
    };

    // Static method: Restore
    schema.statics.restore = async function(id: string) {
      return this.findByIdAndUpdate(
        id,
        {
          $unset: { _deleted: 1, _deletedAt: 1, _deletedBy: 1 }
        },
        { new: true }
      );
    };

    // Static method: Pagination
    schema.statics.findWithPagination = async function(
      filter: FilterQuery<T> = {},
      page: number = 1,
      limit: number = 10,
      sort: any = { createdAt: -1 }
    ) {
      const skip = (page - 1) * limit;
      
      const [docs, total] = await Promise.all([
        this.find({ ...filter, _deleted: { $ne: true } })
          .sort(sort)
          .skip(skip)
          .limit(limit),
        this.countDocuments({ ...filter, _deleted: { $ne: true } })
      ]);

      return {
        docs,
        total,
        page,
        pages: Math.ceil(total / limit),
        limit
      };
    };

    // Pre-save middleware for validation
    schema.pre('save', function(next: any) {
      const doc = this as any;
      
      // Log document creation
      if (doc.isNew) {
        logger.debug(`Creating new ${doc.constructor.modelName} document`);
      }
      
      next();
    });

    // Post-save middleware
    schema.post('save', function(doc: any) {
      logger.debug(`${doc.constructor.modelName} document saved:`, doc._id);
    });

    // Error handling middleware
    schema.post('save', function(error: any, doc: any, next: any) {
      if (error.name === 'MongoError' && error.code === 11000) {
        logger.error(`Duplicate key error in ${doc.constructor.modelName}:`, error);
        next(new Error('Duplicate key error'));
      } else {
        next(error);
      }
    });
  }

  static addTimestamps(schema: any): void {
    schema.set('timestamps', true);
  }

  static addVersioning(schema: any): void {
    schema.set('versionKey', '__v');
    schema.set('optimisticConcurrency', true);
  }

  static addToJSON(schema: any): void {
    schema.set('toJSON', {
      virtuals: true,
      transform: function(doc: any, ret: any) {
        delete ret.__v;
        delete ret._deleted;
        delete ret._deletedAt;
        delete ret._deletedBy;
        return ret;
      }
    });
  }

  static addToObject(schema: any): void {
    schema.set('toObject', {
      virtuals: true,
      transform: function(doc: any, ret: any) {
        delete ret.__v;
        return ret;
      }
    });
  }

  static initializeSchema(schema: any): void {
    this.addTimestamps(schema);
    this.addVersioning(schema);
    this.addSoftDeleteMethods(schema);
    this.addToJSON(schema);
    this.addToObject(schema);
  }
}