import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types';
import { Menu, X, Wallet } from 'lucide-react';
import { ConnectButton } from '@mysten/dapp-kit';
import { useActiveAccount } from '@/lib/auth';
import { NotificationBell } from './NotificationBell';

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
    <div className="flex h-screen overflow-hidden bg-[#f7faf9]">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#12343b]/30 backdrop-blur-[2px] lg:hidden"
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
        <header className="flex h-[4.5rem] shrink-0 items-center gap-4 border-b border-slate-200/80 bg-white/75 px-4 backdrop-blur-xl lg:px-8">
          <button
            onClick={() => setSidebarOpen(true)}
            className="btn-ghost p-2 lg:hidden"
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="h-2 w-2 rounded-full bg-teal-400 shadow-[0_0_0_4px_rgba(29,158,117,0.12)]" />
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Secure care network</p>
            </div>
          </div>

          {/* Wallet connection */}
          <div className="flex items-center gap-2">
            <NotificationBell />
            <ConnectButton className="!btn-outline !text-xs" />
          </div>
        </header>

        {/* Page content */}
        <main className="app-scrollbar flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
