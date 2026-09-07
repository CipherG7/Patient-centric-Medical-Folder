# Decentralized Patient-Centric Portable Medical History — Sui Move Package

Implements the smart-contract layer described in Chapter 3 of the proposal.
Five modules, one deploy:

| Module | Maps to | Responsibility |
|---|---|---|
| `institution_registry` | Objective (ii), part 1 | Admin-vetted list of healthcare institutions allowed to write entries |
| `patient_registry` | Objective (ii), part 2 | Directory: patient address → their `MedicalHistory` object ID |
| `medical_history` | Objectives (i), (iii) | The patient's history object + entries (off-chain ref + SHA-256 hash only — no clinical content on-chain) |
| `permission` | Objective (iv) | Consent grants: full-history or specific-entry access, with optional expiry |
| `audit_log` | "Immutable audit trail" (Ch. 1/3) | Append-only log of every add/read/grant/revoke |

## Why the modules are split this way

Move enforces struct-field privacy per-module, so `permission` and
`audit_log` never touch `MedicalHistory`'s internals directly. Instead,
`medical_history` is the *only* place that checks "is `tx_context::sender`
really the owner of this history?" (via the `owner: address` field), and it
only calls into `permission`/`audit_log` after that check passes. This is
what stops one patient from granting themselves — or anyone — access to a
different patient's history by guessing an object ID; the grant/revoke/log
functions in those two modules are `public(package)`, i.e. callable only
from other modules in this same package, not directly by a user's
transaction.

## Design choices worth knowing before you defend this

- **Entries are keyed by `u64` index** (0, 1, 2, ...) inside each patient's
  `Table`, not by a fresh Sui object ID per entry. Simpler to reason about
  and cheaper on gas; the trade-off is entries aren't independently
  transferable objects, which the proposal doesn't require anyway.
- **`MedicalHistory` is a shared object**, not owned in Sui's native
  single-owner sense. It has to be, since institutions (not just the
  patient) need to submit transactions that mutate it. Patient-ownership is
  instead enforced logically via the `owner: address` field + assertions.
- **Nothing is ever deleted.** `revoke_entry` and `revoke_grant` flip a flag
  / remove a permission row going forward, but the underlying `AuditLog`
  entries are pure appends — matching the "immutable audit trail" language
  in your proposal.
- **Encryption itself (AES-256) happens off-chain**, in your Node.js/React
  app, before the encrypted blob is uploaded to IPFS/off-chain storage. The
  chain only ever sees `off_chain_ref` (e.g. an IPFS CID) and
  `content_hash` (the SHA-256 digest of the encrypted bytes) — this is what
  the case-study literature review (HealthRec-Chain, EHRChain) also does,
  and it's why raw patient data never has to be stored on a public ledger.

## Building and testing

I wasn't able to run the Sui CLI in this environment to compile-check the
code, so treat this as a strong first draft rather than a guaranteed
zero-error build. On your machine (with the Sui CLI installed):

```bash
sui move build
sui move test
```

`tests/medical_history_tests.move` exercises the full flow end-to-end:
admin verifies a hospital → patient creates a history → hospital adds a lab
report → an unauthorized doctor is confirmed to have no access → patient
grants the doctor full access → doctor reads the history → patient revokes
access → doctor is confirmed locked out again. A second test confirms an
unverified address can't call `add_entry`.

If `sui move build` throws errors, paste the exact error output back to me
(it's very likely to be small things like a Sui framework API that has
shifted between versions — `table`, `clock`, and `test_scenario` APIs do
change slightly release to release) and I'll fix them with you.

## Publishing and wiring up a frontend

After `sui client publish`, you'll get back:
- The `AdminCap` object (sent to your address) — use it to call
  `register_institution` for each hospital/clinic/lab in your pilot.
- The shared object IDs for `InstitutionRegistry`, `PatientRegistry`,
  `PermissionStore`, and `AuditLog` — your Node.js backend needs all four
  IDs (plus the Sui `Clock` object ID, `0x6`) to construct transactions via
  the Sui TypeScript SDK.
