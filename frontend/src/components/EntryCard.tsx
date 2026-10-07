import { useEffect, useState } from 'react';
import { formatTimestamp, shortenAddress, cn } from '@/lib/utils';
import { ENTRY_TYPE_LABELS, ENTRY_TYPE_ICONS, type HistoryEntry, EntryType } from '@/types';
import { StatusBadge } from './StatusBadge';
import { WalletAddress } from './WalletAddress';
import {
  Stethoscope,
  FlaskConical,
  Pill,
  Syringe,
  ArrowRightCircle,
  FileText,
  ScanEye,
  X,
  ShieldCheck,
  FileDown,
  Download,
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
  onViewDocument?: (entry: HistoryEntry) => Promise<Blob>;
  className?: string;
}

export function EntryCard({ entry, entryId, index, onVerify, onViewDocument, className }: EntryCardProps) {
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [openingDocument, setOpeningDocument] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const entryType = entry.entryType as EntryType;
  const label = ENTRY_TYPE_LABELS[entryType] || `Type ${entry.entryType}`;
  const iconKey = ENTRY_TYPE_ICONS[entryType] || 'file-text';
  const Icon = iconMap[iconKey] || FileText;
  const formattedTimestamp = formatTimestamp(entry.timestampMs);
  const hasTimestamp = formattedTimestamp !== 'Unknown date';

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

  const handleViewDocument = async () => {
    if (!onViewDocument) return;
    setOpeningDocument(true);
    setDocumentError(null);
    try {
      const documentBlob = await onViewDocument(entry);
      const pdfBlob = new Blob([documentBlob], { type: 'application/pdf' });
      setPreviewUrl(URL.createObjectURL(pdfBlob));
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : 'Unable to open document');
    } finally {
      setOpeningDocument(false);
    }
  };

  return (
    <>
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
              {hasTimestamp && <>{formattedTimestamp} {' · '}</>}
              by <WalletAddress address={entry.issuer} />
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

      {/* Document integrity hash */}
      {(entry.offChainRef || entry.contentHash) && (
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          {entry.offChainRef && !entry.offChainRef.startsWith('patient-import://') && (
            <>
              <FileDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate font-mono">{entry.offChainRef}</span>
            </>
          )}
          {entry.contentHash && (
            <span className="text-gray-400 shrink-0">
              SHA-256: {entry.contentHash.slice(0, 8)}…
            </span>
          )}
        </div>
      )}

      {entry.import?.record && (
        <div className="mt-4 rounded-lg border border-teal-100 bg-teal-50/40 px-4 py-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
              {entry.import.record.documentType === 'pdf' ? 'PDF document' : 'Imported record'}
            </p>
            <p className="text-[11px] text-teal-700 truncate">{entry.import.sourceName}</p>
          </div>
          <dl className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
            {Object.entries(entry.import.record)
              .filter(([key]) => !['entryType', 'entry_type', 'type'].includes(key))
              .map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="text-[11px] font-medium text-slate-500">{key}</dt>
                  <dd className="mt-0.5 break-words text-sm text-slate-700">
                    {typeof value === 'object' && value !== null
                      ? JSON.stringify(value)
                      : String(value ?? '—')}
                  </dd>
                </div>
              ))}
          </dl>
          {entry.import.record.documentType === 'pdf' && onViewDocument && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => void handleViewDocument()}
                disabled={openingDocument}
                className="btn-outline text-xs"
              >
                {openingDocument ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanEye className="h-3.5 w-3.5" />}
                {openingDocument ? 'Opening…' : 'View PDF'}
              </button>
              {documentError && <p className="mt-2 text-xs text-red-600">{documentError}</p>}
            </div>
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
    {previewUrl && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="PDF preview">
        <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <h2 className="truncate text-sm font-semibold text-slate-800">
              {String(entry.import?.record.fileName || 'Medical document.pdf')}
            </h2>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={previewUrl}
                download={String(entry.import?.record.fileName || 'medical-document.pdf')}
                className="btn-ghost p-2"
                title="Download PDF"
                aria-label="Download PDF"
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => setPreviewUrl(null)}
                className="btn-ghost p-2"
                title="Close PDF preview"
                aria-label="Close PDF preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <iframe title="PDF document preview" src={previewUrl} className="min-h-0 flex-1 bg-gray-100" />
        </div>
      </div>
    )}
    </>
  );
}


