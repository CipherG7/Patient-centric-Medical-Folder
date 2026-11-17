import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64, toBase64 } from '@mysten/bcs';
import { decodeJwt } from '@mysten/sui/zklogin';
import {
  generateNonce,
  genAddressSeed,
  getExtendedEphemeralPublicKey,
  ZkLoginSigner,
} from '@mysten/sui/zklogin';
import { accessApi, authApi } from '@/lib/api';

const DEMO_ACCESS_MODE =
  import.meta.env.DEV || import.meta.env.VITE_DEMO_ACCESS === 'true';

async function executeZkLoginTransaction(
  transaction: string,
  operation: {
    historyId: string;
    granteeAddr: string;
    scope?: 'full' | 'partial';
    entryIds?: number[];
    expiryMs?: number;
    action?: 'grant' | 'revoke';
  }
) {
  const jwt = sessionStorage.getItem('zklogin_jwt');
  const salt = sessionStorage.getItem('zklogin_salt');
  const secret = sessionStorage.getItem('zklogin_ephemeral_secret');
  const randomness = sessionStorage.getItem('zklogin_randomness');
  const maxEpoch = sessionStorage.getItem('zklogin_max_epoch');
  const sessionAddress = localStorage.getItem('zklogin_address');
  if (!jwt || !salt || !secret || !randomness || !maxEpoch) {
    throw new Error('Your Google zkLogin session has expired. Please sign in with Google again.');
  }
  if (!sessionAddress) {
    throw new Error('Your Google zkLogin address is missing. Please sign in with Google again.');
  }

  const ephemeralKeypair = Ed25519Keypair.fromSecretKey(secret);
  const bytes = fromBase64(transaction);
  const claims = decodeJwt(jwt);
  const jwtNonce = (claims as { nonce?: unknown }).nonce;
  if (
    typeof jwtNonce !== 'string' ||
    generateNonce(ephemeralKeypair.getPublicKey(), Number(maxEpoch), randomness) !== jwtNonce
  ) {
    throw new Error('Your Google zkLogin credentials no longer match. Please sign in with Google again.');
  }
  const proof = await authApi.zkLoginProof({
    jwt,
    extendedEphemeralPublicKey: getExtendedEphemeralPublicKey(ephemeralKeypair.getPublicKey()),
    maxEpoch,
    jwtRandomness: randomness,
    salt,
  });
  const addressSeed = genAddressSeed(
    BigInt(salt),
    'sub',
    String(claims.sub),
    String(Array.isArray(claims.aud) ? claims.aud[0] : claims.aud)
  ).toString();
  const derivedAddress = (await authApi.zkLoginAddress(jwt)).address.toLowerCase();
  if (derivedAddress !== sessionAddress.toLowerCase()) {
    throw new Error(
      'Your Google zkLogin address changed because the server configuration changed. ' +
      'Restore the original ZKLOGIN_SALT_SECRET and sign in again.'
    );
  }
  const zkLoginSigner = new ZkLoginSigner({
    ephemeralSigner: ephemeralKeypair,
    inputs: { ...proof, addressSeed },
    maxEpoch: Number(maxEpoch),
    legacyAddress: false,
    address: sessionAddress,
  });
  const { signature: zkLoginSignature } = await zkLoginSigner.signTransaction(bytes);
  const result = await accessApi.executeSponsored(
    toBase64(bytes),
    zkLoginSignature
  );
  return accessApi.confirmAccess(operation.historyId, {
    digest: result.digest,
    granteeAddr: operation.granteeAddr,
    action: operation.action || 'grant',
    scope: operation.scope,
    entryIds: operation.entryIds,
    expiryMs: operation.expiryMs,
  });
}

export function useGrantFullAccess() {
  const queryClient = useQueryClient();
  const signAndExecute = useSignAndExecuteTransaction();
  const walletAccount = useCurrentAccount();

  return useMutation({
    mutationFn: async ({
      historyId,
      granteeAddr,
      expiryMs = 0,
    }: {
      historyId: string;
      granteeAddr: string;
      expiryMs?: number;
    }) => {
      if (!walletAccount && DEMO_ACCESS_MODE) {
        return accessApi.demoGrantAccess({
          historyId,
          granteeAddr,
          action: 'grant',
          scope: 'full',
          expiryMs,
        });
      }
      const { transaction } = await accessApi.prepareGrantFullAccess(historyId, granteeAddr, expiryMs, !walletAccount);
      const result = walletAccount
        ? await signAndExecute.mutateAsync({ transaction })
        : await executeZkLoginTransaction(transaction, { historyId, granteeAddr, expiryMs, scope: 'full' });
      if (!result.digest) throw new Error('Wallet did not return a transaction digest');
      if (!walletAccount) return result;
      return accessApi.confirmAccess(historyId, {
          digest: result.digest,
          granteeAddr,
          action: 'grant',
          scope: 'full',
          expiryMs,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['history', 'full', variables.historyId] });
    },
  });
}

export function useGrantPartialAccess() {
  const queryClient = useQueryClient();
  const signAndExecute = useSignAndExecuteTransaction();
  const walletAccount = useCurrentAccount();

  return useMutation({
    mutationFn: async ({
      historyId,
      granteeAddr,
      entryIds,
      expiryMs = 0,
    }: {
      historyId: string;
      granteeAddr: string;
      entryIds: number[];
      expiryMs?: number;
    }) => {
      if (!walletAccount && DEMO_ACCESS_MODE) {
        return accessApi.demoGrantAccess({
          historyId,
          granteeAddr,
          action: 'grant',
          scope: 'partial',
          entryIds,
          expiryMs,
        });
      }
      const { transaction } = await accessApi.prepareGrantPartialAccess(historyId, granteeAddr, entryIds, expiryMs, !walletAccount);
      const result = walletAccount
        ? await signAndExecute.mutateAsync({ transaction })
        : await executeZkLoginTransaction(transaction, { historyId, granteeAddr, entryIds, expiryMs, scope: 'partial' });
      if (!result.digest) throw new Error('Wallet did not return a transaction digest');
      if (!walletAccount) return result;
      return accessApi.confirmAccess(historyId, {
          digest: result.digest,
          granteeAddr,
          action: 'grant',
          scope: 'partial',
          entryIds,
          expiryMs,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['history', 'full', variables.historyId] });
    },
  });
}

export function useRevokeAccess() {
  const queryClient = useQueryClient();
  const signAndExecute = useSignAndExecuteTransaction();
  const walletAccount = useCurrentAccount();

  return useMutation({
    mutationFn: async ({ historyId, granteeAddr }: { historyId: string; granteeAddr: string }) => {
      if (!walletAccount && DEMO_ACCESS_MODE) {
        return accessApi.demoGrantAccess({
          historyId,
          granteeAddr,
          action: 'revoke',
        });
      }
      const { transaction } = await accessApi.prepareRevokeAccess(historyId, granteeAddr, !walletAccount);
      const result = walletAccount
        ? await signAndExecute.mutateAsync({ transaction })
        : await executeZkLoginTransaction(transaction, { historyId, granteeAddr, action: 'revoke' });
      if (!result.digest) throw new Error('Wallet did not return a transaction digest');
      return accessApi.confirmAccess(historyId, {
        digest: result.digest,
        granteeAddr,
        action: 'revoke',
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['history', 'full', variables.historyId] });
    },
  });
}
