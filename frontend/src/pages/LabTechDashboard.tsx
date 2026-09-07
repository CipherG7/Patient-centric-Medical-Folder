import { useState } from 'react';
import { useActiveAccount } from '@/lib/auth';
import { usePatientHistory } from '@/hooks/use-patient';
import { useAddEntry } from '@/hooks/use-history';
import { documentApi } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { CardSkeleton } from '@/components/LoadingSkeleton';
import { shortenAddress } from '@/lib/utils';
import { ENTRY_TYPE_LABELS, EntryType } from '@/types';
import {
  FlaskConical,
  Upload,
  FileUp,
  Search,
  AlertCircle,
  CheckCircle,
  Loader2,
  FileText,
  Hash,
  Link,
  ArrowRight,
} from 'lucide-react';

const entryTypes = [
  { value: EntryType.LabReport, label: 'Lab Report' },
  { value: EntryType.Diagnosis, label: 'Diagnosis' },
  { value: EntryType.Prescription, label: 'Prescription' },
  { value: EntryType.Vaccination, label: 'Vaccination' },
  { value: EntryType.Referral, label: 'Referral' },
  { value: EntryType.DischargeSummary, label: 'Discharge Summary' },
  { value: EntryType.ImagingReport, label: 'Imaging Report' },
];

export function LabTechDashboard() {
  const account = useActiveAccount();
  const [patientAddr, setPatientAddr] = useState('');
  const [entryType, setEntryType] = useState<EntryType>(EntryType.LabReport);
  const [file, setFile] = useState<File | null>(null);
  const [submittedAddr, setSubmittedAddr] = useState('');
  const [result, setResult] = useState<{ offChainRef: string; contentHash: string } | null>(null);
  const [uploadError, setUploadError] = useState('');

  const { data: historyLookup, isLoading: lookupLoading } = usePatientHistory(submittedAddr || undefined);
  const addEntryMutation = useAddEntry();
  const historyId = historyLookup?.historyId;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedAddr(patientAddr);
    setResult(null);
    setUploadError('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.size <= 10 * 1024 * 1024) {
      setFile(selectedFile);
      setUploadError('');
    } else if (selectedFile) {
      setUploadError('File exceeds 10 MB limit');
    }
  };

  const handleUpload = async () => {
    if (!file || !historyId || !account) return;
    setUploadError('');
    setResult(null);

    try {
      // Step 1: Upload document to IPFS via backend
      const uploadResponse = await documentApi.upload(file, historyId, 0, submittedAddr);

      // Step 2: For demo, we use a dummy entry ID since we don't know it yet
      // In production, you'd first add the entry on-chain, get entryId, then upload
      const entryId = 0; // Placeholder — in real flow this comes from on-chain

      // Step 3: Add entry on-chain via backend
      await addEntryMutation.mutateAsync({
        historyId,
        issuerAddr: account.address,
        entryType: entryType,
        offChainRef: uploadResponse.offChainRef,
        contentHash: uploadResponse.contentHash,
      });

      setResult({
        offChainRef: uploadResponse.offChainRef,
        contentHash: uploadResponse.contentHash,
      });
      setFile(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-amber-600" />
            Lab Tech / Pharmacist Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {account ? shortenAddress(account.address) : 'Not connected'}
          </p>
        </div>
      </div>

      {/* Search patient */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-amber-600" />
          Find Patient by Wallet Address
        </h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={patientAddr}
            onChange={(e) => setPatientAddr(e.target.value)}
            placeholder="0x..."
            className="input font-mono text-sm flex-1"
          />
          <button type="submit" disabled={!patientAddr || lookupLoading} className="btn-amber">
            {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </button>
        </form>
      </div>

      {/* Upload form (only when patient found) */}
      {historyId && !lookupLoading && (
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Upload className="h-4 w-4 text-amber-600" />
            Add New Entry
          </h2>

          <div>
            <label className="label">Entry Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {entryTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setEntryType(type.value)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    entryType === type.value
                      ? 'border-amber-400 bg-amber-50 text-amber-800'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Document File (max 10 MB)</label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-amber-400 transition-colors">
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="h-5 w-5 text-amber-600" />
                  <span className="text-sm text-slate-700">{file.name}</span>
                  <span className="text-xs text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
                  <button onClick={() => setFile(null)} className="btn-ghost text-xs text-red-600 ml-2">
                    Remove
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <FileUp className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Click to upload or drag and drop</p>
                  <input
                    type="file"
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".pdf,.jpg,.png,.doc,.docx,.txt"
                  />
                </label>
              )}
            </div>
          </div>

          {uploadError && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {uploadError}
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || addEntryMutation.isPending}
            className="btn-amber w-full"
          >
            {addEntryMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload & Create Entry
              </>
            )}
          </button>
        </div>
      )}

      {/* Patient not found */}
      {submittedAddr && !historyId && !lookupLoading && (
        <div className="card border-amber-200 bg-amber-50">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800">No medical history found for this patient.</p>
          </div>
        </div>
      )}

      {/* Success result */}
      {result && (
        <div className="card border-teal-200 bg-teal-50 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-teal-600" />
            <h3 className="text-sm font-semibold text-teal-800">Entry Created Successfully</h3>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 text-gray-600">
              <Link className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium">Off-Chain Ref (CID):</span>
              <span className="font-mono text-teal-800 truncate">{result.offChainRef}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Hash className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium">Content Hash (SHA-256):</span>
              <span className="font-mono text-teal-800 truncate">{result.contentHash}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            The entry has been recorded on-chain and the document is encrypted and stored off-chain.
          </p>
        </div>
      )}
    </div>
  );
}
