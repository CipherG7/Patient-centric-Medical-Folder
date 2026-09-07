/// An append-only log of everything that happens to a patient's medical
/// history: entries being added, full or partial reads, and grants/revokes.
/// Nothing here can be edited or deleted once written -- Sui Move has no
/// "delete a row" primitive exposed for this table, and no function in this
/// module removes entries, so the log is tamper-evident by construction.
/// Writing is `public(package)`, so only `medical_history` (which has
/// already checked who's allowed to do what) can add entries.
module medical_history::audit_log {

    use sui::table::{Self, Table};
    use sui::event;

    /// Action codes, kept small and explicit so they're cheap to store and
    /// easy for a frontend to map to a human-readable label.
    const ACTION_ENTRY_ADDED: u8 = 0;
    const ACTION_ENTRY_REVOKED: u8 = 1;
    const ACTION_FULL_READ: u8 = 2;
    const ACTION_PARTIAL_READ: u8 = 3;
    const ACTION_ACCESS_GRANTED: u8 = 4;
    const ACTION_ACCESS_REVOKED: u8 = 5;

    public fun action_entry_added(): u8 { ACTION_ENTRY_ADDED }
    public fun action_entry_revoked(): u8 { ACTION_ENTRY_REVOKED }
    public fun action_full_read(): u8 { ACTION_FULL_READ }
    public fun action_partial_read(): u8 { ACTION_PARTIAL_READ }
    public fun action_access_granted(): u8 { ACTION_ACCESS_GRANTED }
    public fun action_access_revoked(): u8 { ACTION_ACCESS_REVOKED }

    public struct AuditEvent has store, drop, copy {
        actor: address,
        action: u8,
        entry_id: Option<u64>,
        timestamp_ms: u64,
    }

    /// Shared, singleton log store, keyed by `MedicalHistory` object ID so
    /// that a patient (or anyone they've granted access to) can pull just
    /// their own trail.
    public struct AuditLog has key {
        id: UID,
        events: Table<ID, vector<AuditEvent>>,
    }

    public struct EventLogged has copy, drop {
        history_id: ID,
        actor: address,
        action: u8,
    }

    fun init(ctx: &mut TxContext) {
        transfer::share_object(AuditLog {
            id: object::new(ctx),
            events: table::new(ctx),
        });
    }

    public(package) fun log(
        log: &mut AuditLog,
        history_id: ID,
        actor: address,
        action: u8,
        entry_id: Option<u64>,
        timestamp_ms: u64,
        _ctx: &mut TxContext,
    ) {
        if (!table::contains(&log.events, history_id)) {
            table::add(&mut log.events, history_id, vector[]);

        };
        let events = table::borrow_mut(&mut log.events, history_id);
        vector::push_back(events, AuditEvent { actor, action, entry_id, timestamp_ms });
        event::emit(EventLogged { history_id, actor, action });
        let _ = _ctx; // reserved for future use (e.g. per-event ids)
    }


    /// Returns the full audit trail for a given history. Access control is
    /// the caller's job (`medical_history` only exposes this to the owner
    /// and, optionally, to grantees with full access).
    public fun events_for(log: &AuditLog, history_id: ID): vector<AuditEvent> {
        if (!table::contains(&log.events, history_id)) {
            vector[]

        } else {
            *table::borrow(&log.events, history_id)
        }
    }

    public fun action_of(e: &AuditEvent): u8 { e.action }
    public fun actor_of(e: &AuditEvent): address { e.actor }
    public fun timestamp_of(e: &AuditEvent): u64 { e.timestamp_ms }
    public fun entry_id_of(e: &AuditEvent): Option<u64> { e.entry_id }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
