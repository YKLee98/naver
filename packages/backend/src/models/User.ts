// packages/backend/src/models/User.ts
import { Schema, model, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { BaseModelHelper, IBaseDocument } from './base/BaseModel.js';

// User roles enum
export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  MANAGER = 'manager',
  USER = 'user',
  VIEWER = 'viewer'
}

// User status enum
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending'
}

// User interface
export interface IUser extends IBaseDocument {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  refreshToken?: string;
  lastLogin?: Date;
  loginAttempts: number;
  lockUntil?: Date;
  emailVerified: boolean;
  emailVerificationToken?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  twoFactorSecret?: string;
  twoFactorEnabled: boolean;
  preferences: {
    language: string;
    timezone: string;
    notifications: {
      email: boolean;
      push: boolean;
      sms: boolean;
    };
  };
  metadata: {
    lastPasswordChange?: Date;
    passwordHistory?: string[];
    ipAddress?: string;
    userAgent?: string;
    deviceId?: string;
  };
  
  // Instance methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateAuthToken(): string;
  generateRefreshToken(): string;
  incrementLoginAttempts(): Promise<void>;
  resetLoginAttempts(): Promise<void>;
  isLocked(): boolean;
  hasRole(role: UserRole): boolean;
  canAccess(resource: string, action: string): boolean;
}

// User model interface
export interface IUserModel extends Model<IUser> {
  findByEmail(email: string): Promise<IUser | null>;
  findByToken(token: string): Promise<IUser | null>;
  findActiveUsers(): Promise<IUser[]>;
  authenticate(email: string, password: string): Promise<IUser | null>;
  createUser(userData: Partial<IUser>): Promise<IUser>;
}

// User schema
const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      validate: {
        validator: function(v: string) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: 'Invalid email format'
      }
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false // Don't include in queries by default
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters']
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.USER,
      index: true
    },
    status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.PENDING,
      index: true
    },
    refreshToken: {
      type: String,
      select: false
    },
    lastLogin: {
      type: Date,
      index: true
    },
    loginAttempts: {
      type: Number,
      default: 0
    },
    lockUntil: Date,
    emailVerified: {
      type: Boolean,
      default: false,
      index: true
    },
    emailVerificationToken: {
      type: String,
      select: false
    },
    passwordResetToken: {
      type: String,
      select: false,
      index: { sparse: true }
    },
    passwordResetExpires: Date,
    twoFactorSecret: {
      type: String,
      select: false
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false
    },
    preferences: {
      language: {
        type: String,
        default: 'en',
        enum: ['en', 'ko', 'ja', 'zh']
      },
      timezone: {
        type: String,
        default: 'Asia/Seoul'
      },
      notifications: {
        email: {
          type: Boolean,
          default: true
        },
        push: {
          type: Boolean,
          default: true
        },
        sms: {
          type: Boolean,
          default: false
        }
      }
    },
    metadata: {
      lastPasswordChange: Date,
      passwordHistory: [{
        type: String,
        select: false
      }],
      ipAddress: String,
      userAgent: String,
      deviceId: String
    }
  },
  {
    collection: 'users'
  }
);

// Initialize base model features
BaseModelHelper.initializeSchema(userSchema);

// Additional indexes
userSchema.index({ email: 1, status: 1 });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ lastLogin: -1 });
userSchema.index({ 'metadata.lastPasswordChange': 1 });

// Virtual for account lock status
userSchema.virtual('isAccountLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > new Date());
});

// Pre-save middleware
userSchema.pre('save', async function(next) {
  const user = this;

  // Only hash password if it's modified
  if (!user.isModified('password')) {
    return next();
  }

  try {
    // Generate salt and hash password
    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(user.password, salt);

    // Update password change metadata
    if (!user.isNew) {
      user.metadata.lastPasswordChange = new Date();
      
      // Add to password history (keep last 5)
      if (!user.metadata.passwordHistory) {
        user.metadata.passwordHistory = [];
      }
      user.metadata.passwordHistory.unshift(user.password);
      if (user.metadata.passwordHistory.length > 5) {
        user.metadata.passwordHistory = user.metadata.passwordHistory.slice(0, 5);
      }
    }

    next();
  } catch (error) {
    next(error as Error);
  }
});

// Instance methods
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  try {
    const user = await User.findById(this._id).select('+password');
    if (!user || !user.password) return false;
    return await bcrypt.compare(candidatePassword, user.password);
  } catch (error) {
    return false;
  }
};

userSchema.methods.generateAuthToken = function(): string {
  return jwt.sign(
    {
      id: this._id,
      email: this.email,
      role: this.role,
      status: this.status
    },
    config.jwt.secret,
    {
      expiresIn: config.jwt.expiresIn,
      issuer: 'hallyu-fomaholic',
      audience: 'hallyu-fomaholic-api'
    }
  );
};

userSchema.methods.generateRefreshToken = function(): string {
  return jwt.sign(
    {
      id: this._id,
      type: 'refresh'
    },
    config.jwt.secret,
    {
      expiresIn: config.jwt.refreshExpiresIn
    }
  );
};

userSchema.methods.incrementLoginAttempts = async function(): Promise<void> {
  // Reset attempts if lock has expired
  if (this.lockUntil && this.lockUntil < new Date()) {
    return await this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }
  
  const updates: any = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 attempts for 2 hours
  const maxAttempts = 5;
  const lockTime = 2 * 60 * 60 * 1000; // 2 hours
  
  if (this.loginAttempts + 1 >= maxAttempts && !this.isAccountLocked) {
    updates.$set = { lockUntil: new Date(Date.now() + lockTime) };
  }
  
  await this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = async function(): Promise<void> {
  await this.updateOne({
    $set: { loginAttempts: 0 },
    $unset: { lockUntil: 1 }
  });
};

userSchema.methods.isLocked = function(): boolean {
  return !!(this.lockUntil && this.lockUntil > new Date());
};

userSchema.methods.hasRole = function(role: UserRole): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    [UserRole.SUPER_ADMIN]: 5,
    [UserRole.ADMIN]: 4,
    [UserRole.MANAGER]: 3,
    [UserRole.USER]: 2,
    [UserRole.VIEWER]: 1
  };
  
  return roleHierarchy[this.role] >= roleHierarchy[role];
};

userSchema.methods.canAccess = function(resource: string, action: string): boolean {
  // Implement RBAC logic here
  const permissions: Record<UserRole, Record<string, string[]>> = {
    [UserRole.SUPER_ADMIN]: {
      '*': ['*'] // All permissions
    },
    [UserRole.ADMIN]: {
      'users': ['read', 'write', 'delete'],
      'products': ['read', 'write', 'delete'],
      'orders': ['read', 'write', 'delete'],
      'settings': ['read', 'write']
    },
    [UserRole.MANAGER]: {
      'users': ['read'],
      'products': ['read', 'write'],
      'orders': ['read', 'write'],
      'settings': ['read']
    },
    [UserRole.USER]: {
      'products': ['read'],
      'orders': ['read'],
      'settings': ['read']
    },
    [UserRole.VIEWER]: {
      'products': ['read'],
      'orders': ['read']
    }
  };
  
  const userPermissions = permissions[this.role];
  if (!userPermissions) return false;
  
  // Check wildcard permissions
  if (userPermissions['*']?.includes('*')) return true;
  if (userPermissions['*']?.includes(action)) return true;
  if (userPermissions[resource]?.includes('*')) return true;
  if (userPermissions[resource]?.includes(action)) return true;
  
  return false;
};

// Static methods
userSchema.statics.findByEmail = async function(email: string): Promise<IUser | null> {
  return this.findOne({ email: email.toLowerCase(), _deleted: { $ne: true } });
};

userSchema.statics.findByToken = async function(token: string): Promise<IUser | null> {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    return this.findOne({ 
      _id: decoded.id, 
      status: UserStatus.ACTIVE,
      _deleted: { $ne: true }
    });
  } catch (error) {
    return null;
  }
};

userSchema.statics.findActiveUsers = async function(): Promise<IUser[]> {
  return this.find({ 
    status: UserStatus.ACTIVE,
    _deleted: { $ne: true }
  });
};

userSchema.statics.authenticate = async function(
  email: string, 
  password: string
): Promise<IUser | null> {
  const user = await this.findOne({ 
    email: email.toLowerCase(),
    _deleted: { $ne: true }
  }).select('+password');
  
  if (!user) {
    return null;
  }
  
  // Check if account is locked
  if (user.isLocked()) {
    await user.incrementLoginAttempts();
    throw new Error('Account is locked due to too many failed login attempts');
  }
  
  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  
  if (!isPasswordValid) {
    await user.incrementLoginAttempts();
    return null;
  }
  
  // Check if account is active
  if (user.status !== UserStatus.ACTIVE) {
    throw new Error(`Account is ${user.status}`);
  }
  
  // Reset login attempts and update last login
  await user.resetLoginAttempts();
  user.lastLogin = new Date();
  await user.save();
  
  return user;
};

userSchema.statics.createUser = async function(userData: Partial<IUser>): Promise<IUser> {
  // Check if user exists
  const existingUser = await this.findOne({ 
    email: userData.email?.toLowerCase() 
  });
  
  if (existingUser) {
    throw new Error('User with this email already exists');
  }
  
  // Create new user
  const user = new this(userData);
  await user.save();
  
  return user;
};

// Create and export model
export const User = model<IUser, IUserModel>('User', userSchema);