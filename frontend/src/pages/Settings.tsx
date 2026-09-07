import { useActiveAccount } from '@/lib/auth';
import { shortenAddress, roleLabel } from '@/lib/utils';
import { StatusBadge } from '@/components/StatusBadge';
import {
  Settings as SettingsIcon,
  User,
  Wallet,
  Shield,
  Bell,
  Copy,
  ExternalLink,
  CheckCircle,
} from 'lucide-react';
import { useState } from 'react';

export function Settings() {
  const account = useActiveAccount();
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = async () => {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <SettingsIcon className="h-5 w-5 text-gray-600" />
          Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account and preferences</p>
      </div>

      {/* Wallet / Account */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Wallet className="h-4 w-4" />
          Wallet Connection
        </h2>

        {account ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-50">
                  <User className="h-5 w-5 text-teal-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">Connected Wallet</p>
                  <p className="text-xs text-gray-500 font-mono">{shortenAddress(account.address)}</p>
                </div>
              </div>
              <StatusBadge variant="verified" label="Connected" />
            </div>

            <div className="flex gap-2">
              <button onClick={handleCopyAddress} className="btn-outline text-xs">
                {copied ? (
                  <>
                    <CheckCircle className="h-3.5 w-3.5 text-teal-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Address
                  </>
                )}
              </button>
              <a
                href={`https://suiscan.xyz/testnet/account/${account.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline text-xs"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View on Explorer
              </a>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No wallet connected. Connect via the top bar.</p>
        )}
      </div>

      {/* Network info */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Network
        </h2>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Network</span>
          <span className="font-medium text-slate-700">Sui Testnet</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Backend API</span>
          <span className="font-medium text-slate-700 font-mono">localhost:4000</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Package ID</span>
          <span className="font-medium text-slate-700 font-mono text-xs">
            {import.meta.env?.VITE_PACKAGE_ID || 'Not configured'}
          </span>
        </div>
      </div>

      {/* Notifications placeholder */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Notifications
        </h2>
        <p className="text-sm text-gray-500">
          Notification preferences coming soon. You'll be able to configure alerts for
          access grant requests, entry additions, and audit events.
        </p>
      </div>

      {/* About */}
      <div className="card space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">About</h2>
        <div className="text-xs text-gray-500 space-y-1">
          <p>MediChain — Decentralized Patient-Centric Portable Medical History System</p>
          <p>Version 1.0.0</p>
          <p>Built on Sui Blockchain</p>
        </div>
      </div>
    </div>
  );
}
