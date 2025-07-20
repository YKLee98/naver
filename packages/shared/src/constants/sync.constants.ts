// packages/shared/src/constants/sync.constants.ts
export const SYNC_INTERVALS = {
  REAL_TIME: 0,
  FIVE_MINUTES: 5 * 60 * 1000,
  FIFTEEN_MINUTES: 15 * 60 * 1000,
  THIRTY_MINUTES: 30 * 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  THREE_HOURS: 3 * 60 * 60 * 1000,
  SIX_HOURS: 6 * 60 * 60 * 1000,
  TWELVE_HOURS: 12 * 60 * 60 * 1000,
  DAILY: 24 * 60 * 60 * 1000,
} as const;

export const SYNC_BATCH_SIZE = {
  SMALL: 10,
  MEDIUM: 50,
  LARGE: 100,
  EXTRA_LARGE: 200,
} as const;

export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 1000,
  MAX_DELAY: 30000,
  BACKOFF_FACTOR: 2,
} as const;

