// ============================================
// packages/backend/src/models/Session.ts
// ============================================
import mongoose, { Schema, Document } from 'mongoose';

export interface ISession extends Document {
  userId: string;
  token: string;
  refreshToken?: string;
  deviceInfo?: {
    userAgent?: string;
    ip?: string;
    device?: string;
  };
  isActive: boolean;
  lastActivity: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema = new Schema<ISession>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    refreshToken: String,
    deviceInfo: {
      userAgent: String,
      ip: String,
      device: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      // Removed index: true to avoid duplicate
    },
  },
  {
    timestamps: true,
  }
);

// Create TTL index using schema.index() only
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Additional indexes
SessionSchema.index({ userId: 1, isActive: 1 });
SessionSchema.index({ token: 1 });
SessionSchema.index({ refreshToken: 1 }, { sparse: true });

export const Session = mongoose.model<ISession>('Session', SessionSchema);
