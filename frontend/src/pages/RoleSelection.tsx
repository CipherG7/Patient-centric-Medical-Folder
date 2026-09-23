import { useNavigate, Navigate } from 'react-router-dom';
import { useActiveAccount } from '@/lib/auth';
import { useCurrentAccount, useSignPersonalMessage } from '@mysten/dapp-kit';
import { authApi } from '@/lib/api';
import { roleLabel } from '@/lib/utils';
import type { UserRole } from '@/types';
import { Shield, User, Stethoscope, FlaskConical, Building2, ChevronRight, ArrowLeft } from 'lucide-react';
import { useState } from 'react';

const roles: { value: UserRole; icon: React.ReactNode; description: string }[] = [
  { value: 'patient', icon: <User className="h-5 w-5" />, description: 'Access your medical history, manage consent, view audit logs' },
  { value: 'doctor', icon: <Stethoscope className="h-5 w-5" />, description: 'Search patients, view shared records, request access' },
  { value: 'lab_tech', icon: <FlaskConical className="h-5 w-5" />, description: 'Upload lab results, add new entries to patient records' },
  { value: 'pharmacist', icon: <FlaskConical className="h-5 w-5" />, description: 'Add prescriptions and pharmaceutical records' },
  { value: 'hospital_admin', icon: <Building2 className="h-5 w-5" />, description: 'Manage institutional staff wallets and credentials' },
  { value: 'platform_admin', icon: <Shield className="h-5 w-5" />, description: 'Verify institutions, manage platform-wide settings' },
];

export function RoleSelection() {
  const [selectedRole, setSelectedRole] = useState<UserRole>('patient');
  const [authError, setAuthError] = useState('');
  const [authenticating, setAuthenticating] = useState(false);
  const navigate = useNavigate();
  const account = useActiveAccount();
  const walletAccount = useCurrentAccount();
  const signPersonalMessage = useSignPersonalMessage();

  if (!account) return <Navigate to="/login" replace />;

  const handleContinue = async () => {
    if (!walletAccount) {
      setAuthError('Connect the wallet that belongs to this person before continuing.');
      return;
    }
    setAuthenticating(true);
    setAuthError('');
    try {
      const challenge = await authApi.challenge(walletAccount.address);
      const signed = await signPersonalMessage.mutateAsync({
        message: new TextEncoder().encode(challenge.message),
        account: walletAccount,
      });
      const session = await authApi.verify(
        walletAccount.address,
        challenge.message,
        signed.signature,
        selectedRole
      );
      localStorage.setItem('auth_session', session.token);
      localStorage.setItem('auth_role', session.role);
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
              <p className="text-xs text-teal-600">Signed in successfully</p>
            </div>
          </div>
          <button onClick={handleBackToLogin} className="btn-ghost mb-5 px-0 text-sm">
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </button>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Choose your role</h1>
          <p className="mt-2 text-sm text-slate-500">Choose the workspace that best describes how you use HealthVault.</p>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {roles.map((role) => (
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
          <button onClick={handleContinue} disabled={authenticating} className="btn-primary mt-6 w-full">
            {authenticating ? 'Authenticating wallet…' : 'Continue to dashboard'}
          </button>
        </div>
      </div>
    </div>
  );
}
