import { useState } from 'react';
import { useActiveAccount } from '@/lib/auth';
import { useInstitutions, useRegisterInstitution, useRevokeInstitution, useReinstateInstitution } from '@/hooks/use-institutions';
import { StatusBadge } from '@/components/StatusBadge';
import { CardSkeleton } from '@/components/LoadingSkeleton';
import { shortenAddress, formatTimestamp } from '@/lib/utils';
import {
  Shield,
  ShieldOff,
  Building2,
  Plus,
  AlertCircle,
  CheckCircle,
  Loader2,
  RefreshCw,
  X,
  Search,
  Key,
  UserCheck,
  UserX,
} from 'lucide-react';

export function PlatformAdminDashboard() {
  const account = useActiveAccount();
  const { data: institutionsData, isLoading, error, refetch } = useInstitutions();
  const registerMutation = useRegisterInstitution();
  const revokeMutation = useRevokeInstitution();
  const reinstateMutation = useReinstateInstitution();

  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [newAddr, setNewAddr] = useState('');
  const [newName, setNewName] = useState('');
  const [newLicense, setNewLicense] = useState('');
  const [adminCapId, setAdminCapId] = useState('');
  const [formError, setFormError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const institutions = institutionsData?.data || [];

  const handleRegister = async () => {
    setFormError('');

    if (!newAddr.match(/^0x[0-9a-fA-F]{40,64}$/)) {
      setFormError('Invalid wallet address');
      return;
    }
    if (!newName.trim() || !newLicense.trim()) {
      setFormError('Name and license number are required');
      return;
    }
    if (!adminCapId.match(/^0x[0-9a-fA-F]{40,64}$/)) {
      setFormError('Invalid AdminCap object ID');
      return;
    }

    try {
      await registerMutation.mutateAsync({
        institutionAddr: newAddr,
        name: newName,
        licenseNumber: newLicense,
        adminCapId,
      });

      setNewAddr('');
      setNewName('');
      setNewLicense('');
      setShowRegisterForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Registration failed');
    }
  };

  const handleRevoke = async (addr: string) => {
    if (!adminCapId) {
      setFormError('AdminCap object ID is required for this action');
      return;
    }
    setActionLoading(addr);
    try {
      await revokeMutation.mutateAsync({ institutionAddr: addr, adminCapId });
    } catch (err) {
      console.error('Revoke failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReinstate = async (addr: string) => {
    if (!adminCapId) {
      setFormError('AdminCap object ID is required for this action');
      return;
    }
    setActionLoading(addr);
    try {
      await reinstateMutation.mutateAsync({ institutionAddr: addr, adminCapId });
    } catch (err) {
      console.error('Reinstate failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Shield className="h-5 w-5 text-gray-600" />
            Platform Admin Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Verify, revoke, and manage institutions on the platform
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn-outline text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button onClick={() => setShowRegisterForm(!showRegisterForm)} className="btn-primary">
            <Plus className="h-4 w-4" />
            {showRegisterForm ? 'Cancel' : 'Register'}
          </button>
        </div>
      </div>

      {/* AdminCap configuration */}
      <div className="card border-gray-200 bg-gray-50">
        <label className="label flex items-center gap-2">
          <Key className="h-4 w-4 text-gray-500" />
          AdminCap Object ID
        </label>
        <input
          type="text"
          value={adminCapId}
          onChange={(e) => setAdminCapId(e.target.value)}
          placeholder="0x... (AdminCap object ID from package deployment)"
          className="input font-mono text-xs"
        />
        <p className="text-xs text-gray-400 mt-1">
          Required for all gated actions (register, revoke, reinstate).
          This is the AdminCap received when the package was published.
        </p>
      </div>

      {/* Register form */}
      {showRegisterForm && (
        <div className="card border-teal-200 bg-teal-50/30 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">Register New Institution</h3>

          <div>
            <label className="label">Institution Wallet Address</label>
            <input
              type="text"
              value={newAddr}
              onChange={(e) => setNewAddr(e.target.value)}
              placeholder="0x..."
              className="input font-mono text-sm"
            />
          </div>

          <div>
            <label className="label">Institution Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. City General Hospital"
              className="input"
            />
          </div>

          <div>
            <label className="label">License Number</label>
            <input
              type="text"
              value={newLicense}
              onChange={(e) => setNewLicense(e.target.value)}
              placeholder="e.g. MED-LIC-2024-001"
              className="input"
            />
          </div>

          {formError && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {formError}
            </div>
          )}

          <button
            onClick={handleRegister}
            disabled={registerMutation.isPending}
            className="btn-primary w-full"
          >
            {registerMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Registering…
              </>
            ) : (
              <>
                <Building2 className="h-4 w-4" />
                Register Institution
              </>
            )}
          </button>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="card border-red-200 bg-red-50">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">Failed to load institutions</p>
              <p className="text-xs text-red-600">{error instanceof Error ? error.message : 'Unknown error'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && <CardSkeleton />}

      {/* Institutions list */}
      {!isLoading && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Registered Institutions
            <span className="text-gray-400 font-normal ml-2">({institutions.length})</span>
          </h2>

          {institutions.length === 0 ? (
            <div className="card text-center py-6">
              <Building2 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No institutions registered yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {institutions.map((inst: any, idx: number) => (
                <div key={idx} className="card flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800">{inst.name}</p>
                      <StatusBadge variant="verified" label="Verified" />
                    </div>
                    <p className="text-xs text-gray-500 font-mono truncate mt-0.5">
                      {shortenAddress(inst.institution_addr)}
                    </p>
                    <p className="text-xs text-gray-400">License: {inst.license_number}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge variant="active" label="Active" />
                    <button
                      onClick={() => handleRevoke(inst.institution_addr)}
                      disabled={actionLoading === inst.institution_addr || !adminCapId}
                      className="btn-ghost text-amber-600 hover:text-amber-800 hover:bg-amber-50 p-1.5"
                      title="Revoke institution"
                    >
                      {actionLoading === inst.institution_addr ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldOff className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
