import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, fromUnixTime } from 'date-fns';

/**
 * Merge Tailwind classes with conflict resolution.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a Sui timestamp (milliseconds since epoch) to a human-readable date.
 */
export function formatTimestamp(ms: string | number): string {
  const numMs = typeof ms === 'string' ? parseInt(ms, 10) : ms;
  return format(new Date(numMs), 'MMM d, yyyy HH:mm');
}

/**
 * Format a Sui address for display: 0x1234…abcd
 */
export function shortenAddress(addr: string, chars = 4): string {
  if (!addr) return '';
  if (addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`;
}

/**
 * Truncate a hex hash for display.
 */
export function shortenHash(hash: string, chars = 8): string {
  if (!hash || hash.length <= chars) return hash;
  return `${hash.slice(0, chars)}…${hash.slice(-chars)}`;
}

/**
 * Try to parse a JSON-safe bigint string to number.
 */
export function safeParseInt(value: string | number | undefined, fallback = 0): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'number') return value;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Copy text to clipboard.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format a byte size for display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Map a role string to a label.
 */
export function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    patient: 'Patient',
    doctor: 'Doctor / Clinician',
    lab_tech: 'Lab Technician',
    pharmacist: 'Pharmacist',
    hospital_admin: 'Hospital Admin',
    platform_admin: 'Platform Admin',
  };
  return labels[role] || role;
}

