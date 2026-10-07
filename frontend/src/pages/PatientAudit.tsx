import { useActiveAccount } from '@/lib/auth';
import { usePatientHistory } from '@/hooks/use-patient';
import { useAuditLog } from '@/hooks/use-audit';
import { PageSkeleton } from '@/components/LoadingSkeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { WalletAddress } from '@/components/WalletAddress';
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
  Trash2,
  type LucideIcon,
} from 'lucide-react';

const actionIconMap: Record<string, LucideIcon> = {
  'plus-circle': PlusCircle,
  'x-circle': XCircle,
  'eye': Eye,
  'eye-off': EyeOff,
  'unlock': Shield,
  'lock': ShieldOff,
  'trash-2': Trash2,
};

const offchainActionLabels: Record<string, string> = {
  access_grant_details: 'Access Grant Details',
  access_revocation_details: 'Access Revocation Details',
  authentication_failed: 'Authentication Failed',
  authentication_succeeded: 'Authentication Succeeded',
  document_access_failed: 'Document Access Failed',
  document_accessed: 'Document Accessed',
  document_deleted: 'Document Removed',
  document_integrity_check_failed: 'Integrity Check Failed',
  document_integrity_verified: 'Integrity Verified',
  document_uploaded: 'Document Uploaded',
  document_upload_failed: 'Document Upload Failed',
  entry_read: 'Entry Read',
  history_read: 'History Read',
  institution_admin_linked: 'Institution Admin Linked',
  institution_registered: 'Institution Registered',
  institution_reinstated: 'Institution Reinstated',
  institution_revoked: 'Institution Revoked',
  session_ended: 'Session Ended',
};

const offchainActionIcons: Record<string, string> = {
  access_grant_details: 'unlock',
  access_revocation_details: 'lock',
  authentication_failed: 'x-circle',
  authentication_succeeded: 'plus-circle',
  document_access_failed: 'x-circle',
  document_accessed: 'eye',
  document_deleted: 'trash-2',
  document_integrity_check_failed: 'x-circle',
  document_integrity_verified: 'plus-circle',
  document_uploaded: 'plus-circle',
  document_upload_failed: 'x-circle',
  entry_read: 'eye-off',
  history_read: 'eye',
  institution_admin_linked: 'unlock',
  institution_registered: 'plus-circle',
  institution_reinstated: 'plus-circle',
  institution_revoked: 'lock',
  session_ended: 'lock',
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
            Chronological record of actions on your medical history
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
              const label = event.source === 'off-chain'
                ? offchainActionLabels[event.actionLabel] || event.actionLabel
                : AUDIT_ACTION_LABELS[action] || event.actionLabel;
              const iconKey = event.source === 'off-chain'
                ? offchainActionIcons[event.actionLabel] || 'file-text'
                : AUDIT_ACTION_ICONS[action] || 'file-text';
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
                      {event.source === 'off-chain' && (
                        <span className="text-[10px] uppercase tracking-wide text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                          Off-chain
                        </span>
                      )}
                      {event.result === 'failure' && (
                        <span className="text-[10px] uppercase tracking-wide text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
                          Failed
                        </span>
                      )}
                      {event.accessScope && (
                        <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                          {event.accessScope} access
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                      <User className="h-3 w-3" />
                      {event.actor
                        ? <WalletAddress address={event.actor} />
                        : <span>Unidentified actor</span>}
                      {event.actorRole && <span>· {event.actorRole.replace(/_/g, ' ')}</span>}
                    </p>
                    {(event.requestId || Object.keys(event.metadata).length > 0) && (
                      <p className="mt-1 text-[11px] text-gray-400">
                        {Object.entries(event.metadata)
                          .map(([key, value]) => `${key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}: ${String(value)}`)
                          .join(' · ')}
                        {event.requestId && ` · request ${event.requestId.slice(0, 8)}`}
                      </p>
                    )}
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
        On-chain events are immutable. File removal events are recorded off-chain and depend on the application database.
      </p>
    </div>
  );
}
