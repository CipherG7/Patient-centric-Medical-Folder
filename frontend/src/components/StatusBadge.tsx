import { cn } from '@/lib/utils';
import {
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  ShieldOff,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';

interface StatusBadgeProps {
  variant:
    | 'granted'
    | 'revoked'
    | 'pending'
    | 'verified'
    | 'unverified'
    | 'active'
    | 'expired';
  label?: string;
  className?: string;
}

const variantConfig: Record<
  string,
  { icon: LucideIcon; className: string; defaultLabel: string }
> = {
  granted: {
    icon: CheckCircle,
    className: 'bg-teal-50 text-teal-800 border-teal-200',
    defaultLabel: 'Granted',
  },
  revoked: {
    icon: XCircle,
    className: 'bg-amber-600/10 text-amber-600 border-amber-600/20',
    defaultLabel: 'Revoked',
  },
  pending: {
    icon: Clock,
    className: 'bg-navy-50 text-navy-800 border-navy-200',
    defaultLabel: 'Pending',
  },
  verified: {
    icon: Shield,
    className: 'bg-teal-50 text-teal-800 border-teal-200',
    defaultLabel: 'Verified',
  },
  unverified: {
    icon: ShieldOff,
    className: 'bg-gray-100 text-gray-600 border-gray-200',
    defaultLabel: 'Unverified',
  },
  active: {
    icon: CheckCircle,
    className: 'bg-teal-50 text-teal-800 border-teal-200',
    defaultLabel: 'Active',
  },
  expired: {
    icon: AlertTriangle,
    className: 'bg-amber-600/10 text-amber-600 border-amber-600/20',
    defaultLabel: 'Expired',
  },
};

export function StatusBadge({ variant, label, className }: StatusBadgeProps) {
  const config = variantConfig[variant] || variantConfig.pending;
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full border',
        config.className,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{label || config.defaultLabel}</span>
    </span>
  );
}

interface RoleBadgeProps {
  role: string;
  className?: string;
}

const roleColors: Record<string, string> = {
  patient: 'bg-teal-50 text-teal-800 border-teal-200',
  doctor: 'bg-navy-50 text-navy-800 border-navy-200',
  clinician: 'bg-navy-50 text-navy-800 border-navy-200',
  lab_tech: 'bg-amber-600/10 text-amber-600 border-amber-600/20',
  pharmacist: 'bg-amber-600/10 text-amber-600 border-amber-600/20',
  hospital_admin: 'bg-gray-100 text-gray-700 border-gray-200',
  platform_admin: 'bg-gray-100 text-gray-700 border-gray-200',
};

export function RoleBadge({ role, className }: RoleBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full border',
        roleColors[role] || roleColors.patient,
        className
      )}
    >
      {role.replace('_', ' ')}
    </span>
  );
}

