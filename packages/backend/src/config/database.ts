// packages/backend/src/config/database.ts
import mongoose from 'mongoose';
import { logger } from '../utils/logger';

const MONGODB_URI = process.env.MONGODB_URI ;
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
export async function connectDatabase(): Promise<void> {
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

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, mongoOptions);
    
    logger.info(`MongoDB connected to ${MONGODB_URI}`);
  } catch (error) {
    logger.error('MongoDB connection failed:', error);
    
    // In development, continue without database
    if (isDevelopment) {
      logger.warn('Running without database connection in development mode');
      throw error; // 여전히 에러를 throw하되, 상위에서 처리
    } else {
      throw error;
    }
  }
}

/**
 * Disconnect from MongoDB
 */
export async function disconnectDatabase(): Promise<void> {
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
export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * Get MongoDB connection status
 */
export function getDBStatus(): string {
  const states: { [key: number]: string } = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] || 'unknown';
}

// Handle process termination
process.on('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(0);
});

// Named exports - 중요!
export {
  connectDatabase as connectDB,
  disconnectDatabase as disconnectDB,
  isDatabaseConnected as isDBConnected,
};

// Default export for compatibility
export default {
  connectDatabase,
  disconnectDatabase,
  isDatabaseConnected,
  getDBStatus,
  connectDB: connectDatabase,
  disconnectDB: disconnectDatabase,
  isDBConnected: isDatabaseConnected,
};