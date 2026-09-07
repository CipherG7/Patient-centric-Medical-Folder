import { useState } from 'react';
import { useActiveAccount } from '@/lib/auth';
import { usePatientHistory, useCreateHistory } from '@/hooks/use-patient';
import { useFullHistory } from '@/hooks/use-history';
import { useAuditLog } from '@/hooks/use-audit';
import { EntryCard } from '@/components/EntryCard';
import { StatusBadge } from '@/components/StatusBadge';
import { PageSkeleton, CardSkeleton } from '@/components/LoadingSkeleton';
import { shortenAddress, formatTimestamp } from '@/lib/utils';
import type { HistoryEntry } from '@/types';
import {
  History,
  Shield,
  Activity,
  PlusCircle,
  AlertCircle,
  RefreshCw,
  FileText,
  User,
  Clock,
} from 'lucide-react';

type Tab = 'timeline' | 'consent' | 'audit';

export function PatientDashboard() {
  const account = useActiveAccount();
  const [activeTab, setActiveTab] = useState<Tab>('timeline');
  const patientAddr = account?.address || '';

  // Fetch the patient's history ID
  const {
    data: historyLookup,
    isLoading: lookupLoading,
    error: lookupError,
    refetch: refetchLookup,
  } = usePatientHistory(patientAddr);

  const { mutate: createHistory, isPending: creatingHistory } = useCreateHistory();

  // Fetch full history entries
  const {
    data: historyData,
    isLoading: historyLoading,
    error: historyError,
    refetch: refetchHistory,
  } = useFullHistory(historyLookup?.historyId);

  // Fetch audit log
  const {
    data: auditData,
    isLoading: auditLoading,
  } = useAuditLog(historyLookup?.historyId);

  const isLoading = lookupLoading || historyLoading;
  const error = lookupError || historyError;
  const historyId = historyLookup?.historyId;

  const handleCreateHistory = () => {
    createHistory(patientAddr, {
      onSuccess: (data) => {
        refetchLookup();
        if (data.historyId) refetchHistory();
      },
    });
  };

  const handleVerifyEntry = async (entry: HistoryEntry): Promise<boolean> => {
    // In production, this would fetch the document and recompute SHA-256
    // then compare with entry.contentHash
    // For now, simulate verification
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return !!entry.contentHash && entry.contentHash.length > 0;
  };

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <User className="h-5 w-5 text-teal-600" />
            Patient Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {shortenAddress(patientAddr)}
          </p>
        </div>
        <StatusBadge variant={historyId ? 'verified' : 'pending'} label={historyId ? 'History Active' : 'No History'} />
      </div>

      {/* No history state */}
      {!lookupLoading && !historyId && !lookupError && (
        <div className="card text-center py-8">
          <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-700">No Medical History Found</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
            You haven't created a medical history yet. Once created, you'll be able to
            manage your entries, grant access to providers, and view the audit log.
          </p>
          <button
            onClick={handleCreateHistory}
            disabled={creatingHistory}
            className="btn-primary mt-4"
          >
            {creatingHistory ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <PlusCircle className="h-4 w-4" />
                Create Medical History
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
              <p className="text-sm font-medium text-red-800">Failed to load history</p>
              <p className="text-xs text-red-600 mt-0.5">
                {error instanceof Error ? error.message : 'An unexpected error occurred'}
              </p>
            </div>
            <button onClick={() => refetchHistory()} className="btn-outline ml-auto text-xs">
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && !historyData && <PageSkeleton />}

      {/* Tabs (only show when history exists) */}
      {historyId && !isLoading && (
        <>
          {/* Tab navigation */}
          <div className="flex border-b border-gray-200 gap-1">
            {([
              { id: 'timeline' as Tab, label: 'Timeline', icon: History },
              { id: 'consent' as Tab, label: 'Consent Management', icon: Shield },
              { id: 'audit' as Tab, label: 'Audit Log', icon: Activity },
            ]).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-teal-600 text-teal-800'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Timeline tab */}
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">
                  Medical History Entries
                  {historyData && (
                    <span className="text-gray-400 font-normal ml-2">
                      ({historyData.entryCount} total)
                    </span>
                  )}
                </h2>
                <button
                  onClick={() => refetchHistory()}
                  className="btn-ghost text-xs"
                  disabled={historyLoading}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${historyLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {historyLoading && <CardSkeleton />}

              {historyData && historyData.entries.length === 0 && (
                <div className="card text-center py-6">
                  <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No entries yet. Grant access to an institution to add records.</p>
                </div>
              )}

              {historyData && historyData.entries.length > 0 && (
                <div className="space-y-3">
                  {/* Note about revoked entries */}
                  {historyData.entries.some((e) => e.revoked) && (
                    <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded">
                      <Clock className="h-3.5 w-3.5" />
                      Revoked entries are shown dimmed and marked with a revoked badge
                    </div>
                  )}

                  {historyData.entries.map((entry, idx) => (
                    <EntryCard
                      key={idx}
                      entry={entry}
                      entryId={idx}
                      index={idx}
                      onVerify={handleVerifyEntry}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Consent tab */}
          {activeTab === 'consent' && (
            <div className="space-y-4">
              <div className="card">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">Grant Access</h3>
                <p className="text-xs text-gray-500 mb-4">
                  This section will allow you to grant or revoke access to your medical history
                  for healthcare providers. You can grant full access or select specific entries.
                </p>
                <div className="flex items-center justify-center py-6 text-gray-400">
                  <Shield className="h-8 w-8 mr-2" />
                  <span className="text-sm">Consent management form coming in next update</span>
                </div>
              </div>
            </div>
          )}

          {/* Audit tab */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">
                  Audit Log
                  {auditData && (
                    <span className="text-gray-400 font-normal ml-2">
                      ({auditData.count} events)
                    </span>
                  )}
                </h2>
              </div>

              {auditLoading && <CardSkeleton />}

              {auditData && auditData.events.length === 0 && (
                <div className="card text-center py-6">
                  <Activity className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No audit events recorded yet.</p>
                </div>
              )}

              {auditData && auditData.events.length > 0 && (
                <div className="card overflow-hidden p-0">
                  <div className="divide-y divide-gray-100">
                    {auditData.events.map((event) => (
                      <div key={event.id} className="flex items-start gap-3 px-4 py-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-50">
                          <Activity className="h-4 w-4 text-gray-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-slate-700">
                            <span className="font-medium">{event.actionLabel}</span>
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Actor: {shortenAddress(event.actor)}
                            {event.entryId !== null && ` · Entry #${event.entryId}`}
                          </p>
                        </div>
                        <p className="text-xs text-gray-400 shrink-0">
                          {formatTimestamp(event.timestampMs)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Stats summary when history exists */}
      {historyData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-teal-600">{historyData.entryCount}</p>
            <p className="text-xs text-gray-500 mt-1">Total Entries</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-navy-600">
              {historyData.entries.filter((e) => !e.revoked).length}
            </p>
            <p className="text-xs text-gray-500 mt-1">Active</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-amber-600">
              {historyData.entries.filter((e) => e.revoked).length}
            </p>
            <p className="text-xs text-gray-500 mt-1">Revoked</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-gray-600">{auditData?.count || 0}</p>
            <p className="text-xs text-gray-500 mt-1">Audit Events</p>
          </div>
        </div>
      )}
    </div>
  );
}
