import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types';
import { Menu, X, Wallet } from 'lucide-react';
import { ConnectButton } from '@mysten/dapp-kit';
import { useActiveAccount } from '@/lib/auth';

interface DashboardLayoutProps {
  role: UserRole;
}

export function DashboardLayout({ role }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const account = useActiveAccount();

  // If no wallet is connected, redirect to welcome page
  if (!account) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f4f7f7]">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Sidebar role={role} onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="flex h-[4.5rem] shrink-0 items-center gap-4 border-b border-slate-200/80 bg-white/80 backdrop-blur px-4 lg:px-8">
          <button
            onClick={() => setSidebarOpen(true)}
            className="btn-ghost p-2 lg:hidden"
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1">
            <p className="hidden text-xs font-medium text-slate-400 sm:block">SECURE CARE NETWORK</p>
          </div>

          {/* Wallet connection */}
          <div className="flex items-center gap-2">
            <ConnectButton className="!btn-outline !text-xs" />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
