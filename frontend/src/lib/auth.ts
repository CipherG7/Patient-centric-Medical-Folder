import { useCurrentAccount } from '@mysten/dapp-kit';

export interface ActiveAccount {
  address: string;
}

/**
 * Returns either the connected wallet account or the address created by zkLogin.
 * zkLogin is intentionally kept in local storage so a user can return without
 * installing a wallet extension.
 */
export function useActiveAccount(): ActiveAccount | null {
  const walletAccount = useCurrentAccount();
  const zkLoginAddress = typeof window !== 'undefined' ? localStorage.getItem('zklogin_address') : null;

  return walletAccount ? { address: walletAccount.address } : zkLoginAddress ? { address: zkLoginAddress } : null;
}

export function clearZkLoginSession() {
  localStorage.removeItem('zklogin_jwt');
  localStorage.removeItem('zklogin_address');
  localStorage.removeItem('zklogin_salt');
  localStorage.removeItem('zklogin_randomness');
  localStorage.removeItem('zklogin_max_epoch');
  localStorage.removeItem('zklogin_ephemeral_secret');
  localStorage.removeItem('zklogin_ephemeral_public');
  localStorage.removeItem('zklogin_issuer');
  localStorage.removeItem('zklogin_subject');
}
