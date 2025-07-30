// packages/backend/src/models/Settings.ts
import { Schema, model, Document, Types, Model } from 'mongoose';
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
  FEATURE_FLAGS = 'feature_flags',
  INTEGRATION = 'integration',
  UI_PREFERENCES = 'ui_preferences'
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
  ARRAY = 'array',
  DATE = 'date',
  URL = 'url',
  EMAIL = 'email'
}

/**
 * Settings Access Level
 */
export enum SettingsAccessLevel {
  PUBLIC = 'public',
  AUTHENTICATED = 'authenticated',
  ADMIN = 'admin',
  SYSTEM = 'system'
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
  accessLevel: SettingsAccessLevel;
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
      reason?: string;
    }>;
    relatedSettings?: string[];
    tags?: string[];
    source?: string;
    environment?: string[];
  };
  defaultValue?: any;
  group?: string;
  order?: number;
  deprecated?: boolean;
  deprecationMessage?: string;
  effectiveDate?: Date;
  expiryDate?: Date;
  version: number;
  cacheTTL?: number;
  requiresRestart?: boolean;
  auditLog?: Array<{
    action: string;
    timestamp: Date;
    userId: string;
    details?: any;
  }>;

  // Instance methods
  getValue(): any;
  setValue(value: any, userId?: string, reason?: string): Promise<void>;
  validateValue(value: any): boolean;
  resetToDefault(userId?: string): Promise<void>;
  getDecryptedValue(): any;
  isExpired(): boolean;
  isEffective(): boolean;
  addToHistory(value: any, userId: string, reason?: string): void;
  logAudit(action: string, userId: string, details?: any): void;
  canBeAccessedBy(userId: string, userRole: string): boolean;
  toPublicJSON(): any;
  clone(newKey: string): ISettings;
}

/**
 * Interface for Settings Model Static Methods
 */
export interface ISettingsModel extends Model<ISettings> {
  getByKey(key: string): Promise<ISettings | null>;
  getByCategory(category: SettingsCategory): Promise<ISettings[]>;
  getBulk(keys: string[]): Promise<Map<string, any>>;
  setBulk(settings: Array<{ key: string; value: any; userId?: string; reason?: string }>): Promise<void>;
  getPublicSettings(): Promise<ISettings[]>;
  getEffectiveSettings(): Promise<ISettings[]>;
  exportSettings(category?: SettingsCategory): Promise<Record<string, any>>;
  importSettings(data: Record<string, any>, userId: string): Promise<void>;
  searchSettings(query: string, options?: any): Promise<ISettings[]>;
  getDeprecatedSettings(): Promise<ISettings[]>;
  purgeExpiredSettings(): Promise<number>;
  validateAllSettings(): Promise<Array<{ key: string; errors: string[] }>>;
  getDependentSettings(key: string): Promise<ISettings[]>;
  createSetting(data: Partial<ISettings>, userId: string): Promise<ISettings>;
  archiveSetting(key: string, userId: string): Promise<void>;
}

/**
 * Settings Schema
 */
const settingsSchema = new Schema<ISettings>({
  key: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
    validate: {
      validator: (v: string) => /^[A-Z][A-Z0-9_]*$/.test(v),
      message: 'Setting key must be uppercase alphanumeric with underscores'
    }
  },
  value: {
    type: Schema.Types.Mixed,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: Object.values(SettingsCategory),
    index: true
  },
  valueType: {
    type: String,
    required: true,
    enum: Object.values(SettingsValueType)
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  isEncrypted: {
    type: Boolean,
    default: false
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
  accessLevel: {
    type: String,
    enum: Object.values(SettingsAccessLevel),
    default: SettingsAccessLevel.ADMIN
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
    lastModifiedBy: String,
    lastModifiedReason: String,
    previousValues: [{
      value: Schema.Types.Mixed,
      changedAt: {
        type: Date,
        default: Date.now
      },
      changedBy: String,
      reason: String
    }],
    relatedSettings: [String],
    tags: [String],
    source: String,
    environment: [String]
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
  effectiveDate: Date,
  expiryDate: {
    type: Date,
    index: true
  },
  version: {
    type: Number,
    default: 1
  },
  cacheTTL: {
    type: Number,
    default: 300 // 5 minutes
  },
  requiresRestart: {
    type: Boolean,
    default: false
  },
  auditLog: [{
    action: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    userId: {
      type: String,
      required: true
    },
    details: Schema.Types.Mixed
  }]
}, {
  timestamps: true,
  toJSON: {
    transform: function(_doc: any, ret: any) {
      delete ret._id;
      if (ret.__v !== undefined) {
        delete ret.__v;
      }
      return ret;
    }
  }
});

// Indexes
settingsSchema.index({ key: 1, version: -1 });
settingsSchema.index({ category: 1, group: 1, order: 1 });
settingsSchema.index({ tags: 1 });
settingsSchema.index({ 'metadata.lastModifiedBy': 1, updatedAt: -1 });
settingsSchema.index({ effectiveDate: 1, expiryDate: 1 });

// Virtual for history count
settingsSchema.virtual('historyCount').get(function() {
  return this.metadata?.previousValues?.length || 0;
});

// Instance Methods
settingsSchema.methods.getValue = function(): any {
  if (this.isExpired()) {
    logger.warn(`Setting ${this.key} has expired`);
    return this.defaultValue;
  }

  if (!this.isEffective()) {
    logger.warn(`Setting ${this.key} is not yet effective`);
    return this.defaultValue;
  }

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
      return Array.isArray(this.value) ? this.value : [];
    case SettingsValueType.DATE:
      return this.value instanceof Date ? this.value : new Date(this.value);
    default:
      return this.value;
  }
};

settingsSchema.methods.setValue = async function(
  value: any, 
  userId: string = 'system', 
  reason?: string
): Promise<void> {
  if (!this.isEditable && userId !== 'system') {
    throw new Error(`Setting ${this.key} is not editable`);
  }

  // Validate new value
  if (!this.validateValue(value)) {
    throw new Error(`Invalid value for setting ${this.key}`);
  }

  // Store previous value in history
  this.addToHistory(this.value, userId, reason);

  // Set new value (encrypt if needed)
  if (this.isEncrypted) {
    this.value = encrypt(String(value));
  } else {
    this.value = value;
  }

  // Update metadata
  this.metadata = this.metadata || {};
  this.metadata.lastModifiedBy = userId;
  this.metadata.lastModifiedReason = reason || 'Direct update';

  // Log audit
  this.logAudit('UPDATE', userId, { 
    previousValue: this.metadata.previousValues?.[0]?.value, 
    newValue: value,
    reason 
  });

  // Increment version
  this.version += 1;

  await this.save();
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
        const strValue = String(value);
        if (this.validation.pattern && !new RegExp(this.validation.pattern).test(strValue)) {
          return false;
        }
        if (this.validation.min !== undefined && strValue.length < this.validation.min) return false;
        if (this.validation.max !== undefined && strValue.length > this.validation.max) return false;
        break;

      case SettingsValueType.ARRAY:
        if (!Array.isArray(value)) return false;
        if (this.validation.min !== undefined && value.length < this.validation.min) return false;
        if (this.validation.max !== undefined && value.length > this.validation.max) return false;
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

      case SettingsValueType.URL:
        try {
          new URL(String(value));
        } catch {
          return false;
        }
        break;

      case SettingsValueType.EMAIL:
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(String(value))) return false;
        break;
    }

    // Enum validation
    if (this.validation.enum && this.validation.enum.length > 0) {
      if (!this.validation.enum.includes(value)) {
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error(`Validation error for setting ${this.key}:`, error);
    return false;
  }
};

settingsSchema.methods.resetToDefault = async function(userId: string = 'system'): Promise<void> {
  if (this.defaultValue !== undefined) {
    await this.setValue(this.defaultValue, userId, 'Reset to default value');
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
  return this.effectiveDate ? new Date() >= this.effectiveDate : true;
};

settingsSchema.methods.addToHistory = function(
  value: any, 
  userId: string, 
  reason?: string
): void {
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
    changedBy: userId,
    reason
  });
};

settingsSchema.methods.logAudit = function(
  action: string, 
  userId: string, 
  details?: any
): void {
  if (!this.auditLog) {
    this.auditLog = [];
  }

  // Keep only last 100 audit entries
  if (this.auditLog.length >= 100) {
    this.auditLog = this.auditLog.slice(-99);
  }

  this.auditLog.push({
    action,
    timestamp: new Date(),
    userId,
    details
  });
};

settingsSchema.methods.canBeAccessedBy = function(
  userId: string, 
  userRole: string
): boolean {
  switch (this.accessLevel) {
    case SettingsAccessLevel.PUBLIC:
      return true;
    case SettingsAccessLevel.AUTHENTICATED:
      return !!userId;
    case SettingsAccessLevel.ADMIN:
      return userRole === 'admin' || userRole === 'super_admin';
    case SettingsAccessLevel.SYSTEM:
      return userId === 'system' || userRole === 'super_admin';
    default:
      return false;
  }
};

settingsSchema.methods.toPublicJSON = function(): any {
  const obj = this.toJSON();
  
  // Remove sensitive information
  if (this.isEncrypted) {
    obj.value = '***ENCRYPTED***';
  }
  
  delete obj.auditLog;
  delete obj.metadata?.previousValues;
  
  return obj;
};

settingsSchema.methods.clone = function(newKey: string): ISettings {
  const cloned = new (this.constructor as any)({
    ...this.toObject(),
    _id: undefined,
    key: newKey,
    version: 1,
    metadata: {
      ...this.metadata,
      previousValues: [],
      source: `Cloned from ${this.key}`
    },
    auditLog: [{
      action: 'CLONE',
      timestamp: new Date(),
      userId: 'system',
      details: { sourceKey: this.key }
    }]
  });
  
  return cloned;
};

// Static Methods
settingsSchema.statics.getByKey = async function(key: string): Promise<ISettings | null> {
  return this.findOne({ 
    key: key.toUpperCase(),
    deprecated: { $ne: true }
  });
};

settingsSchema.statics.getByCategory = async function(
  category: SettingsCategory
): Promise<ISettings[]> {
  return this.find({ 
    category,
    deprecated: { $ne: true }
  }).sort({ group: 1, order: 1, displayName: 1 });
};

settingsSchema.statics.getBulk = async function(keys: string[]): Promise<Map<string, any>> {
  const settings = await this.find({ 
    key: { $in: keys.map(k => k.toUpperCase()) },
    deprecated: { $ne: true }
  });
  
  const result = new Map<string, any>();
  
  for (const setting of settings) {
    result.set(setting.key, setting.getValue());
  }
  
  return result;
};

settingsSchema.statics.setBulk = async function(
  settings: Array<{ key: string; value: any; userId?: string; reason?: string }>
): Promise<void> {
  for (const { key, value, userId, reason } of settings) {
    const setting = await this.findOne({ 
      key: key.toUpperCase(),
      deprecated: { $ne: true }
    });
    
    if (setting) {
      await setting.setValue(value, userId, reason);
    } else {
      logger.warn(`Setting ${key} not found for bulk update`);
    }
  }
};

settingsSchema.statics.getPublicSettings = async function(): Promise<ISettings[]> {
  return this.find({ 
    isPublic: true,
    deprecated: { $ne: true }
  }).sort({ category: 1, displayName: 1 });
};

settingsSchema.statics.getEffectiveSettings = async function(): Promise<ISettings[]> {
  const now = new Date();
  
  return this.find({
    deprecated: { $ne: true },
    $or: [
      { effectiveDate: { $exists: false } },
      { effectiveDate: { $lte: now } }
    ],
    $and: [
      { $or: [
        { expiryDate: { $exists: false } },
        { expiryDate: { $gt: now } }
      ]}
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
        description: config.metadata.description,
        isPublic: false,
        isEditable: true,
        accessLevel: SettingsAccessLevel.ADMIN
      });
      
      await setting.save();
      setting.logAudit('IMPORT', userId, { source: 'import' });
    } else if (setting) {
      // Update existing setting
      await setting.setValue(config.value, userId, 'Imported from file');
    }
  }
};

settingsSchema.statics.searchSettings = async function(
  query: string,
  options: any = {}
): Promise<ISettings[]> {
  const searchRegex = new RegExp(query, 'i');
  
  return this.find({
    deprecated: { $ne: true },
    $or: [
      { key: searchRegex },
      { displayName: searchRegex },
      { description: searchRegex },
      { 'metadata.tags': searchRegex }
    ]
  })
  .limit(options.limit || 50)
  .skip(options.skip || 0)
  .sort(options.sort || { displayName: 1 });
};

settingsSchema.statics.getDeprecatedSettings = async function(): Promise<ISettings[]> {
  return this.find({ deprecated: true }).sort({ deprecatedAt: -1 });
};

settingsSchema.statics.purgeExpiredSettings = async function(): Promise<number> {
  const result = await this.deleteMany({
    expiryDate: { $lte: new Date() },
    isEditable: true
  });
  
  return result.deletedCount || 0;
};

settingsSchema.statics.validateAllSettings = async function(): Promise<Array<{ key: string; errors: string[] }>> {
  const settings = await this.find({ deprecated: { $ne: true } });
  const results: Array<{ key: string; errors: string[] }> = [];
  
  for (const setting of settings) {
    const errors: string[] = [];
    
    // Validate current value
    if (!setting.validateValue(setting.getValue())) {
      errors.push('Current value fails validation');
    }
    
    // Check for required related settings
    if (setting.metadata?.relatedSettings) {
      for (const relatedKey of setting.metadata.relatedSettings) {
        const related = await this.findOne({ 
          key: relatedKey.toUpperCase(),
          deprecated: { $ne: true }
        });
        if (!related) {
          errors.push(`Related setting ${relatedKey} not found`);
        }
      }
    }
    
    if (errors.length > 0) {
      results.push({ key: setting.key, errors });
    }
  }
  
  return results;
};

settingsSchema.statics.getDependentSettings = async function(key: string): Promise<ISettings[]> {
  return this.find({
    'metadata.relatedSettings': key.toUpperCase(),
    deprecated: { $ne: true }
  });
};

settingsSchema.statics.createSetting = async function(
  data: Partial<ISettings>,
  userId: string
): Promise<ISettings> {
  const setting = new this({
    ...data,
    key: data.key?.toUpperCase(),
    version: 1
  });
  
  await setting.save();
  
  setting.logAudit('CREATE', userId, { 
    initialValue: data.value 
  });
  
  await setting.save();
  
  return setting;
};

settingsSchema.statics.archiveSetting = async function(
  key: string,
  userId: string
): Promise<void> {
  const setting = await this.findOne({ 
    key: key.toUpperCase(),
    deprecated: { $ne: true }
  });
  
  if (!setting) {
    throw new Error(`Setting ${key} not found`);
  }
  
  setting.deprecated = true;
  setting.deprecationMessage = `Archived by ${userId} on ${new Date().toISOString()}`;
  setting.logAudit('ARCHIVE', userId);
  
  await setting.save();
};

// Pre-save middleware
settingsSchema.pre('save', function(next) {
  // Ensure key is uppercase
  if (this.key) {
    this.key = this.key.toUpperCase();
  }

  // Auto-increment version on value change
  if (!this.isNew && this.isModified('value')) {
    this.version += 1;
  }

  // Set default access level based on category
  if (!this.accessLevel) {
    switch (this.category) {
      case SettingsCategory.SECURITY:
      case SettingsCategory.API:
        this.accessLevel = SettingsAccessLevel.SYSTEM;
        break;
      case SettingsCategory.GENERAL:
      case SettingsCategory.UI_PREFERENCES:
        this.accessLevel = SettingsAccessLevel.AUTHENTICATED;
        break;
      default:
        this.accessLevel = SettingsAccessLevel.ADMIN;
    }
  }

  next();
});

// Post-save middleware for cache invalidation
settingsSchema.post('save', function(doc) {
  logger.info(`Setting ${doc.key} saved, version: ${doc.version}`);
  // Here you would invalidate any caches
});

// Post-remove middleware - using the deprecated findOneAndDelete hook instead
settingsSchema.post('findOneAndDelete', function(doc) {
  if (doc) {
    logger.info(`Setting ${doc.key} removed`);
  }
});

// Create and export model
export const Settings = model<ISettings, ISettingsModel>('Settings', settingsSchema);

// Create default settings on startup
export async function initializeDefaultSettings(): Promise<void> {
  const defaultSettings = [
    {
      key: 'SYNC_ENABLED',
      value: true,
      category: SettingsCategory.SYNC,
      valueType: SettingsValueType.BOOLEAN,
      displayName: 'Enable Synchronization',
      description: 'Master switch for all synchronization operations',
      isPublic: false,
      isEditable: true,
      defaultValue: true,
      group: 'general',
      order: 1
    },
    {
      key: 'SYNC_INTERVAL_MINUTES',
      value: 30,
      category: SettingsCategory.SYNC,
      valueType: SettingsValueType.NUMBER,
      displayName: 'Sync Interval (minutes)',
      description: 'How often to run automatic synchronization',
      isPublic: false,
      isEditable: true,
      validation: {
        min: 5,
        max: 1440,
        required: true
      },
      defaultValue: 30,
      group: 'general',
      order: 2
    },
    {
      key: 'API_RATE_LIMIT_PER_MINUTE',
      value: 60,
      category: SettingsCategory.API,
      valueType: SettingsValueType.NUMBER,
      displayName: 'API Rate Limit',
      description: 'Maximum API requests per minute',
      isPublic: false,
      isEditable: true,
      validation: {
        min: 1,
        max: 1000,
        required: true
      },
      defaultValue: 60,
      group: 'limits',
      order: 1
    }
  ];

  for (const settingData of defaultSettings) {
    const existing = await Settings.getByKey(settingData.key);
    
    if (!existing) {
      await Settings.createSetting(settingData, 'system');
      logger.info(`Default setting ${settingData.key} created`);
    }
  }
}