import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * Centralised configuration loaded from environment variables.
 */
export const config = {
  // Server
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Sui
  SUI_NETWORK: process.env.SUI_NETWORK || 'testnet',
  SUI_GRAPHQL_URL:
    process.env.SUI_GRAPHQL_URL || 'https://graphql.testnet.sui.io/graphql',
  SUI_GRPC_URL:
    process.env.SUI_GRPC_URL || 'https://fullnode.testnet.sui.io:443',

  // The published package ID (set after `sui client publish`)
  PACKAGE_ID: process.env.PACKAGE_ID || '',

  // Admin wallet private key (hex-encoded)
  ADMIN_PRIVATE_KEY: process.env.ADMIN_PRIVATE_KEY || '',

  // Shared object IDs (created by each module's init() at publish time —
  // must be re-captured from `sui client publish` output any time the
  // package is republished, since a new publish creates fresh shared objects).
  SHARED_INSTITUTION_REGISTRY: process.env.SHARED_INSTITUTION_REGISTRY || '',
  SHARED_PATIENT_REGISTRY: process.env.SHARED_PATIENT_REGISTRY || '',
  SHARED_PERMISSION_STORE: process.env.SHARED_PERMISSION_STORE || '',
  SHARED_AUDIT_LOG: process.env.SHARED_AUDIT_LOG || '',

  // PostgreSQL
  DATABASE_URL:
    process.env.DATABASE_URL || 'postgresql://localhost:5432/medical_history',

  // Encryption
  /** Application-wide salt for PBKDF2 key derivation. Change this to invalidate all wrapped keys. */
  ENCRYPTION_SALT: process.env.ENCRYPTION_SALT || 'medical-history-v1',

  // Walrus storage
  WALRUS_ENABLED: process.env.WALRUS_ENABLED !== 'false',
  WALRUS_PUBLISHER_URL:
    process.env.WALRUS_PUBLISHER_URL ||
    'https://publisher.walrus-testnet.walrus.space',
  WALRUS_AGGREGATOR_URL:
    process.env.WALRUS_AGGREGATOR_URL ||
    'https://aggregator.walrus-testnet.walrus.space',
  WALRUS_EPOCHS: parseInt(process.env.WALRUS_EPOCHS || '5', 10),
  /** Directory for development-only local storage when Walrus is disabled. */
  WALRUS_LOCAL_DIR: process.env.WALRUS_LOCAL_DIR || './data/walrus',
} as const;

// Validate critical config at startup
export function validateConfig(): void {
  const missing: string[] = [];
  if (!config.PACKAGE_ID) missing.push('PACKAGE_ID');
  if (!config.ADMIN_PRIVATE_KEY) missing.push('ADMIN_PRIVATE_KEY');
  if (!config.SHARED_PATIENT_REGISTRY) missing.push('SHARED_PATIENT_REGISTRY');
  if (!config.SHARED_INSTITUTION_REGISTRY) missing.push('SHARED_INSTITUTION_REGISTRY');
  if (!config.SHARED_PERMISSION_STORE) missing.push('SHARED_PERMISSION_STORE');
  if (!config.SHARED_AUDIT_LOG) missing.push('SHARED_AUDIT_LOG');

  if (missing.length > 0) {
    console.warn(
      `[config] WARNING: Missing required env vars: ${missing.join(', ')}. ` +
        'The server will start but Sui transactions will fail until these are set.'
    );
  }
}