/// Core module of the Decentralized Patient-Centric Portable Medical
/// History System.
///
/// Design summary (see proposal Chapter 3 for the full rationale):
/// - A patient's `MedicalHistory` is a single shared object they own
///   (ownership is enforced by an `owner` field + sender checks, not by
///   Sui's object-ownership model, since institutions also need to mutate
///   it).
/// - Each `HistoryEntry` stores only off-chain metadata: a pointer to the
///   encrypted document (e.g. an IPFS CID) and a SHA-256 hash of the
///   encrypted bytes. The clinical content itself never touches the chain.
/// - Only institutions verified in `institution_registry` may append
///   entries.
/// - Reading (in full, or entry-by-entry) is gated by `permission`, and
///   every add/revoke/read is written to `audit_log`.
module medical_history::medical_history {

    use sui::table::{Self, Table};
    use sui::event;
    use sui::clock::{Self, Clock};

    use medical_history::institution_registry::{Self, InstitutionRegistry};
    use medical_history::patient_registry::{Self, PatientRegistry};
    use medical_history::permission::{Self, PermissionStore};
    use medical_history::audit_log::{Self, AuditLog};

    // ---- Entry type codes (Section 1.6 of the proposal) ----
    const TYPE_DIAGNOSIS: u8 = 0;
    const TYPE_LAB_REPORT: u8 = 1;
    const TYPE_PRESCRIPTION: u8 = 2;
    const TYPE_VACCINATION: u8 = 3;
    const TYPE_REFERRAL: u8 = 4;
    const TYPE_DISCHARGE_SUMMARY: u8 = 5;
    const TYPE_IMAGING_REPORT: u8 = 6;

    public fun type_diagnosis(): u8 { TYPE_DIAGNOSIS }
    public fun type_lab_report(): u8 { TYPE_LAB_REPORT }
    public fun type_prescription(): u8 { TYPE_PRESCRIPTION }
    public fun type_vaccination(): u8 { TYPE_VACCINATION }
    public fun type_referral(): u8 { TYPE_REFERRAL }
    public fun type_discharge_summary(): u8 { TYPE_DISCHARGE_SUMMARY }
    public fun type_imaging_report(): u8 { TYPE_IMAGING_REPORT }

    // ---- Errors ----
    const ENotOwner: u64 = 0;
    const ENotVerifiedInstitution: u64 = 1;
    const ENoSuchEntry: u64 = 2;
    const EAccessDenied: u64 = 3;

    /// One entry in a patient's history. The actual clinical document lives
    /// off-chain (e.g. IPFS); only enough metadata is kept on-chain to
    /// prove authorship, order, and integrity.
    public struct HistoryEntry has store, drop, copy {
        issuer: address,
        entry_type: u8,
        off_chain_ref: vector<u8>, // e.g. IPFS CID, as bytes
        content_hash: vector<u8>,  // SHA-256 of the encrypted document
        timestamp_ms: u64,
        revoked: bool,
    }

    public fun entry_issuer(e: &HistoryEntry): address { e.issuer }
    public fun entry_type(e: &HistoryEntry): u8 { e.entry_type }
    public fun entry_off_chain_ref(e: &HistoryEntry): vector<u8> { e.off_chain_ref }
    public fun entry_content_hash(e: &HistoryEntry): vector<u8> { e.content_hash }
    public fun entry_timestamp(e: &HistoryEntry): u64 { e.timestamp_ms }
    public fun entry_revoked(e: &HistoryEntry): bool { e.revoked }

    /// A patient's complete, continuous medical history. Shared so that
    /// verified institutions can append to it, but every mutating function
    /// below enforces the real access-control rules.
    public struct MedicalHistory has key {
        id: UID,
        owner: address,
        entries: Table<u64, HistoryEntry>,
        entry_count: u64,
    }

    public struct HistoryCreated has copy, drop {
        history_id: ID,
        owner: address,
    }

    public struct EntryAdded has copy, drop {
        history_id: ID,
        entry_id: u64,
        issuer: address,
        entry_type: u8,
    }

    public struct EntryRevoked has copy, drop {
        history_id: ID,
        entry_id: u64,
    }

    // ------------------------------------------------------------------
    // Creation
    // ------------------------------------------------------------------

    /// A patient calls this once to create their history object. It's
    /// shared immediately so institutions can later append to it, and the
    /// mapping is recorded in `PatientRegistry` for discoverability.
    public fun create_history(
        patient_registry: &mut PatientRegistry,
        ctx: &mut TxContext,
    ) {
        let owner = tx_context::sender(ctx);
        let history = MedicalHistory {
            id: object::new(ctx),
            owner,
            entries: table::new(ctx),
            entry_count: 0,
        };
        let history_id = object::id(&history);
        patient_registry::record(patient_registry, owner, history_id);
        event::emit(HistoryCreated { history_id, owner });
        transfer::share_object(history);
    }

    public fun owner_of(history: &MedicalHistory): address { history.owner }
    public fun history_id(history: &MedicalHistory): ID { object::id(history) }
    public fun entry_count(history: &MedicalHistory): u64 { history.entry_count }

    // ------------------------------------------------------------------
    // Writing entries (verified institutions only)
    // ------------------------------------------------------------------

    /// Appends a new entry. Only a verified institution (per
    /// `InstitutionRegistry`) may call this; the caller becomes `issuer`.
    public fun add_entry(
        history: &mut MedicalHistory,
        institutions: &InstitutionRegistry,
        audit: &mut AuditLog,
        entry_type: u8,
        off_chain_ref: vector<u8>,
        content_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let issuer = tx_context::sender(ctx);
        assert!(institution_registry::is_verified(institutions, issuer), ENotVerifiedInstitution);

        let now = clock::timestamp_ms(clock);
        let entry_id = history.entry_count;
        table::add(
            &mut history.entries,
            entry_id,
            HistoryEntry { issuer, entry_type, off_chain_ref, content_hash, timestamp_ms: now, revoked: false },
        );
        history.entry_count = entry_id + 1;

        let hid = object::id(history);
        event::emit(EntryAdded { history_id: hid, entry_id, issuer, entry_type });
        audit_log::log(audit, hid, issuer, audit_log::action_entry_added(), option::some(entry_id), now, ctx);
    }

    /// Lets the patient (owner) mark an entry as revoked, e.g. because it
    /// was recorded in error. The entry is kept (nothing is ever deleted,
    /// preserving the immutable audit trail) but flagged so front-ends can
    /// grey it out / exclude it from a canonical view.
    public fun revoke_entry(
        history: &mut MedicalHistory,
        audit: &mut AuditLog,
        entry_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == history.owner, ENotOwner);
        assert!(table::contains(&history.entries, entry_id), ENoSuchEntry);
        let entry = table::borrow_mut(&mut history.entries, entry_id);
        entry.revoked = true;

        let now = clock::timestamp_ms(clock);
        let hid = object::id(history);
        event::emit(EntryRevoked { history_id: hid, entry_id });
        audit_log::log(audit, hid, history.owner, audit_log::action_entry_revoked(), option::some(entry_id), now, ctx);
    }

    // ------------------------------------------------------------------
    // Consent management (thin wrappers that first prove real ownership,
    // then delegate storage to `permission`)
    // ------------------------------------------------------------------

    /// Grants `grantee` access to the entire history. `expiry_ms == 0`
    /// means the grant never expires until explicitly revoked.
    public fun grant_full_access(
        history: &MedicalHistory,
        perm: &mut PermissionStore,
        audit: &mut AuditLog,
        grantee: address,
        expiry_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == history.owner, ENotOwner);
        let hid = object::id(history);
        permission::set_full_grant(perm, hid, grantee, expiry_ms, ctx);
        audit_log::log(
            audit, hid, history.owner, audit_log::action_access_granted(),
            option::none<u64>(), clock::timestamp_ms(clock), ctx,
        );
    }

    /// Grants `grantee` access limited to the listed `entry_ids`.
    public fun grant_partial_access(
        history: &MedicalHistory,
        perm: &mut PermissionStore,
        audit: &mut AuditLog,
        grantee: address,
        entry_ids: vector<u64>,
        expiry_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == history.owner, ENotOwner);
        let hid = object::id(history);
        permission::set_partial_grant(perm, hid, grantee, entry_ids, expiry_ms, ctx);
        audit_log::log(
            audit, hid, history.owner, audit_log::action_access_granted(),
            option::none<u64>(), clock::timestamp_ms(clock), ctx,
        );
    }

    /// Revokes whatever access `grantee` currently has, full or partial.
    public fun revoke_access(
        history: &MedicalHistory,
        perm: &mut PermissionStore,
        audit: &mut AuditLog,
        grantee: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == history.owner, ENotOwner);
        let hid = object::id(history);
        permission::revoke_grant(perm, hid, grantee);
        audit_log::log(
            audit, hid, history.owner, audit_log::action_access_revoked(),
            option::none<u64>(), clock::timestamp_ms(clock), ctx,
        );
    }

    // ------------------------------------------------------------------
    // Reading (owner always allowed; others must hold a live grant)
    // ------------------------------------------------------------------

    /// Returns every entry in the history. Reverts if the caller is
    /// neither the owner nor holds a live full-access grant. Every
    /// successful call is written to the audit log, including reads by the
    /// owner themselves, so the patient can see their own access pattern
    /// too.
    public fun read_full_history(
        history: &MedicalHistory,
        perm: &PermissionStore,
        audit: &mut AuditLog,
        clock: &Clock,
        ctx: &mut TxContext,
    ): vector<HistoryEntry> {
        let viewer = tx_context::sender(ctx);
        let hid = object::id(history);
        let now = clock::timestamp_ms(clock);
        let authorized = viewer == history.owner
            || permission::has_access(perm, hid, viewer, option::none<u64>(), now);
        assert!(authorized, EAccessDenied);

        audit_log::log(audit, hid, viewer, audit_log::action_full_read(), option::none<u64>(), now, ctx);

        let mut result: vector<HistoryEntry> = vector[];

        let mut i = 0;
        while (i < history.entry_count) {
            if (table::contains(&history.entries, i)) {
                vector::push_back(&mut result, *table::borrow(&history.entries, i));
            };
            i = i + 1;
        };


        result
    }

    /// Returns a single entry. Reverts if the caller is neither the owner
    /// nor holds a grant (full or partial) covering `entry_id`.
    public fun read_entry(
        history: &MedicalHistory,
        perm: &PermissionStore,
        audit: &mut AuditLog,
        entry_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): HistoryEntry {
        assert!(table::contains(&history.entries, entry_id), ENoSuchEntry);
        let viewer = tx_context::sender(ctx);
        let hid = object::id(history);
        let now = clock::timestamp_ms(clock);
        let authorized = viewer == history.owner
            || permission::has_access(perm, hid, viewer, option::some(entry_id), now);
        assert!(authorized, EAccessDenied);

        audit_log::log(audit, hid, viewer, audit_log::action_partial_read(), option::some(entry_id), now, ctx);
        *table::borrow(&history.entries, entry_id)
    }
}
