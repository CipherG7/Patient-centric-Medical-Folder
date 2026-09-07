import { useState } from 'react';
import { useActiveAccount } from '@/lib/auth';
import { usePatientHistory } from '@/hooks/use-patient';
import { useFullHistory } from '@/hooks/use-history';
import { useGrantFullAccess, useGrantPartialAccess, useRevokeAccess } from '@/hooks/use-access';
import { StatusBadge } from '@/components/StatusBadge';
import { CardSkeleton } from '@/components/LoadingSkeleton';
import { shortenAddress, formatTimestamp } from '@/lib/utils';
import { GrantScope, type HistoryEntry } from '@/types';
import {
  Shield,
  ShieldOff,
  Plus,
  X,
  Calendar,
  AlertCircle,
  CheckCircle,
  Loader2,
  UserPlus,
  Clock,
  RefreshCw,
} from 'lucide-react';

export function PatientConsent() {
  const account = useActiveAccount();
  const patientAddr = account?.address || '';

  const { data: historyLookup, isLoading: lookupLoading } = usePatientHistory(patientAddr);
  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useFullHistory(historyLookup?.historyId);

  const grantFullMutation = useGrantFullAccess();
  const grantPartialMutation = useGrantPartialAccess();
  const revokeMutation = useRevokeAccess();

  const [showGrantForm, setShowGrantForm] = useState(false);
  const [granteeAddr, setGranteeAddr] = useState('');
  const [grantScope, setGrantScope] = useState<GrantScope>(GrantScope.Full);
  const [selectedEntryIds, setSelectedEntryIds] = useState<number[]>([]);
  const [expiryDate, setExpiryDate] = useState('');
  const [formError, setFormError] = useState('');

  const historyId = historyLookup?.historyId;
  const entries = historyData?.entries || [];
  const isLoading = lookupLoading || historyLoading;

  // For demo purposes, simulate active grants from on-chain data
  // In production, these would come from the PermissionStore on-chain
  const [activeGrants, setActiveGrants] = useState<
    { granteeAddr: string; scope: GrantScope; entryIds?: number[]; expiryMs: number }[]
  >([]);

  const resetForm = () => {
    setGranteeAddr('');
    setGrantScope(GrantScope.Full);
    setSelectedEntryIds([]);
    setExpiryDate('');
    setFormError('');
    setShowGrantForm(false);
  };

  const handleGrant = async () => {
    if (!historyId) return;
    setFormError('');

    if (!granteeAddr.match(/^0x[0-9a-fA-F]{40,64}$/)) {
      setFormError('Invalid Sui address format');
      return;
    }

    const expiryMs = expiryDate ? new Date(expiryDate).getTime() : 0;

    try {
      if (grantScope === GrantScope.Full) {
        await grantFullMutation.mutateAsync({ historyId, granteeAddr, expiryMs });
      } else {
        if (selectedEntryIds.length === 0) {
          setFormError('Select at least one entry for partial access');
          return;
        }
        await grantPartialMutation.mutateAsync({
          historyId,
          granteeAddr,
          entryIds: selectedEntryIds,
          expiryMs,
        });
      }

      setActiveGrants((prev) => [
        ...prev,
        { granteeAddr, scope: grantScope, entryIds: selectedEntryIds, expiryMs },
      ]);
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Grant failed');
    }
  };

  const handleRevoke = async (addr: string) => {
    if (!historyId) return;
    try {
      await revokeMutation.mutateAsync({ historyId, granteeAddr: addr });
      setActiveGrants((prev) => prev.filter((g) => g.granteeAddr !== addr));
    } catch (err) {
      console.error('Revoke failed:', err);
    }
  };

  const handleToggleEntry = (entryId: number) => {
    setSelectedEntryIds((prev) =>
      prev.includes(entryId) ? prev.filter((id) => id !== entryId) : [...prev, entryId]
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Shield className="h-5 w-5 text-teal-600" />
            Consent Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Grant and revoke access to your medical history
          </p>
        </div>
        {historyId && (
          <button onClick={() => setShowGrantForm(!showGrantForm)} className="btn-primary">
            <Plus className="h-4 w-4" />
            {showGrantForm ? 'Cancel' : 'New Grant'}
          </button>
        )}
      </div>

      {/* Grant form */}
      {showGrantForm && (
        <div className="card border-teal-200 bg-teal-50/30 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">Grant Access</h3>

          <div>
            <label className="label">Grantee Wallet Address</label>
            <input
              type="text"
              value={granteeAddr}
              onChange={(e) => setGranteeAddr(e.target.value)}
              placeholder="0x..."
              className="input font-mono text-xs"
            />
          </div>

          <div>
            <label className="label">Access Scope</label>
            <div className="flex gap-3">
              <button
                onClick={() => setGrantScope(GrantScope.Full)}
                className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  grantScope === GrantScope.Full
                    ? 'border-teal-400 bg-teal-50 text-teal-800'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <CheckCircle className="h-4 w-4 inline mr-1.5" />
                Full History
              </button>
              <button
                onClick={() => setGrantScope(GrantScope.Partial)}
                className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  grantScope === GrantScope.Partial
                    ? 'border-teal-400 bg-teal-50 text-teal-800'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Clock className="h-4 w-4 inline mr-1.5" />
                Specific Entries
              </button>
            </div>
          </div>

          {grantScope === GrantScope.Partial && entries.length > 0 && (
            <div>
              <label className="label">Select Entries</label>
              <div className="max-h-40 overflow-y-auto space-y-1.5 border border-gray-200 rounded-lg p-2">
                {entries.map((entry, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleToggleEntry(idx)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded text-left text-sm transition-colors ${
                      selectedEntryIds.includes(idx)
                        ? 'bg-teal-50 border border-teal-200'
                        : 'hover:bg-gray-50 border border-transparent'
                    }`}
                  >
                    <div
                      className={`h-4 w-4 rounded border-2 flex items-center justify-center ${
                        selectedEntryIds.includes(idx)
                          ? 'border-teal-600 bg-teal-600'
                          : 'border-gray-300'
                      }`}
                    >
                      {selectedEntryIds.includes(idx) && (
                        <CheckCircle className="h-3 w-3 text-white" />
                      )}
                    </div>
                    <span className="text-xs text-gray-500 font-mono">#{idx}</span>
                    <span className="text-xs text-gray-700">
                      Type {entry.entryType} · {entry.timestampMs && formatTimestamp(entry.timestampMs)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="label">Expiry Date (optional)</label>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <input
                type="datetime-local"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="input flex-1"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Leave empty for no expiry</p>
          </div>

          {formError && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {formError}
            </div>
          )}

          <button
            onClick={handleGrant}
            disabled={grantFullMutation.isPending || grantPartialMutation.isPending}
            className="btn-primary w-full"
          >
            {grantFullMutation.isPending || grantPartialMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                Grant Access
              </>
            )}
          </button>
        </div>
      )}

      {/* Active grants list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">
            Active Grants
            <span className="text-gray-400 font-normal ml-2">({activeGrants.length})</span>
          </h2>
        </div>

        {activeGrants.length === 0 ? (
          <div className="card text-center py-6">
            <ShieldOff className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No active grants. Grant access to a healthcare provider to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeGrants.map((grant, idx) => {
              const isExpired = grant.expiryMs > 0 && grant.expiryMs < Date.now();
              return (
                <div key={idx} className="card flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800">
                        {shortenAddress(grant.granteeAddr)}
                      </span>
                      <StatusBadge
                        variant={isExpired ? 'expired' : 'granted'}
                        label={isExpired ? 'Expired' : 'Active'}
                      />
                      <StatusBadge
                        variant={grant.scope === GrantScope.Full ? 'verified' : 'active'}
                        label={grant.scope === GrantScope.Full ? 'Full Access' : 'Partial'}
                      />
                    </div>
                    {grant.scope === GrantScope.Partial && grant.entryIds && (
                      <p className="text-xs text-gray-500 mt-1">
                        Entries: {grant.entryIds.join(', ')}
                      </p>
                    )}
                    {grant.expiryMs > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Expires: {formatTimestamp(grant.expiryMs)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRevoke(grant.granteeAddr)}
                    disabled={revokeMutation.isPending}
                    className="btn-ghost text-red-600 hover:text-red-800 hover:bg-red-50 shrink-0"
                    title="Revoke access"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Note */}
      <p className="text-xs text-gray-400 text-center">
        All grant and revoke actions are recorded on-chain in the audit log for transparency.
      </p>
    </div>
  );
}
