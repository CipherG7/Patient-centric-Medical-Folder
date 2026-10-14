import { useNavigate, Navigate } from 'react-router-dom';
import { isPlatformAdminAddress, useActiveAccount } from '@/lib/auth';
import { useCurrentAccount, useSignPersonalMessage } from '@mysten/dapp-kit';
import { authApi } from '@/lib/api';
import { roleLabel } from '@/lib/utils';
import { WalletAddress } from '@/components/WalletAddress';
import type { UserRole } from '@/types';
import { Shield, User, Stethoscope, FlaskConical, Building2, ChevronRight, ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';

const roles: { value: UserRole; icon: React.ReactNode; description: string }[] = [
  { value: 'patient', icon: <User className="h-5 w-5" />, description: 'Access your medical history, manage consent, view audit logs' },
  { value: 'doctor', icon: <Stethoscope className="h-5 w-5" />, description: 'Search patients, view shared records, request access' },
  { value: 'lab_tech', icon: <FlaskConical className="h-5 w-5" />, description: 'Upload lab results, add new entries to patient records' },
  { value: 'pharmacist', icon: <FlaskConical className="h-5 w-5" />, description: 'Add prescriptions and pharmaceutical records' },
  { value: 'hospital_admin', icon: <Building2 className="h-5 w-5" />, description: 'Manage institutional staff wallets and credentials' },
];

export function RoleSelection() {
  const [selectedRole, setSelectedRole] = useState<UserRole>('patient');
  const [authError, setAuthError] = useState('');
  const [authenticating, setAuthenticating] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [googleAddress, setGoogleAddress] = useState('');
  const navigate = useNavigate();
  const account = useActiveAccount();
  const walletAccount = useCurrentAccount();
  const signPersonalMessage = useSignPersonalMessage();

  const pendingGoogleToken = sessionStorage.getItem('zklogin_pending_jwt');
  const isGoogleLogin = Boolean(pendingGoogleToken);
  const availableRoles = isPlatformAdminAddress(account?.address)
    ? [...roles, { value: 'platform_admin' as const, icon: <Shield className="h-5 w-5" />, description: 'Verify institutions, manage platform-wide settings' }]
    : roles;
  useEffect(() => {
    if (!pendingGoogleToken || account) return;
    void authApi.zkLoginAddress(pendingGoogleToken)
      .then((response) => setGoogleAddress(response.address))
      .catch(() => setGoogleAddress(''));
  }, [account, pendingGoogleToken]);

  const address = account?.address || googleAddress;
  if (!account && !pendingGoogleToken) return <Navigate to="/login" replace />;

  const handleContinue = async () => {
    setAuthenticating(true);
    setAuthError('');
    try {
      const pendingToken = sessionStorage.getItem('zklogin_pending_jwt');
      const pendingChallengeId = sessionStorage.getItem('zklogin_pending_challenge_id');
      if (pendingToken && pendingChallengeId) {
        const session = await authApi.zkLoginVerify(
          pendingChallengeId,
          pendingToken,
          selectedRole,
          acceptedTerms
        );
        localStorage.setItem('zklogin_address', session.address);
        localStorage.setItem('zklogin_issuer', 'https://accounts.google.com');
        sessionStorage.removeItem('zklogin_pending_jwt');
        sessionStorage.removeItem('zklogin_pending_challenge_id');
        sessionStorage.removeItem('zklogin_ephemeral_secret');
        sessionStorage.removeItem('zklogin_ephemeral_public');
        sessionStorage.removeItem('zklogin_randomness');
        sessionStorage.removeItem('zklogin_max_epoch');
        localStorage.setItem('auth_session', session.token);
        localStorage.setItem('auth_role', session.role);
        localStorage.setItem('terms_accepted', 'true');
        sessionStorage.setItem('selectedRole', session.role);
        navigate('/dashboard', { state: { role: session.role } });
        return;
      }
      if (!walletAccount) {
        const existingRole = localStorage.getItem('auth_role') as UserRole | null;
        if (localStorage.getItem('auth_session') && existingRole) {
          sessionStorage.setItem('selectedRole', existingRole);
          navigate('/dashboard', { state: { role: existingRole } });
          return;
        }
        setAuthError('Continue with Google again to renew this sign-in.');
        return;
      }
      const challenge = await authApi.challenge(walletAccount.address);
      const signed = await signPersonalMessage.mutateAsync({
        message: new TextEncoder().encode(challenge.message),
        account: walletAccount,
      });
      const session = await authApi.verify(
        walletAccount.address,
        challenge.message,
        signed.signature,
        selectedRole,
        acceptedTerms
      );
      localStorage.setItem('auth_session', session.token);
      localStorage.setItem('auth_role', session.role);
      localStorage.setItem('terms_accepted', 'true');
      sessionStorage.setItem('selectedRole', session.role);
      navigate('/dashboard', { state: { role: session.role } });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Wallet authentication failed');
    } finally {
      setAuthenticating(false);
    }
  };

  const handleBackToLogin = () => {
    sessionStorage.removeItem('selectedRole');
    localStorage.removeItem('auth_session');
    localStorage.removeItem('auth_role');
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl items-center">
        <div className="w-full rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,35,45,0.12)] sm:p-10">
          <div className="mb-8 flex items-center gap-3">
            <img src="/Medichain.svg" alt="MediChain logo" className="h-11 w-11 object-contain" />
            <div>
              <p className="font-bold tracking-tight text-slate-900">HealthVault</p>
              <p className="text-xs text-teal-600">
                {isGoogleLogin ? 'Google sign-in ready to verify' : 'Signed in successfully'}
              </p>
            </div>
          </div>
          <button onClick={handleBackToLogin} className="btn-ghost mb-5 px-0 text-sm">
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </button>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Choose your role</h1>
          <p className="mt-2 text-sm text-slate-500">Choose the workspace that best describes how you use HealthVault.</p>
          {address ? (
            <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
                Your wallet address
              </p>
              <div className="shrink-0 rounded-lg border border-teal-200 bg-white px-2 py-1.5 text-xs text-slate-700">
                <WalletAddress address={address} chars={8} />
              </div>
            </div>
          ) : isGoogleLogin ? (
            <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              Preparing your account address. It will appear here shortly.
            </p>
          ) : null}
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {availableRoles.map((role) => (
              <button
                key={role.value}
                onClick={() => setSelectedRole(role.value)}
                className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all ${
                  selectedRole === role.value ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-400/30' : 'border-slate-200 bg-white hover:border-teal-200 hover:bg-slate-50'
                }`}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${selectedRole === role.value ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {role.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{roleLabel(role.value)}</p>
                  <p className="text-xs text-gray-500">{role.description}</p>
                </div>
                {selectedRole === role.value && <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-teal-600" />}
              </button>
            ))}
          </div>
          {authError && <p className="mt-4 text-center text-xs text-red-600">{authError}</p>}
          <label className="mt-6 flex items-start gap-3 text-xs leading-5 text-slate-600">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(event) => setAcceptedTerms(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span>
              I agree to the <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold text-teal-700 underline">Terms and Conditions</a> and <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-teal-700 underline">Privacy Policy</a>.
            </span>
          </label>
          <button onClick={handleContinue} disabled={authenticating} className="btn-primary mt-6 w-full">
            {authenticating
              ? isGoogleLogin ? 'Verifying Google sign-in…' : 'Authenticating wallet…'
              : isGoogleLogin ? 'Verify and continue' : 'Continue to dashboard'}
          </button>
        </div>
      </div>
    </div>
  );
}
