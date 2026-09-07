import { useState } from 'react';
import { formatTimestamp, shortenAddress, cn } from '@/lib/utils';
import { ENTRY_TYPE_LABELS, ENTRY_TYPE_ICONS, type HistoryEntry, EntryType } from '@/types';
import { StatusBadge } from './StatusBadge';
import {
  Stethoscope,
  FlaskConical,
  Pill,
  Syringe,
  ArrowRightCircle,
  FileText,
  ScanEye,
  ShieldCheck,
  FileDown,
  Loader2,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  'stethoscope': Stethoscope,
  'flask-conical': FlaskConical,
  'pill': Pill,
  'syringe': Syringe,
  'arrow-right-circle': ArrowRightCircle,
  'file-text': FileText,
  'scan-eye': ScanEye,
};

interface EntryCardProps {
  entry: HistoryEntry;
  entryId?: number;
  index?: number;
  onVerify?: (entry: HistoryEntry) => Promise<boolean>;
  className?: string;
}

export function EntryCard({ entry, entryId, index, onVerify, className }: EntryCardProps) {
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);

  const entryType = entry.entryType as EntryType;
  const label = ENTRY_TYPE_LABELS[entryType] || `Type ${entry.entryType}`;
  const iconKey = ENTRY_TYPE_ICONS[entryType] || 'file-text';
  const Icon = iconMap[iconKey] || FileText;

  const handleVerify = async () => {
    if (!onVerify) return;
    setVerifying(true);
    setVerified(null);
    try {
      const result = await onVerify(entry);
      setVerified(result);
    } catch {
      setVerified(false);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div
      className={cn(
        'card relative transition-all duration-150',
        entry.revoked && 'opacity-75 bg-gray-50',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
              entry.revoked ? 'bg-amber-600/10' : 'bg-teal-50'
            )}
          >
            <Icon
              className={cn(
                'h-5 w-5',
                entry.revoked ? 'text-amber-600' : 'text-teal-600'
              )}
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-slate-800 truncate">
                {label}
              </h3>
              {entry.revoked && (
                <StatusBadge variant="revoked" label="Revoked" />
              )}
              {entryId !== undefined && (
                <span className="text-xs text-gray-400">#{entryId}</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {formatTimestamp(entry.timestampMs)}
              {' · '}
              by {shortenAddress(entry.issuer)}
            </p>
          </div>
        </div>

        {/* Verify button */}
        {onVerify && (
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="btn-ghost shrink-0 text-xs gap-1.5"
            title="Verify document integrity against on-chain hash"
            aria-label="Verify document integrity"
          >
            {verifying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : verified === true ? (
              <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
            ) : verified === false ? (
              <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 text-gray-400" />
            )}
            <span>
              {verifying
                ? 'Verifying…'
                : verified === true
                  ? 'Verified'
                  : verified === false
                    ? 'Mismatch'
                    : 'Verify'}
            </span>
          </button>
        )}
      </div>

      {/* Off-chain reference */}
      {entry.offChainRef && (
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <FileDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate font-mono">{entry.offChainRef}</span>
          {entry.contentHash && (
            <span className="text-gray-400 shrink-0">
              SHA-256: {entry.contentHash.slice(0, 8)}…
            </span>
          )}
        </div>
      )}

      {/* Index number for partial grant selection */}
      {index !== undefined && (
        <div className="absolute top-3 right-3 text-xs text-gray-300 font-mono">
          #{index}
        </div>
      )}
    </div>
  );
}



