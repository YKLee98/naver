// packages/backend/src/config/mongodb.ts
import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

/**
 * MongoDB connection options - Optimized for production
 */
const mongoOptions: mongoose.ConnectOptions = {
  maxPoolSize: 50,              // Increased for better concurrency
  minPoolSize: 5,               // Maintain minimum connections
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  retryWrites: true,             // Enable automatic retry
  retryReads: true,              // Enable read retry
  heartbeatFrequencyMS: 10000,  // Health check frequency
  maxIdleTimeMS: 30000,          // Close idle connections
  compressors: ['zstd', 'zlib'], // Enable compression
  readPreference: 'secondaryPreferred', // Optimize read operations
};

/**
 * Initialize MongoDB connection
 */
export async function initializeMongoDB(): Promise<void> {
  const mongoUri =
    process.env['MONGODB_URI'] || 'mongodb://localhost:27017/ERP_NAVER';

  try {
    // Set up mongoose event handlers
    mongoose.connection.on('connected', () => {
      logger.info('MongoDB connected successfully');
    });

    mongoose.connection.on('error', (error) => {
      logger.error('MongoDB connection error:', error);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    // Connect to MongoDB
    await mongoose.connect(mongoUri, mongoOptions);

    logger.info(`MongoDB connected to ${mongoUri}`);
    logger.info('✅ MongoDB connected');

    // Enable debug mode in development
    if (
      process.env['NODE_ENV'] === 'development' &&
      process.env['MONGO_DEBUG'] === 'true'
    ) {
      mongoose.set('debug', true);
    }
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

/**
 * Close MongoDB connection
 */
export async function closeMongoDB(): Promise<void> {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  } catch (error) {
    logger.error('Error closing MongoDB connection:', error);
    throw error;
  }
}

/**
 * Get MongoDB connection status
 */
export function getMongoDBStatus(): {
  connected: boolean;
  readyState: number;
  host: string | undefined;
  name: string | undefined;
} {
  return {
    connected: mongoose.connection.readyState === 1,
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    name: mongoose.connection.name,
  };
}
