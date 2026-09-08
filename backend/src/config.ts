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
  SUI_RPC_URL: process.env.SUI_RPC_URL || undefined,
  SUI_GRAPHQL_URL:
    process.env.SUI_GRAPHQL_URL || 'https://graphql.testnet.sui.io/graphql',
  SUI_GRPC_URL:
    process.env.SUI_GRPC_URL || 'https://fullnode.testnet.sui.io:443',

  // The published package ID (set after `sui client publish`)
  PACKAGE_ID: process.env.PACKAGE_ID || '',

  // Admin wallet private key (hex-encoded)
  ADMIN_PRIVATE_KEY: process.env.ADMIN_PRIVATE_KEY || '',

  // PostgreSQL
  DATABASE_URL:
    process.env.DATABASE_URL || 'postgresql://localhost:5432/medical_history',

  // Auth
  API_KEY: process.env.API_KEY || 'dev-api-key',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-jwt-secret',

  // Encryption
  /** Application-wide salt for PBKDF2 key derivation. Change this to invalidate all wrapped keys. */
  ENCRYPTION_SALT: process.env.ENCRYPTION_SALT || 'medical-history-v1',

  // IPFS / Storage
  IPFS_ENABLED: process.env.IPFS_ENABLED === 'true',
  /** Kubo RPC API URL, or "local" for filesystem fallback. */
  IPFS_API_URL: process.env.IPFS_API_URL || 'local',
  /** Public IPFS gateway for downloads (e.g. https://ipfs.io/ipfs). */
  IPFS_GATEWAY_URL: process.env.IPFS_GATEWAY_URL || '',
  /** Directory for local IPFS file storage fallback. */
  IPFS_LOCAL_DIR: process.env.IPFS_LOCAL_DIR || './data/ipfs',
} as const;

// Validate critical config at startup
export function validateConfig(): void {
  const missing: string[] = [];
  if (!config.PACKAGE_ID) missing.push('PACKAGE_ID');
  if (!config.ADMIN_PRIVATE_KEY) missing.push('ADMIN_PRIVATE_KEY');

  if (missing.length > 0) {
    console.warn(
      `[config] WARNING: Missing required env vars: ${missing.join(', ')}. ` +
        'The server will start but Sui transactions will fail until these are set.'
    );
  }
}
