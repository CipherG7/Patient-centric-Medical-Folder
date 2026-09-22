/**
 * API client for the Medical History System backend.
 * All requests go through the Vite proxy (/api → localhost:4000/api).
 */

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';

function getSessionToken(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem('auth_session');
}

/**
 * Generic fetch wrapper with error handling.
 */
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const headers: Record<string, string> = {
    ...extraHeaders,
  };
  const token = getSessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('auth_session');
      localStorage.removeItem('auth_role');
    }
    const errorData = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errorData.error || `Request failed: ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

export interface AuthChallengeResponse {
  message: string;
  expiresAt: string;
}

export interface AuthSessionResponse {
  token: string;
  address: string;
  role: string;
  expiresAt: string;
}

export const authApi = {
  challenge: (address: string) =>
    request<AuthChallengeResponse>('POST', '/auth/challenge', { address }),
  verify: (address: string, message: string, signature: string, role: string) =>
    request<AuthSessionResponse>('POST', '/auth/verify', { address, message, signature, role }),
  logout: () => request<void>('POST', '/auth/logout'),
};

// ─── Patient endpoints ────────────────────────────────────

export interface CreateHistoryResponse {
  success: boolean;
  digest: string;
  historyId: string;
  patientAddr: string;
}

export interface LookupHistoryResponse {
  success: boolean;
  patientAddr: string;
  historyId: string;
  metadata: Record<string, any> | null;
}

export interface PatientProfileResponse {
  success: boolean;
  data: {
    user_address: string;
    display_name: string | null;
    email: string | null;
    institution_addr: string | null;
    role: string;
    created_at: string;
    updated_at: string;
  };
}

export const patientApi = {
  createHistory: (patientAddr: string) =>
    request<CreateHistoryResponse>('POST', '/patients/history', { patientAddr }),

  lookupHistory: (addr: string) =>
    request<LookupHistoryResponse>('GET', `/patients/${addr}/history`),

  upsertProfile: (patientAddr: string, data: { displayName?: string; email?: string }) =>
    request<PatientProfileResponse>('POST', '/patients/profile', { patientAddr, ...data }),

  getProfile: (addr: string) =>
    request<PatientProfileResponse>('GET', `/patients/${addr}/profile`),
};

// ─── History / Entry endpoints ────────────────────────────

export interface AddEntryResponse {
  success: boolean;
  digest: string;
  historyId: string;
  entryId: number;
  entryType: number;
}

export interface HistoryResponse {
  success: boolean;
  historyId: string;
  owner: string;
  entryCount: number;
  entries: Array<{
    issuer: string;
    entryType: number;
    offChainRef: string | null;
    contentHash: string | null;
    timestampMs: string;
    revoked: boolean;
    id?: number;
    import?: {
      sourceName: string;
      record: Record<string, unknown>;
    } | null;
  }>;
  metadata: Record<string, any> | null;
}

export interface EntryResponse {
  success: boolean;
  historyId: string;
  entryId: number;
  entry: {
    issuer: string;
    entryType: number;
    offChainRef: string | null;
    contentHash: string | null;
    timestampMs: string;
    revoked: boolean;
  };
}

export const historyApi = {
  addEntry: (
    historyId: string,
    data: { issuerAddr: string; entryType: number; offChainRef: string; contentHash: string }
  ) => request<AddEntryResponse>('POST', `/history/${historyId}/entry`, data),

  revokeEntry: (historyId: string, entryId: number) =>
    request<{ success: boolean; digest: string }>('POST', `/history/${historyId}/revoke-entry`, { entryId }),

  getFullHistory: (historyId: string) =>
    request<HistoryResponse>('GET', `/history/${historyId}`),

  getEntry: (historyId: string, entryId: number) =>
    request<EntryResponse>('GET', `/history/${historyId}/entry/${entryId}`),
};

// ─── Access / Consent endpoints ───────────────────────────

export interface GrantResponse {
  success: boolean;
  digest: string;
  historyId: string;
  granteeAddr: string;
  scope: string;
  expiryMs: number;
}

export const accessApi = {
  grantFullAccess: (historyId: string, granteeAddr: string, expiryMs = 0) =>
    request<GrantResponse>('POST', `/history/${historyId}/grant`, { granteeAddr, expiryMs }),

  grantPartialAccess: (historyId: string, granteeAddr: string, entryIds: number[], expiryMs = 0) =>
    request<GrantResponse>('POST', `/history/${historyId}/grant-partial`, { granteeAddr, entryIds, expiryMs }),

  revokeAccess: (historyId: string, granteeAddr: string) =>
    request<{ success: boolean; digest: string }>('POST', `/history/${historyId}/revoke-access`, { granteeAddr }),
};

// ─── Audit endpoints ──────────────────────────────────────

export interface AuditResponse {
  success: boolean;
  historyId: string;
  count: number;
  events: Array<{
    id: number;
    actor: string;
    action: number;
    actionLabel: string;
    entryId: number | null;
    timestampMs: string;
  }>;
}

export const auditApi = {
  getAuditLog: (historyId: string) =>
    request<AuditResponse>('GET', `/history/${historyId}/audit`),
};

// ─── Institution endpoints ────────────────────────────────

export interface RegisterInstitutionResponse {
  success: boolean;
  digest: string;
  institutionAddr: string;
  hospitalAdminAddr: string | null;
  name: string;
}

export interface InstitutionListResponse {
  success: boolean;
  count: number;
  data: Array<{
    institution_addr: string;
    name: string;
    license_number: string;
    created_at: string;
  }>;
}

export const institutionApi = {
  register: (institutionAddr: string, name: string, licenseNumber: string, adminCapId: string, hospitalAdminAddr?: string) =>
    request<RegisterInstitutionResponse>(
      'POST',
      '/institutions/register',
      { institutionAddr, hospitalAdminAddr: hospitalAdminAddr || undefined, name, licenseNumber },
      { 'x-admin-cap-id': adminCapId }
    ),

  revoke: (institutionAddr: string, adminCapId: string) =>
    request<{ success: boolean; digest: string }>(
      'POST',
      '/institutions/revoke',
      { institutionAddr },
      { 'x-admin-cap-id': adminCapId }
    ),

  reinstate: (institutionAddr: string, adminCapId: string) =>
    request<{ success: boolean; digest: string }>(
      'POST',
      '/institutions/reinstate',
      { institutionAddr },
      { 'x-admin-cap-id': adminCapId }
    ),
  linkAdmin: (institutionAddr: string, hospitalAdminAddr: string) =>
    request<{ success: boolean; institutionAddr: string; hospitalAdminAddr: string }>(
      'POST',
      '/institutions/link-admin',
      { institutionAddr, hospitalAdminAddr }
    ),

  list: () => request<InstitutionListResponse>('GET', '/institutions'),

  get: (addr: string) => request<{ success: boolean; data: any }>('GET', `/institutions/${addr}`),
};

// ─── Document endpoints ───────────────────────────────────

export interface UploadResponse {
  success: boolean;
  offChainRef: string;
  contentHash: string;
  encryptedSize: number;
  entryId: number;
  historyId: string;
}

export const documentApi = {
  upload: async (
    file: File,
    historyId: string,
    entryId: number,
    ownerAddr: string
  ): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('historyId', historyId);
    formData.append('entryId', entryId.toString());
    formData.append('ownerAddr', ownerAddr);

    const response = await fetch(`${API_BASE}/documents/upload`, {
      method: 'POST',
      headers: getSessionToken() ? { Authorization: `Bearer ${getSessionToken()}` } : {},
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `Upload failed: ${response.status}`);
    }

    return response.json();
  },

  getDownloadUrl: (cid: string, historyId: string, entryId: number, contentHash?: string) => {
    const params = new URLSearchParams({ historyId, entryId: entryId.toString() });
    if (contentHash) params.set('contentHash', contentHash);
    return `${API_BASE}/documents/${cid}?${params.toString()}`;
  },
};

export interface ImportHistoryResponse {
  success: boolean;
  historyId: string;
  importedCount: number;
}

export const patientImportApi = {
  upload: async (file: File, patientAddr: string, historyId?: string): Promise<ImportHistoryResponse> => {
    const formData = new FormData();
    formData.append('history', file);
    if (historyId) formData.append('historyId', historyId);
    const response = await fetch(`${API_BASE}/patients/${patientAddr}/import`, {
      method: 'POST',
      headers: getSessionToken() ? { Authorization: `Bearer ${getSessionToken()}` } : {},
      body: formData,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `Import failed: ${response.status}`);
    }
    return response.json();
  },
};

export { request };
