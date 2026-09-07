/// Stores consent grants that a patient has issued over their medical
/// history. This module is intentionally "dumb": it has no idea what a
/// `MedicalHistory` object is and cannot be fooled into creating a grant for
/// a history it doesn't belong to, because it never accepts an owner
/// address as a bare argument. Every mutating function is `public(package)`
/// and can only be called from `medical_history`, which first proves, using
/// the real `MedicalHistory.owner` field, that the caller is genuinely the
/// patient before delegating here. This is what keeps one patient from
/// granting themselves access to someone else's history.
module medical_history::permission {

    use sui::table::{Self, Table};
    use sui::event;

    /// Grants the full history, every entry, present and future.
    const SCOPE_FULL: u8 = 0;
    /// Grants only the specific entry ids listed in `entry_ids`.
    const SCOPE_PARTIAL: u8 = 1;

    public fun scope_full(): u8 { SCOPE_FULL }
    public fun scope_partial(): u8 { SCOPE_PARTIAL }

    /// A single active grant from a patient to one grantee (a doctor,
    /// clinic wallet, etc). `expiry_ms == 0` means "no expiry".
    public struct Grant has store, drop, copy {
        scope: u8,
        entry_ids: vector<u64>,
        expiry_ms: u64,
    }

    /// Shared, singleton store of all grants, keyed first by the
    /// `MedicalHistory` object ID, then by grantee address.
    public struct PermissionStore has key {
        id: UID,
        grants: Table<ID, Table<address, Grant>>,
    }

    public struct AccessGranted has copy, drop {
        history_id: ID,
        grantee: address,
        scope: u8,
    }

    public struct AccessRevoked has copy, drop {
        history_id: ID,
        grantee: address,
    }

    fun init(ctx: &mut TxContext) {
        transfer::share_object(PermissionStore {
            id: object::new(ctx),
            grants: table::new(ctx),
        });
    }

    fun ensure_bucket(store: &mut PermissionStore, history_id: ID, ctx: &mut TxContext) {
        if (!table::contains(&store.grants, history_id)) {
            table::add(&mut store.grants, history_id, table::new(ctx));
        }
    }

    /// Grant (or overwrite) full-history access to `grantee`.
    /// Only callable by `medical_history` after it verifies the caller is
    /// the true owner of `history_id`.
    public(package) fun set_full_grant(
        store: &mut PermissionStore,
        history_id: ID,
        grantee: address,
        expiry_ms: u64,
        ctx: &mut TxContext,
    ) {
        ensure_bucket(store, history_id, ctx);
        let bucket = table::borrow_mut(&mut store.grants, history_id);
        let grant = Grant { scope: SCOPE_FULL, entry_ids: vector[], expiry_ms };

        if (table::contains(bucket, grantee)) {
            *table::borrow_mut(bucket, grantee) = grant;
        } else {
            table::add(bucket, grantee, grant);
        };
        event::emit(AccessGranted { history_id, grantee, scope: SCOPE_FULL });
    }

    /// Grant (or overwrite) access limited to specific entry ids.
    public(package) fun set_partial_grant(
        store: &mut PermissionStore,
        history_id: ID,
        grantee: address,
        entry_ids: vector<u64>,
        expiry_ms: u64,
        ctx: &mut TxContext,
    ) {
        ensure_bucket(store, history_id, ctx);
        let bucket = table::borrow_mut(&mut store.grants, history_id);
        let grant = Grant { scope: SCOPE_PARTIAL, entry_ids, expiry_ms };
        if (table::contains(bucket, grantee)) {
            *table::borrow_mut(bucket, grantee) = grant;
        } else {
            table::add(bucket, grantee, grant);
        };
        event::emit(AccessGranted { history_id, grantee, scope: SCOPE_PARTIAL });
    }

    /// Revoke whatever grant `grantee` currently has, if any.
    public(package) fun revoke_grant(
        store: &mut PermissionStore,
        history_id: ID,
        grantee: address,
    ) {
        if (table::contains(&store.grants, history_id)) {
            let bucket = table::borrow_mut(&mut store.grants, history_id);
            if (table::contains(bucket, grantee)) {
                table::remove(bucket, grantee);
                event::emit(AccessRevoked { history_id, grantee });
            };
        };
    }

    /// True if `viewer` currently has a live (non-expired) grant covering
    /// `entry_id` (pass `option::none()` when checking whole-history reads).
    /// `now_ms` should come from `sui::clock::Clock` at the call site.
    public fun has_access(
        store: &PermissionStore,
        history_id: ID,
        viewer: address,
        entry_id: Option<u64>,
        now_ms: u64,
    ): bool {
        if (!table::contains(&store.grants, history_id)) {
            return false
        };
        let bucket = table::borrow(&store.grants, history_id);
        if (!table::contains(bucket, viewer)) {
            return false
        };
        let grant = table::borrow(bucket, viewer);
        if (grant.expiry_ms != 0 && grant.expiry_ms < now_ms) {
            return false
        };
        if (grant.scope == SCOPE_FULL) {
            true
        } else if (option::is_some(&entry_id)) {
            vector::contains(&grant.entry_ids, option::borrow(&entry_id))
        } else {
            // Whole-history read requested but only a partial grant exists.
            false
        }
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
