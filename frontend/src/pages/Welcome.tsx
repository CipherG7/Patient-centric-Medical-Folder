import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ConnectButton, useDisconnectWallet } from '@mysten/dapp-kit';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  decodeJwt,
  generateNonce,
  generateRandomness,
  getExtendedEphemeralPublicKey,
  jwtToAddress,
} from '@mysten/sui/zklogin';
import { useActiveAccount } from '@/lib/auth';
import { Activity, Shield, KeyRound, Wallet, CheckCircle, LogOut } from 'lucide-react';

const ZKLOGIN_CLIENT_ID =
  import.meta.env.VITE_ZKLOGIN_CLIENT_ID ?? '135467475488-pj9aeoibciptv27p9cbuucron0vslb72.apps.googleusercontent.com';
const SUI_GRAPHQL_URL = 'https://graphql.testnet.sui.io/graphql';

function getZkLoginRedirectUri(): string {
  return 'http://localhost:5173/login';
}

async function getCurrentEpoch(): Promise<number> {
  const response = await fetch(SUI_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'query { epoch { epochId } }' }),
  });

  if (!response.ok) {
    throw new Error(`Sui GraphQL request failed: ${response.status}`);
  }

  const result: { data?: { epoch?: { epochId?: number | string } }; errors?: unknown[] } = await response.json();
  const epoch = result.data?.epoch?.epochId;
  if (result.errors?.length || epoch === undefined) {
    throw new Error('Sui GraphQL did not return the current epoch');
  }
  return Number(epoch);
}

export function Welcome() {
  const [loginMethod, setLoginMethod] = useState<'zk' | 'wallet'>('zk');
  const [zkLoginUrl, setZkLoginUrl] = useState('');
  const [zkLoading, setZkLoading] = useState(false);
  const [zkError, setZkError] = useState('');
  const [signedInMessage, setSignedInMessage] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const account = useActiveAccount();
  const { mutate: disconnectWallet } = useDisconnectWallet();

  const setupZkLogin = useCallback(async () => {
    setZkLoading(true);
    setZkError('');
    try {
      const maxEpoch = (await getCurrentEpoch()) + 2;
      const ephemeralKeyPair = new Ed25519Keypair();
      const randomness = generateRandomness();
      const nonce = generateNonce(ephemeralKeyPair.getPublicKey(), maxEpoch, randomness);
      const salt = localStorage.getItem('zklogin_salt') ?? crypto.randomUUID().replace(/-/g, '');

      localStorage.setItem('zklogin_salt', salt);
      localStorage.setItem('zklogin_randomness', randomness.toString());
      localStorage.setItem('zklogin_max_epoch', maxEpoch.toString());
      localStorage.setItem('zklogin_ephemeral_secret', ephemeralKeyPair.getSecretKey());
      localStorage.setItem('zklogin_ephemeral_public', getExtendedEphemeralPublicKey(ephemeralKeyPair.getPublicKey()));

      const params = new URLSearchParams({
        client_id: ZKLOGIN_CLIENT_ID,
        redirect_uri: getZkLoginRedirectUri(),
        response_type: 'id_token',
        scope: 'openid email profile',
        nonce,
        prompt: 'select_account',
      });
      setZkLoginUrl(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
    } catch (error) {
      console.error('Unable to prepare zkLogin', error);
      setZkError('We could not prepare secure sign-in. Please try again.');
    } finally {
      setZkLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('id_token');
    if (!token) {
      if (account && !(location.state as { stayOnLogin?: boolean } | null)?.stayOnLogin) {
        navigate('/choose-role', { replace: true });
        return;
      }
      void setupZkLogin();
      return;
    }

    try {
      const salt = localStorage.getItem('zklogin_salt');
      if (!salt) throw new Error('Missing zkLogin salt');
      const decodedJwt = decodeJwt(token);
      if (decodedJwt.aud !== ZKLOGIN_CLIENT_ID) {
        throw new Error('The OAuth token audience does not match the configured client ID');
      }
      const address = jwtToAddress(token, BigInt(`0x${salt}`), false);
      localStorage.setItem('zklogin_jwt', token);
      localStorage.setItem('zklogin_address', address);
      localStorage.setItem('zklogin_issuer', decodedJwt.iss);
      localStorage.setItem('zklogin_subject', decodedJwt.sub);
      sessionStorage.setItem('zklogin_signed_in', 'true');
      window.history.replaceState({}, document.title, window.location.pathname);
      navigate('/choose-role', { replace: true });
    } catch (error) {
      console.error('Unable to complete zkLogin', error);
      setZkError('Sign-in could not be completed. Please try again.');
    }
  }, [account, location.state, navigate, setupZkLogin]);

  const handleSignOut = () => {
    localStorage.removeItem('zklogin_jwt');
    localStorage.removeItem('zklogin_address');
    localStorage.removeItem('zklogin_issuer');
    localStorage.removeItem('zklogin_subject');
    sessionStorage.removeItem('zklogin_signed_in');
    sessionStorage.removeItem('selectedRole');
    disconnectWallet();
    setSignedInMessage(false);
    setLoginMethod('zk');
    void setupZkLogin();
  };

  useEffect(() => {
    setSignedInMessage(sessionStorage.getItem('zklogin_signed_in') === 'true');
  }, [account]);

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-white/80 bg-white/75 shadow-[0_24px_80px_rgba(15,35,45,0.12)] backdrop-blur lg:grid-cols-[0.9fr_1.1fr]">
          <section className="relative overflow-hidden bg-[#102f38] px-7 py-10 text-white sm:px-12 lg:px-14 lg:py-14">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[36px] border-teal-400/10" />
            <div className="absolute -bottom-28 -left-20 h-64 w-64 rounded-full bg-teal-400/10 blur-2xl" />
            <div className="relative">
              <div className="mb-16 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-400 text-[#102f38]">
                  <Activity className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold tracking-tight">MediChain</p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-teal-200/60">Care, connected</p>
                </div>
              </div>
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-teal-300">Your health. Your record.</p>
              <h1 className="max-w-md text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
                A clearer view of your care journey.
              </h1>
              <p className="mt-6 max-w-md text-sm leading-7 text-teal-50/70">
                Keep your medical history portable, verifiable, and always in your control — across the providers you trust.
              </p>
              <div className="mt-12 grid max-w-sm grid-cols-2 gap-3">
                {['Patient-owned', 'Blockchain verified'].map((item) => (
                  <div key={item} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs text-teal-50/80">
                    <Shield className="mb-2 h-4 w-4 text-teal-300" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="px-6 py-8 sm:px-10 lg:px-14 lg:py-12">
            <div className="mb-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Get started</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Enter your workspace</h2>
              <p className="mt-2 text-sm text-slate-500">No crypto knowledge needed. Sign in with Google, or connect a wallet.</p>
            </div>

            <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">How would you like to sign in?</h2>
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-teal-600"><span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> Secure</span>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-2">
                <button onClick={() => setLoginMethod('zk')} className={`rounded-lg border p-3 text-left text-xs ${loginMethod === 'zk' ? 'border-teal-400 bg-teal-50' : 'border-slate-200 bg-white'}`}>
                  <KeyRound className="mb-1 h-4 w-4 text-teal-600" />
                  <span className="font-semibold text-slate-800">Google sign-in</span>
                  <span className="mt-1 block text-slate-500">No wallet required</span>
                </button>
                <button onClick={() => setLoginMethod('wallet')} className={`rounded-lg border p-3 text-left text-xs ${loginMethod === 'wallet' ? 'border-teal-400 bg-teal-50' : 'border-slate-200 bg-white'}`}>
                  <Wallet className="mb-1 h-4 w-4 text-teal-600" />
                  <span className="font-semibold text-slate-800">Connect wallet</span>
                  <span className="mt-1 block text-slate-500">For existing crypto users</span>
                </button>
              </div>
              {loginMethod === 'zk' ? (
                <>
                  <button onClick={() => { window.location.href = zkLoginUrl; }} disabled={zkLoading || !zkLoginUrl} className="btn-primary w-full">
                    <KeyRound className="h-4 w-4" /> {zkLoading ? 'Preparing secure sign-in…' : 'Continue with Google'}
                  </button>
                  <p className="mt-2 text-center text-xs text-slate-500">Your Google account stays private from the blockchain.</p>
                  {zkError && <p className="mt-2 text-center text-xs text-red-600">{zkError}</p>}
                </>
              ) : <ConnectButton className="!btn-primary !w-full !justify-center" />}
              {account && (
                <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-teal-800">
                    <CheckCircle className="h-4 w-4" />
                    {signedInMessage ? 'You have successfully signed in.' : 'You are signed in.'}
                  </div>
                  <p className="mt-1 text-xs text-teal-700">
                    Account: {account.address.slice(0, 6)}…{account.address.slice(-4)}
                  </p>
                  <button onClick={handleSignOut} className="btn-outline mt-3 w-full text-xs">
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out and use another account or wallet
                  </button>
                </div>
              )}
            </div>

            {!account && <p className="mt-4 text-center text-xs text-gray-400">Sign in above to continue</p>}
            </section>
        </div>
      </div>
    </div>
  );
}
