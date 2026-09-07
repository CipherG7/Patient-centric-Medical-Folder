import {
  SuiClient,
  getFullnodeUrl,
} from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromHex } from '@mysten/sui/utils';
import { config } from '../config';

let suiClient: SuiClient | null = null;
let adminKeypair: Ed25519Keypair | null = null;

/**
 * Returns a singleton SuiClient connected to the configured network.
 */
export function getSuiClient(): SuiClient {
  if (!suiClient) {
    const rpcUrl =
      config.SUI_RPC_URL || getFullnodeUrl(config.SUI_NETWORK as any);
    suiClient = new SuiClient({ url: rpcUrl });
    console.log(`[Sui] Client connected to ${config.SUI_NETWORK}: ${rpcUrl}`);
  }
  return suiClient;
}

/**
 * Returns the admin/operator keypair derived from the configured private key.
 * Used by the backend to sign transactions on behalf of the platform admin
 * (who holds the AdminCap) and, in demo mode, for patient/institution calls.
 *
 * DESIGN TRADE-OFF (explicit for the report):
 *   This demo uses a backend-held key for signing because:
 *   1. No browser wallet extension required — REST API works standalone.
 *   2. Simplified demo flow — the backend acts as both relayer and signer.
 *
 *   In production, transactions should be constructed server-side but
 *   signed client-side via the Sui Wallet browser extension (wallet-standard).
 *   The PTB construction code in `transactions.ts` would remain identical;
 *   only this signing step would change.
 */
export function getAdminKeypair(): Ed25519Keypair {
  if (!adminKeypair) {
    if (!config.ADMIN_PRIVATE_KEY) {
      throw new Error(
        'ADMIN_PRIVATE_KEY is not set. Configure it in .env to sign Sui transactions.'
      );
    }
    // Support both hex and base64 formats
    const pk = config.ADMIN_PRIVATE_KEY;
    if (pk.startsWith('0x') || /^[0-9a-fA-F]{64,128}$/.test(pk)) {
      const raw = pk.startsWith('0x') ? pk.slice(2) : pk;
      adminKeypair = Ed25519Keypair.fromSecretKey(fromHex(raw));
    } else {
      // Assume base64-encoded Sui keypair format
      adminKeypair = Ed25519Keypair.fromSecretKey(pk);
    }
    console.log(
      `[Sui] Admin keypair loaded. Address: ${adminKeypair.toSuiAddress()}`
    );
  }
  return adminKeypair;
}

/**
 * Get the admin's Sui address.
 */
export function getAdminAddress(): string {
  return getAdminKeypair().toSuiAddress();
}

