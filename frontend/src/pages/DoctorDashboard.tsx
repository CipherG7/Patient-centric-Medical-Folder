import { useState } from 'react';
import { useActiveAccount } from '@/lib/auth';
import { usePatientHistory } from '@/hooks/use-patient';
import { useFullHistory } from '@/hooks/use-history';
import { EntryCard } from '@/components/EntryCard';
import { CardSkeleton } from '@/components/LoadingSkeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { shortenAddress } from '@/lib/utils';
import type { HistoryEntry } from '@/types';
import {
  Search,
  User,
  Stethoscope,
  FileText,
  AlertCircle,
  Loader2,
  Shield,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

export function DoctorDashboard() {
  const account = useActiveAccount();
  const [searchAddr, setSearchAddr] = useState('');
  const [submittedAddr, setSubmittedAddr] = useState('');

  const { data: historyLookup, isLoading: lookupLoading, error: lookupError } = usePatientHistory(submittedAddr || undefined);
  const { data: historyData, isLoading: historyLoading, error: historyError, refetch: refetchHistory } = useFullHistory(historyLookup?.historyId);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedAddr(searchAddr);
  };

  const isLoading = lookupLoading || historyLoading;
  const error = lookupError || historyError;
  const historyId = historyLookup?.historyId;

  const handleVerifyEntry = async (entry: HistoryEntry): Promise<boolean> => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return !!entry.contentHash && entry.contentHash.length > 0;
  };

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-navy-600" />
            Doctor / Clinician Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {account ? shortenAddress(account.address) : 'Not connected'}
          </p>
        </div>
      </div>

      {/* Patient search */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-navy-600" />
          Search Patient by Wallet Address
        </h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchAddr}
            onChange={(e) => setSearchAddr(e.target.value)}
            placeholder="0x..."
            className="input font-mono text-sm flex-1"
          />
          <button
            type="submit"
            disabled={!searchAddr || isLoading}
            className="btn-secondary"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Search
          </button>
        </form>
      </div>

      {/* Results */}
      {submittedAddr && (
        <>
          {isLoading && <CardSkeleton />}

          {error && (
            <div className="card border-amber-200 bg-amber-50">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800">No History Found</p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    {error instanceof Error ? error.message : 'This patient may not have created a history, or you may not have access.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {historyId && !isLoading && (
            <>
              {/* Patient info */}
              <div className="flex items-center gap-3 card">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-50">
                  <User className="h-5 w-5 text-navy-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">
                    Patient: {shortenAddress(submittedAddr)}
                  </p>
                  <p className="text-xs text-gray-500">
                    History ID: {shortenAddress(historyId, 8)}
                    {historyData && <span className="ml-2">· {historyData.entryCount} entries</span>}
                  </p>
                </div>
                <StatusBadge variant="granted" label="Access Granted" />
              </div>

              {/* No entries */}
              {historyData && historyData.entries.length === 0 && (
                <div className="card text-center py-6">
                  <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">This patient has no medical history entries yet.</p>
                </div>
              )}

              {/* Entries */}
              {historyData && historyData.entries.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-700">Shared Medical History</h2>
                    <button onClick={() => refetchHistory()} className="btn-ghost text-xs">
                      <RefreshCw className="h-3.5 w-3.5" />
                      Refresh
                    </button>
                  </div>

                  {historyData.entries.map((entry, idx) => (
                    <EntryCard
                      key={idx}
                      entry={entry}
                      entryId={idx}
                      onVerify={handleVerifyEntry}
                    />
                  ))}
                </div>
              )}

              {/* Request access note */}
              <div className="card border-navy-200 bg-navy-50/30">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-navy-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-navy-800">Need access to a patient's records?</p>
                    <p className="text-xs text-navy-600 mt-0.5">
                      The patient can grant you access via their Consent Management dashboard. Share your wallet address with them.
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-navy-400 shrink-0" />
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
