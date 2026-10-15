import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types';
import {
  Home,
  History,
  Shield,
  FileText,
  Search,
  PlusCircle,
  Building2,
  Settings,
  Users,
  Activity,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { useActiveAccount } from '@/lib/auth';

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  roles: UserRole[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: Home, roles: ['patient', 'doctor', 'lab_tech', 'pharmacist', 'hospital_admin', 'platform_admin'] },
  { label: 'My History', path: '/dashboard/history', icon: History, roles: ['patient'] },
  { label: 'Consent Management', path: '/dashboard/consent', icon: Shield, roles: ['patient'] },
  { label: 'Audit Log', path: '/dashboard/audit', icon: Activity, roles: ['patient', 'doctor'] },
  { label: 'Search Patient', path: '/dashboard/search', icon: Search, roles: ['doctor', 'lab_tech', 'pharmacist'] },
  { label: 'Add Entry', path: '/dashboard/add-entry', icon: PlusCircle, roles: ['lab_tech', 'pharmacist'] },
  { label: 'Documents', path: '/dashboard/documents', icon: FileText, roles: ['lab_tech', 'pharmacist', 'doctor'] },
  { label: 'Manage Staff', path: '/dashboard/staff', icon: Users, roles: ['hospital_admin'] },
  { label: 'Institutions', path: '/dashboard/institutions', icon: Building2, roles: ['platform_admin', 'hospital_admin'] },
  { label: 'Settings', path: '/dashboard/settings', icon: Settings, roles: ['patient', 'doctor', 'lab_tech', 'pharmacist', 'hospital_admin', 'platform_admin'] },
];

interface SidebarProps {
  role: UserRole;
  onClose?: () => void;
}

export function Sidebar({ role, onClose }: SidebarProps) {
  const account = useActiveAccount();
  const navigate = useNavigate();
  const filteredItems = navItems.filter((item) => item.roles.includes(role));

  const handleSwitchRole = () => {
    sessionStorage.removeItem('selectedRole');
    onClose?.();
    navigate('/');
  };

  return (
    <aside className="flex h-full flex-col border-r border-white/10 bg-[#102f38] text-white shadow-[8px_0_30px_rgba(15,35,45,0.08)]">
      {/* Logo / Brand */}
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-6">
        <img src="/Medichain.svg" alt="MediChain logo" className="h-9 w-9 object-contain" />
        <div className="leading-tight">
          <span className="text-sm font-bold text-white tracking-tight">MediChain</span>
          <p className="text-[10px] text-teal-200/70 uppercase tracking-wider">Care, connected</p>
        </div>

      </div>
      {/* Navigation */}
      <div className="px-5 pb-2 pt-6 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-200/50">Workspace</div>
      <nav className="app-scrollbar flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {filteredItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/dashboard'}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'border-teal-200 bg-teal-400 text-[#102f38] shadow-lg shadow-teal-950/10'
                  : 'border-transparent text-teal-50/70 hover:bg-white/10 hover:text-white'
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User info footer */}
      <div className="space-y-3 border-t border-white/10 p-4">
        {account ? (
          <>
            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-400 text-xs font-bold text-[#102f38]">
                {account.address.slice(2, 4).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white">
                  {account.address.slice(0, 6)}&hellip;{account.address.slice(-4)}
                </p>
                <p className="text-[10px] capitalize text-teal-200/60">{role.replace('_', ' ')}</p>
              </div>
            </div>
            {/* Switch Role button */}
            <button
              onClick={handleSwitchRole}
              className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-teal-100/70 transition-colors duration-150 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Switch Role</span>
            </button>
          </>
        ) : (
          <p className="text-xs text-gray-400 text-center">No wallet connected</p>
        )}
      </div>
    </aside>
  );
}
