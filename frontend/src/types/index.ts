/**
 * TypeScript types mirroring the Sui Move structs and backend API responses.
 */

// ─── Entry types (from medical_history.move constants) ────
export enum EntryType {
  Diagnosis = 0,
  LabReport = 1,
  Prescription = 2,
  Vaccination = 3,
  Referral = 4,
  DischargeSummary = 5,
  ImagingReport = 6,
}

export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  [EntryType.Diagnosis]: 'Diagnosis',
  [EntryType.LabReport]: 'Lab Report',
  [EntryType.Prescription]: 'Prescription',
  [EntryType.Vaccination]: 'Vaccination',
  [EntryType.Referral]: 'Referral',
  [EntryType.DischargeSummary]: 'Discharge Summary',
  [EntryType.ImagingReport]: 'Imaging Report',
};

export const ENTRY_TYPE_ICONS: Record<EntryType, string> = {
  [EntryType.Diagnosis]: 'stethoscope',
  [EntryType.LabReport]: 'flask-conical',
  [EntryType.Prescription]: 'pill',
  [EntryType.Vaccination]: 'syringe',
  [EntryType.Referral]: 'arrow-right-circle',
  [EntryType.DischargeSummary]: 'file-text',
  [EntryType.ImagingReport]: 'scan-eye',
};

// ─── Permission scope (from permission.move) ──────────────
export enum GrantScope {
  Full = 0,
  Partial = 1,
}

// ─── Audit action codes (from audit_log.move) ────────────
export enum AuditAction {
  EntryAdded = 0,
  EntryRevoked = 1,
  FullRead = 2,
  PartialRead = 3,
  AccessGranted = 4,
  AccessRevoked = 5,
}

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  [AuditAction.EntryAdded]: 'Entry Added',
  [AuditAction.EntryRevoked]: 'Entry Revoked',
  [AuditAction.FullRead]: 'Full History Read',
  [AuditAction.PartialRead]: 'Entry Read',
  [AuditAction.AccessGranted]: 'Access Granted',
  [AuditAction.AccessRevoked]: 'Access Revoked',
};

export const AUDIT_ACTION_ICONS: Record<AuditAction, string> = {
  [AuditAction.EntryAdded]: 'plus-circle',
  [AuditAction.EntryRevoked]: 'x-circle',
  [AuditAction.FullRead]: 'eye',
  [AuditAction.PartialRead]: 'eye-off',
  [AuditAction.AccessGranted]: 'unlock',
  [AuditAction.AccessRevoked]: 'lock',
};

// ─── User roles ────────────────────────────────────────────
export type UserRole = 'patient' | 'doctor' | 'lab_tech' | 'pharmacist' | 'hospital_admin' | 'platform_admin';

export interface UserInfo {
  address: string;
  role: UserRole;
}

// ─── Data types ────────────────────────────────────────────

export interface HistoryEntry {
  id?: number;
  issuer: string;
  entryType: number;
  offChainRef: string | null;
  contentHash: string | null;
  timestampMs: string;
  revoked: boolean;
}

export interface MedicalHistory {
  historyId: string;
  owner: string;
  entryCount: number;
  entries: HistoryEntry[];
  metadata: Record<string, any> | null;
}

export interface Grant {
  granteeAddr: string;
  scope: GrantScope;
  entryIds?: number[];
  expiryMs: number;
}

export interface AuditEvent {
  id: number;
  actor: string;
  action: number;
  actionLabel: string;
  entryId: number | null;
  timestampMs: string;
}

export interface Institution {
  institutionAddr: string;
  name: string;
  licenseNumber: string;
  verified: boolean;
  registeredAtMs: string;
}

export interface PatientProfile {
  userAddress: string;
  displayName: string | null;
  email: string | null;
  role: string;
  createdAt: string;
}

export interface HistoryMetadata {
  historyId: string;
  patientAddr: string;
  createdAt: string;
}

// ─── API response wrappers ────────────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  digest?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  count: number;
  data: T[];
}

