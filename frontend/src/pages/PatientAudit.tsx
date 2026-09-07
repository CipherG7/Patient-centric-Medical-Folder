import { useActiveAccount } from '@/lib/auth';
import { usePatientHistory } from '@/hooks/use-patient';
import { useAuditLog } from '@/hooks/use-audit';
import { PageSkeleton } from '@/components/LoadingSkeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { shortenAddress, formatTimestamp } from '@/lib/utils';
import { AUDIT_ACTION_LABELS, AUDIT_ACTION_ICONS, AuditAction } from '@/types';
import {
  Activity,
  AlertCircle,
  RefreshCw,
  User,
  Clock,
  FileText,
  Shield,
  ShieldOff,
  Eye,
  EyeOff,
  PlusCircle,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

const actionIconMap: Record<string, LucideIcon> = {
  'plus-circle': PlusCircle,
  'x-circle': XCircle,
  'eye': Eye,
  'eye-off': EyeOff,
  'unlock': Shield,
  'lock': ShieldOff,
};

export function PatientAudit() {
  const account = useActiveAccount();
  const patientAddr = account?.address || '';

  const { data: historyLookup, isLoading: lookupLoading } = usePatientHistory(patientAddr);
  const { data: auditData, isLoading: auditLoading, error, refetch } = useAuditLog(historyLookup?.historyId);

  const isLoading = lookupLoading || auditLoading;
  const events = auditData?.events || [];

  if (isLoading) return <PageSkeleton />;

  if (error) {
    return (
      <div className="p-4 lg:p-6 max-w-4xl mx-auto">
        <div className="card border-red-200 bg-red-50">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">Failed to load audit log</p>
              <p className="text-xs text-red-600 mt-0.5">
                {error instanceof Error ? error.message : 'An unexpected error occurred'}
              </p>
            </div>
            <button onClick={() => refetch()} className="btn-outline ml-auto text-xs">
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Activity className="h-5 w-5 text-teal-600" />
            Audit Log
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Immutable, reverse-chronological record of all actions on your medical history
          </p>
        </div>
        <button onClick={() => refetch()} className="btn-outline text-xs" disabled={auditLoading}>
          <RefreshCw className={`h-3.5 w-3.5 ${auditLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-slate-700">{events.length}</p>
          <p className="text-xs text-gray-500 mt-1">Total Events</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-teal-600">
            {events.filter((e) => e.action === AuditAction.EntryAdded).length}
          </p>
          <p className="text-xs text-gray-500 mt-1">Entries Added</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-navy-600">
            {events.filter((e) => [AuditAction.AccessGranted, AuditAction.AccessRevoked].includes(e.action as AuditAction)).length}
          </p>
          <p className="text-xs text-gray-500 mt-1">Access Changes</p>
        </div>
      </div>

      {/* Empty state */}
      {events.length === 0 && (
        <div className="card text-center py-8">
          <Activity className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-700">No Audit Events</h2>
          <p className="text-sm text-gray-500 mt-1">
            Audit events will appear here as actions are taken on your medical history.
          </p>
        </div>
      )}

      {/* Event list */}
      {events.length > 0 && (
        <div className="card overflow-hidden p-0">
          <div className="divide-y divide-gray-100">
            {events.map((event) => {
              const action = event.action as AuditAction;
              const label = AUDIT_ACTION_LABELS[action] || event.actionLabel;
              const iconKey = AUDIT_ACTION_ICONS[action] || 'file-text';
              const Icon = actionIconMap[iconKey] || Activity;

              return (
                <div key={event.id} className="flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50/50 transition-colors">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      action === AuditAction.EntryAdded
                        ? 'bg-teal-50'
                        : action === AuditAction.EntryRevoked
                          ? 'bg-amber-50'
                          : action === AuditAction.AccessGranted
                            ? 'bg-teal-50'
                            : action === AuditAction.AccessRevoked
                              ? 'bg-amber-50'
                              : 'bg-gray-50'
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 ${
                        action === AuditAction.EntryAdded || action === AuditAction.AccessGranted
                          ? 'text-teal-600'
                          : action === AuditAction.EntryRevoked || action === AuditAction.AccessRevoked
                            ? 'text-amber-600'
                            : 'text-gray-500'
                      }`}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800">{label}</span>
                      {event.entryId !== null && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                          #{event.entryId}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                      <User className="h-3 w-3" />
                      {shortenAddress(event.actor)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 text-xs text-gray-400">
                    <Clock className="h-3 w-3" />
                    {formatTimestamp(event.timestampMs)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer note */}
      <p className="text-xs text-gray-400 text-center">
        The audit log is stored on-chain and cannot be edited or deleted — guaranteed by the Sui Move smart contract.
      </p>
    </div>
  );
}
