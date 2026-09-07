import { useState } from 'react';
import { useActiveAccount } from '@/lib/auth';
import { PageSkeleton } from '@/components/LoadingSkeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { shortenAddress } from '@/lib/utils';
import {
  Building2,
  Users,
  UserPlus,
  AlertCircle,
  CheckCircle,
  Loader2,
  X,
  Mail,
  Shield,
  Plus,
  Search,
} from 'lucide-react';

interface StaffMember {
  address: string;
  name: string;
  role: string;
  addedAt: string;
}

// Demo staff data — in production this comes from the backend
const DEMO_STAFF: StaffMember[] = [
  { address: '0xabc123def4567890123456789012345678901234', name: 'Dr. Sarah Chen', role: 'doctor', addedAt: '2024-09-01' },
  { address: '0xdef789abc0123456789012345678901234567890', name: 'Mike Johnson', role: 'lab_tech', addedAt: '2024-08-15' },
];

export function HospitalAdminDashboard() {
  const account = useActiveAccount();
  const [staffList, setStaffList] = useState<StaffMember[]>(DEMO_STAFF);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAddr, setNewAddr] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('doctor');
  const [formError, setFormError] = useState('');

  const handleAddStaff = () => {
    setFormError('');
    if (!newAddr.match(/^0x[0-9a-fA-F]{40,64}$/)) {
      setFormError('Invalid wallet address');
      return;
    }
    if (!newName.trim()) {
      setFormError('Name is required');
      return;
    }
    if (staffList.find((s) => s.address === newAddr)) {
      setFormError('Staff member already exists');
      return;
    }

    setStaffList((prev) => [
      ...prev,
      { address: newAddr, name: newName, role: newRole, addedAt: new Date().toISOString().split('T')[0] },
    ]);
    setNewAddr('');
    setNewName('');
    setShowAddForm(false);
  };

  const handleRemoveStaff = (addr: string) => {
    setStaffList((prev) => prev.filter((s) => s.address !== addr));
  };

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-gray-600" />
            Hospital Admin Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your institution's staff wallet addresses
          </p>
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)} className="btn-primary">
          <Plus className="h-4 w-4" />
          {showAddForm ? 'Cancel' : 'Add Staff'}
        </button>
      </div>

      {/* Institution info */}
      <div className="card">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
            <Building2 className="h-5 w-5 text-gray-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800">City General Hospital</p>
            <p className="text-xs text-gray-500">
              License: MED-HOSP-2024-001 · {account ? shortenAddress(account.address) : 'Not connected'}
            </p>
          </div>
          <StatusBadge variant="verified" label="Verified Institution" />
        </div>
      </div>

      {/* Add staff form */}
      {showAddForm && (
        <div className="card border-gray-300 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Register New Staff
          </h3>

          <div>
            <label className="label">Staff Wallet Address</label>
            <input
              type="text"
              value={newAddr}
              onChange={(e) => setNewAddr(e.target.value)}
              placeholder="0x..."
              className="input font-mono text-sm"
            />
          </div>

          <div>
            <label className="label">Full Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Dr. Jane Smith"
              className="input"
            />
          </div>

          <div>
            <label className="label">Role</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="input"
            >
              <option value="doctor">Doctor / Clinician</option>
              <option value="lab_tech">Lab Technician</option>
              <option value="pharmacist">Pharmacist</option>
              <option value="nurse">Nurse</option>
            </select>
          </div>

          {formError && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {formError}
            </div>
          )}

          <button onClick={handleAddStaff} className="btn-primary w-full">
            <UserPlus className="h-4 w-4" />
            Register Staff
          </button>
        </div>
      )}

      {/* Staff list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">
            Registered Staff
            <span className="text-gray-400 font-normal ml-2">({staffList.length})</span>
          </h2>
        </div>

        {staffList.length === 0 ? (
          <div className="card text-center py-6">
            <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No staff registered yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {staffList.map((staff, idx) => (
              <div key={idx} className="card flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-50">
                    <Users className="h-4 w-4 text-gray-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{staff.name}</p>
                    <p className="text-xs text-gray-500 font-mono truncate">
                      {shortenAddress(staff.address)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge variant="verified" label={staff.role.replace('_', ' ')} />
                  <button
                    onClick={() => handleRemoveStaff(staff.address)}
                    className="btn-ghost text-gray-400 hover:text-red-600 p-1.5"
                    title="Remove staff"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info note */}
      <div className="card border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-gray-500 shrink-0" />
          <p className="text-xs text-gray-600">
            Staff management allows you to associate wallet addresses with your institution.
            Only verified wallets can add entries to patient records. On-chain verification
            is managed via the Platform Admin dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
