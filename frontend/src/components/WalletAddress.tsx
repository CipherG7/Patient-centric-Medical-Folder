import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn, copyToClipboard, shortenAddress } from '@/lib/utils';

interface WalletAddressProps {
  address: string;
  chars?: number;
  className?: string;
}

export function WalletAddress({ address, chars = 4, className }: WalletAddressProps) {
  const [copied, setCopied] = useState(false);

  if (!address) return null;

  const handleCopy = async () => {
    const didCopy = await copyToClipboard(address);
    if (!didCopy) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <span className={cn('inline-flex items-center gap-1 font-mono', className)} title={address}>
      <span>{shortenAddress(address, chars)}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-slate-800"
        aria-label={`Copy full wallet address ${address}`}
        title="Copy full wallet address"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-teal-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}