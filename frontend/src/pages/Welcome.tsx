import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConnectButton, useDisconnectWallet } from '@mysten/dapp-kit';
import { useActiveAccount } from '@/lib/auth';
import { authApi } from '@/lib/api';
import { usePatientProfile } from '@/hooks/use-patient';
import { Activity, Shield, Wallet, CheckCircle, LogOut } from 'lucide-react';

export function Welcome() {
  const [signedInMessage, setSignedInMessage] = useState(false);
  const navigate = useNavigate();
  const account = useActiveAccount();
  const { data: profile } = usePatientProfile(account?.address);
  const { mutate: disconnectWallet } = useDisconnectWallet();
  const preferredName = profile?.data.display_name?.trim();

  useEffect(() => {
    setSignedInMessage(Boolean(account));
  }, [account]);

  const handleSignOut = () => {
    void authApi.logout().catch(() => undefined);
    localStorage.removeItem('zklogin_jwt');
    localStorage.removeItem('zklogin_address');
    localStorage.removeItem('zklogin_issuer');
    localStorage.removeItem('zklogin_subject');
    sessionStorage.removeItem('zklogin_signed_in');
    sessionStorage.removeItem('selectedRole');
    localStorage.removeItem('auth_session');
    localStorage.removeItem('auth_role');
    disconnectWallet();
    setSignedInMessage(false);
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
                Keep your medical history portable, verifiable, and always in your control across the providers you trust.
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
              <p className="mt-2 text-sm text-slate-500">Connect the wallet belonging to the person using this workspace.</p>
            </div>

            <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Sign in securely</h2>
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-teal-600"><span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> Secure</span>
              </div>
              <ConnectButton className="!btn-primary !w-full !justify-center" />
              {account && (
                <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-teal-800">
                    <CheckCircle className="h-4 w-4" />
                    {preferredName
                      ? `Welcome back, ${preferredName}.`
                      : signedInMessage
                        ? 'You have successfully signed in.'
                        : 'You are signed in.'}
                  </div>
                  <p className="mt-1 text-xs text-teal-700">
                    Account: {account.address.slice(0, 6)}…{account.address.slice(-4)}
                  </p>
                  <button
                    onClick={() => navigate('/choose-role')}
                    className="btn-primary mt-3 w-full text-xs"
                  >
                    Continue to role selection
                  </button>
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
