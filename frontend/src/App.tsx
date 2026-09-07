import { createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Welcome } from '@/pages/Welcome';
import { RoleSelection } from '@/pages/RoleSelection';
import { PatientDashboard } from '@/pages/PatientDashboard';
import { PatientConsent } from '@/pages/PatientConsent';
import { PatientAudit } from '@/pages/PatientAudit';
import { DoctorDashboard } from '@/pages/DoctorDashboard';
import { LabTechDashboard } from '@/pages/LabTechDashboard';
import { HospitalAdminDashboard } from '@/pages/HospitalAdminDashboard';
import { PlatformAdminDashboard } from '@/pages/PlatformAdminDashboard';
import { Settings } from '@/pages/Settings';
import type { UserRole } from '@/types';
import '@mysten/dapp-kit/dist/index.css';

// ─── Role Context (persists across all dashboard navigations) ───
const RoleContext = createContext<UserRole>('patient');

export function useRole(): UserRole {
  return useContext(RoleContext);
}

// ─── React Query ──────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

// ─── Sui Network Config ───────────────────────────────────
const { networkConfig } = createNetworkConfig({
  testnet: { url: getFullnodeUrl('testnet') },
  mainnet: { url: getFullnodeUrl('mainnet') },
  devnet: { url: getFullnodeUrl('devnet') },
  localnet: { url: getFullnodeUrl('localnet') },
});

// ─── Role-aware dashboard wrapper (uses route state OR sessionStorage) ──
const VALID_ROLES: UserRole[] = ['patient', 'doctor', 'lab_tech', 'pharmacist', 'hospital_admin', 'platform_admin'];

function DashboardRouter() {
  const location = useLocation();
  const stateRole = (location.state as { role?: UserRole })?.role;
  const storedRole = sessionStorage.getItem('selectedRole') as UserRole | null;

  // Prefer route state, fall back to sessionStorage, validate the value
  const role = stateRole || (storedRole && VALID_ROLES.includes(storedRole) ? storedRole : undefined);

  // If no role is found, redirect back to Welcome page
  if (!role) {
    return <Navigate to="/" replace />;
  }

  return (
    <RoleContext.Provider value={role}>
      <DashboardLayout role={role} />
    </RoleContext.Provider>
  );
}

// ─── Role-aware index redirect ────────────────────────────
function DashboardIndex() {
  const role = useRole();

  const roleDefaultPaths: Record<UserRole, string> = {
    patient: '/dashboard/history',
    doctor: '/dashboard/search',
    lab_tech: '/dashboard/add-entry',
    pharmacist: '/dashboard/add-entry',
    hospital_admin: '/dashboard/staff',
    platform_admin: '/dashboard/institutions',
  };

  return <Navigate to={roleDefaultPaths[role]} replace />;
}

// ─── Role guard for child routes ──────────────────────────
const PATIENT_ROUTES = ['history', 'consent', 'audit'];
const DOCTOR_ROUTES = ['search', 'documents', 'audit'];
const LAB_TECH_ROUTES = ['add-entry', 'documents', 'search'];
const PHARMACIST_ROUTES = ['add-entry', 'documents', 'search'];
const HOSPITAL_ADMIN_ROUTES = ['staff', 'institutions'];
const PLATFORM_ADMIN_ROUTES = ['institutions'];

const ROLE_ROUTE_MAP: Record<UserRole, string[]> = {
  patient: PATIENT_ROUTES,
  doctor: DOCTOR_ROUTES,
  lab_tech: LAB_TECH_ROUTES,
  pharmacist: PHARMACIST_ROUTES,
  hospital_admin: HOSPITAL_ADMIN_ROUTES,
  platform_admin: PLATFORM_ADMIN_ROUTES,
};

function RoleGuard({ children }: { children: React.ReactNode }) {
  const role = useRole();
  const location = useLocation();

  // Extract the last segment of the current path
  const pathSegment = location.pathname.split('/').pop() || '';

  // Allow 'settings' for all roles
  if (pathSegment === 'settings') return <>{children}</>;

  const allowedRoutes = ROLE_ROUTE_MAP[role] || [];
  if (!allowedRoutes.includes(pathSegment)) {
    // Redirect to role-appropriate default
    const roleDefaultPaths: Record<UserRole, string> = {
      patient: '/dashboard/history',
      doctor: '/dashboard/search',
      lab_tech: '/dashboard/add-entry',
      pharmacist: '/dashboard/add-entry',
      hospital_admin: '/dashboard/staff',
      platform_admin: '/dashboard/institutions',
    };
    return <Navigate to={roleDefaultPaths[role]} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <BrowserRouter>
            <Routes>
              {/* Welcome / Login */}
              <Route path="/" element={<Welcome />} />
              <Route path="/login" element={<Welcome />} />
              <Route path="/choose-role" element={<RoleSelection />} />

              {/* Dashboard shell with dynamic role-based routing */}
              <Route path="/dashboard" element={<DashboardRouter />}>
                <Route index element={<DashboardIndex />} />

                {/* Patient pages */}
                <Route path="history" element={<RoleGuard><PatientDashboard /></RoleGuard>} />
                <Route path="consent" element={<RoleGuard><PatientConsent /></RoleGuard>} />
                <Route path="audit" element={<RoleGuard><PatientAudit /></RoleGuard>} />

                {/* Doctor pages */}
                <Route path="search" element={<RoleGuard><DoctorDashboard /></RoleGuard>} />

                {/* Lab Tech / Pharmacist pages */}
                <Route path="add-entry" element={<RoleGuard><LabTechDashboard /></RoleGuard>} />
                <Route path="documents" element={<RoleGuard><LabTechDashboard /></RoleGuard>} />

                {/* Hospital Admin pages */}
                <Route path="staff" element={<RoleGuard><HospitalAdminDashboard /></RoleGuard>} />
                <Route path="institutions" element={<RoleGuard><PlatformAdminDashboard /></RoleGuard>} />

                {/* Settings (all roles) */}
                <Route path="settings" element={<Settings />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
