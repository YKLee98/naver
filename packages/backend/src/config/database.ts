// packages/backend/src/config/database.ts

import mongoose from 'mongoose';
import { logger } from '../utils/logger';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hallyu-fomaholic';
const isDevelopment = process.env.NODE_ENV === 'development';

// MongoDB connection options
const mongoOptions: mongoose.ConnectOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

/**
 * Connect to MongoDB
 */
export async function connectDB(): Promise<void> {
  try {
    // Set mongoose options
    mongoose.set('strictQuery', false);
    
    if (isDevelopment) {
      mongoose.set('debug', false); // Set to true if you want to see queries
    }

    // Event listeners
    mongoose.connection.on('connected', () => {
      logger.info('MongoDB connected successfully');
    });

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, mongoOptions);
    
    logger.info(`MongoDB connected to ${MONGODB_URI}`);
  } catch (error) {
    logger.error('MongoDB connection failed:', error);
    
    // In development, continue without database
    if (isDevelopment) {
      logger.warn('Running without database connection in development mode');
    } else {
      throw error;
    }
  }
}

/**
 * Disconnect from MongoDB
 */
export async function disconnectDB(): Promise<void> {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  } catch (error) {
    logger.error('Error closing MongoDB connection:', error);
    throw error;
  }
}

/**
 * Check if MongoDB is connected
 */
export function isDBConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * Get MongoDB connection status
 */
export function getDBStatus(): string {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] || 'unknown';
}

// Handle process termination
process.on('SIGINT', async () => {
  await disconnectDB();
  process.exit(0);
});

// Export as default as well for compatibility
export default {
  connectDB,
  disconnectDB,
  isDBConnected,
  getDBStatus,
};