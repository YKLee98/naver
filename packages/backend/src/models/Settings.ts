// packages/backend/src/models/Settings.ts
import { Schema, model, Document, Types } from 'mongoose';
import { encrypt, decrypt } from '@/utils/crypto';
import { logger } from '@/utils/logger';

/**
 * Settings Categories
 */
export enum SettingsCategory {
  API = 'api',
  SYNC = 'sync',
  NOTIFICATION = 'notification',
  GENERAL = 'general',
  PRICING = 'pricing',
  INVENTORY = 'inventory',
  SECURITY = 'security',
  FEATURE_FLAGS = 'feature_flags'
}

/**
 * Settings Value Types
 */
export enum SettingsValueType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  JSON = 'json',
  ENCRYPTED = 'encrypted',
  ARRAY = 'array'
}

/**
 * Interface for Settings Document
 */
export interface ISettings extends Document {
  _id: Types.ObjectId;
  key: string;
  value: any;
  category: SettingsCategory;
  valueType: SettingsValueType;
  displayName: string;
  description?: string;
  isEncrypted: boolean;
  isPublic: boolean;
  isEditable: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: any[];
    required?: boolean;
    customValidator?: string;
  };
  metadata?: {
    lastModifiedBy?: string;
    lastModifiedReason?: string;
    previousValues?: Array<{
      value: any;
      changedAt: Date;
      changedBy: string;
    }>;
    relatedSettings?: string[];
    tags?: string[];
  };
  defaultValue?: any;
  group?: string;
  order?: number;
  deprecated?: boolean;
  deprecationMessage?: string;
  effectiveDate?: Date;
  expiryDate?: Date;
  version: number;

  // Instance methods
  getValue(): any;
  setValue(value: any, userId?: string, reason?: string): Promise<void>;
  validateValue(value: any): boolean;
  resetToDefault(userId?: string): Promise<void>;
  getDecryptedValue(): any;
  isExpired(): boolean;
  isEffective(): boolean;
  addToHistory(value: any, userId: string): void;
}

/**
 * Interface for Settings Model Static Methods
 */
export interface ISettingsModel {
  getByKey(key: string): Promise<ISettings | null>;
  getByCategory(category: SettingsCategory): Promise<ISettings[]>;
  getBulk(keys: string[]): Promise<Map<string, any>>;
  setBulk(settings: Array<{ key: string; value: any; userId?: string }>): Promise<void>;
  getPublicSettings(): Promise<ISettings[]>;
  getEffectiveSettings(): Promise<ISettings[]>;
  exportSettings(category?: SettingsCategory): Promise<Record<string, any>>;
  importSettings(data: Record<string, any>, userId: string): Promise<void>;
}

/**
 * Settings Schema Definition
 */
const settingsSchema = new Schema<ISettings>(
  {
    key: {
      type: String,
      required: [true, 'Settings key is required'],
      unique: true,
      trim: true,
      index: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Z][A-Z0-9_]*$/.test(v);
        },
        message: 'Settings key must be uppercase with underscores (e.g., API_KEY)'
      }
    },
    value: {
      type: Schema.Types.Mixed,
      required: [true, 'Settings value is required']
    },
    category: {
      type: String,
      enum: Object.values(SettingsCategory),
      required: [true, 'Settings category is required'],
      index: true
    },
    valueType: {
      type: String,
      enum: Object.values(SettingsValueType),
      required: [true, 'Value type is required'],
      default: SettingsValueType.STRING
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    isEncrypted: {
      type: Boolean,
      default: false,
      index: true
    },
    isPublic: {
      type: Boolean,
      default: false,
      index: true
    },
    isEditable: {
      type: Boolean,
      default: true
    },
    validation: {
      min: Number,
      max: Number,
      pattern: String,
      enum: [Schema.Types.Mixed],
      required: Boolean,
      customValidator: String
    },
    metadata: {
      lastModifiedBy: {
        type: String,
        default: 'system'
      },
      lastModifiedReason: String,
      previousValues: [{
        value: Schema.Types.Mixed,
        changedAt: {
          type: Date,
          default: Date.now
        },
        changedBy: {
          type: String,
          required: true
        }
      }],
      relatedSettings: [String],
      tags: [String]
    },
    defaultValue: Schema.Types.Mixed,
    group: {
      type: String,
      index: true
    },
    order: {
      type: Number,
      default: 0
    },
    deprecated: {
      type: Boolean,
      default: false,
      index: true
    },
    deprecationMessage: String,
    effectiveDate: {
      type: Date,
      index: true
    },
    expiryDate: {
      type: Date,
      index: true
    },
    version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: function(doc, ret) {
        // Hide encrypted values in JSON output
        if (doc.isEncrypted && ret.value) {
          ret.value = '***ENCRYPTED***';
        }
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Indexes
settingsSchema.index({ key: 1, category: 1 });
settingsSchema.index({ category: 1, group: 1, order: 1 });
settingsSchema.index({ isPublic: 1, isEditable: 1 });
settingsSchema.index({ effectiveDate: 1, expiryDate: 1 });

// Instance Methods
settingsSchema.methods.getValue = function(): any {
  if (this.isEncrypted && this.value) {
    return this.getDecryptedValue();
  }

  // Type conversion based on valueType
  switch (this.valueType) {
    case SettingsValueType.NUMBER:
      return Number(this.value);
    case SettingsValueType.BOOLEAN:
      return Boolean(this.value);
    case SettingsValueType.JSON:
      return typeof this.value === 'string' ? JSON.parse(this.value) : this.value;
    case SettingsValueType.ARRAY:
      return Array.isArray(this.value) ? this.value : [this.value];
    default:
      return this.value;
  }
};

settingsSchema.methods.setValue = async function(
  value: any,
  userId: string = 'system',
  reason?: string
): Promise<void> {
  if (!this.isEditable) {
    throw new Error(`Setting ${this.key} is not editable`);
  }

  if (!this.validateValue(value)) {
    throw new Error(`Invalid value for setting ${this.key}`);
  }

  // Add current value to history
  this.addToHistory(this.value, userId);

  // Set new value
  if (this.isEncrypted) {
    this.value = encrypt(value.toString());
  } else if (this.valueType === SettingsValueType.JSON && typeof value === 'object') {
    this.value = JSON.stringify(value);
  } else {
    this.value = value;
  }

  // Update metadata
  if (!this.metadata) {
    this.metadata = {};
  }
  this.metadata.lastModifiedBy = userId;
  this.metadata.lastModifiedReason = reason;

  await this.save();
  
  logger.info(`Setting ${this.key} updated by ${userId}`, {
    key: this.key,
    userId,
    reason
  });
};

settingsSchema.methods.validateValue = function(value: any): boolean {
  if (!this.validation) return true;

  try {
    // Required check
    if (this.validation.required && (value === null || value === undefined || value === '')) {
      return false;
    }

    // Type-specific validation
    switch (this.valueType) {
      case SettingsValueType.NUMBER:
        const numValue = Number(value);
        if (isNaN(numValue)) return false;
        if (this.validation.min !== undefined && numValue < this.validation.min) return false;
        if (this.validation.max !== undefined && numValue > this.validation.max) return false;
        break;

      case SettingsValueType.STRING:
      case SettingsValueType.ENCRYPTED:
        const strValue = value.toString();
        if (this.validation.pattern && !new RegExp(this.validation.pattern).test(strValue)) {
          return false;
        }
        if (this.validation.min !== undefined && strValue.length < this.validation.min) return false;
        if (this.validation.max !== undefined && strValue.length > this.validation.max) return false;
        break;

      case SettingsValueType.ARRAY:
        if (!Array.isArray(value)) return false;
        break;

      case SettingsValueType.JSON:
        if (typeof value === 'string') {
          try {
            JSON.parse(value);
          } catch {
            return false;
          }
        }
        break;
    }

    // Enum validation
    if (this.validation.enum && this.validation.enum.length > 0) {
      if (!this.validation.enum.includes(value)) {
        return false;
      }
    }

    // Custom validator (if implemented)
    if (this.validation.customValidator) {
      // This would call a custom validation function
      // Implementation depends on your validation strategy
    }

    return true;
  } catch (error) {
    logger.error(`Validation error for setting ${this.key}:`, error);
    return false;
  }
};

settingsSchema.methods.resetToDefault = async function(userId: string = 'system'): Promise<void> {
  if (this.defaultValue !== undefined) {
    await this.setValue(this.defaultValue, userId, 'Reset to default');
  }
};

settingsSchema.methods.getDecryptedValue = function(): any {
  if (!this.isEncrypted || !this.value) {
    return this.value;
  }

  try {
    return decrypt(this.value);
  } catch (error) {
    logger.error(`Failed to decrypt setting ${this.key}:`, error);
    throw new Error('Failed to decrypt setting value');
  }
};

settingsSchema.methods.isExpired = function(): boolean {
  return this.expiryDate ? new Date() > this.expiryDate : false;
};

settingsSchema.methods.isEffective = function(): boolean {
  const now = new Date();
  const isAfterEffective = !this.effectiveDate || now >= this.effectiveDate;
  const isBeforeExpiry = !this.expiryDate || now <= this.expiryDate;
  return isAfterEffective && isBeforeExpiry;
};

settingsSchema.methods.addToHistory = function(value: any, userId: string): void {
  if (!this.metadata) {
    this.metadata = {};
  }
  
  if (!this.metadata.previousValues) {
    this.metadata.previousValues = [];
  }

  // Keep only last 20 history entries
  if (this.metadata.previousValues.length >= 20) {
    this.metadata.previousValues = this.metadata.previousValues.slice(-19);
  }

  this.metadata.previousValues.push({
    value: this.isEncrypted ? '***ENCRYPTED***' : value,
    changedAt: new Date(),
    changedBy: userId
  });
};

// Static Methods
settingsSchema.statics.getByKey = async function(key: string): Promise<ISettings | null> {
  const setting = await this.findOne({ key: key.toUpperCase() });
  if (setting && setting.isExpired()) {
    logger.warn(`Setting ${key} has expired`);
  }
  return setting;
};

settingsSchema.statics.getByCategory = async function(category: SettingsCategory): Promise<ISettings[]> {
  return this.find({ 
    category,
    deprecated: { $ne: true }
  }).sort({ group: 1, order: 1, key: 1 });
};

settingsSchema.statics.getBulk = async function(keys: string[]): Promise<Map<string, any>> {
  const settings = await this.find({ 
    key: { $in: keys.map(k => k.toUpperCase()) }
  });
  
  const result = new Map<string, any>();
  for (const setting of settings) {
    if (setting.isEffective()) {
      result.set(setting.key, setting.getValue());
    }
  }
  
  return result;
};

settingsSchema.statics.setBulk = async function(
  settings: Array<{ key: string; value: any; userId?: string }>
): Promise<void> {
  for (const { key, value, userId } of settings) {
    const setting = await this.findOne({ key: key.toUpperCase() });
    if (setting) {
      await setting.setValue(value, userId);
    }
  }
};

settingsSchema.statics.getPublicSettings = async function(): Promise<ISettings[]> {
  return this.find({ 
    isPublic: true,
    deprecated: { $ne: true }
  }).sort({ category: 1, group: 1, order: 1 });
};

settingsSchema.statics.getEffectiveSettings = async function(): Promise<ISettings[]> {
  const now = new Date();
  return this.find({
    deprecated: { $ne: true },
    $and: [
      { $or: [{ effectiveDate: null }, { effectiveDate: { $lte: now } }] },
      { $or: [{ expiryDate: null }, { expiryDate: { $gte: now } }] }
    ]
  });
};

settingsSchema.statics.exportSettings = async function(
  category?: SettingsCategory
): Promise<Record<string, any>> {
  const query: any = { deprecated: { $ne: true } };
  if (category) {
    query.category = category;
  }

  const settings = await this.find(query);
  const result: Record<string, any> = {};

  for (const setting of settings) {
    // Don't export encrypted values
    if (setting.isEncrypted) {
      result[setting.key] = {
        value: '***ENCRYPTED***',
        metadata: {
          category: setting.category,
          valueType: setting.valueType,
          isEncrypted: true
        }
      };
    } else {
      result[setting.key] = {
        value: setting.getValue(),
        metadata: {
          category: setting.category,
          valueType: setting.valueType,
          displayName: setting.displayName,
          description: setting.description
        }
      };
    }
  }

  return result;
};

settingsSchema.statics.importSettings = async function(
  data: Record<string, any>,
  userId: string
): Promise<void> {
  for (const [key, config] of Object.entries(data)) {
    if (config.metadata?.isEncrypted) {
      logger.info(`Skipping encrypted setting ${key} during import`);
      continue;
    }

    let setting = await this.findOne({ key: key.toUpperCase() });
    
    if (!setting && config.metadata) {
      // Create new setting
      setting = new this({
        key: key.toUpperCase(),
        value: config.value,
        category: config.metadata.category || SettingsCategory.GENERAL,
        valueType: config.metadata.valueType || SettingsValueType.STRING,
        displayName: config.metadata.displayName || key,
        description: config.metadata.description
      });
      await setting.save();
    } else if (setting) {
      // Update existing setting
      await setting.setValue(config.value, userId, 'Imported from file');
    }
  }
};

// Pre-save middleware
settingsSchema.pre('save', function(next) {
  // Ensure key is uppercase
  if (this.key) {
    this.key = this.key.toUpperCase();
  }

  // Auto-increment version
  if (!this.isNew && this.isModified('value')) {
    this.version += 1;
  }

  next();
});

// Model export with static methods type
export const Settings = model<ISettings, ISettingsModel>('Settings', settingsSchema);