/// Maintains the set of healthcare institutions that are allowed to append
/// entries to a patient's medical history. Only the holder of `AdminCap`
/// (deployed to the platform administrator) can register or revoke an
/// institution, which mirrors the real-world vetting process described in
/// the proposal (hospitals/clinics/labs are verified before they can write
/// to a patient's history).
module medical_history::institution_registry {

    use std::string::String;
    use sui::table::{Self, Table};
    use sui::event;


    /// Raised when trying to register an institution address twice.
    const EAlreadyRegistered: u64 = 1;
    /// Raised when an operation targets an address that was never registered.
    const ENotRegistered: u64 = 2;

    /// Capability proving platform-admin rights. Held by whoever deploys the
    /// package (typically the university/organisation running the platform).
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Metadata kept for every registered institution.
    public struct Institution has store, drop, copy {
        name: String,
        license_number: String,
        verified: bool,
        registered_at_ms: u64,
    }

    /// Shared, singleton registry of all institutions known to the platform.
    public struct InstitutionRegistry has key {
        id: UID,
        institutions: Table<address, Institution>,
    }

    public struct InstitutionRegistered has copy, drop {
        institution: address,
        name: String,
    }

    public struct InstitutionRevoked has copy, drop {
        institution: address,
    }

    /// Runs once at publish time: mints the AdminCap to the deployer and
    /// shares an empty registry.
    fun init(ctx: &mut TxContext) {
        transfer::transfer(
            AdminCap { id: object::new(ctx) },
            tx_context::sender(ctx),
        );
        transfer::share_object(InstitutionRegistry {
            id: object::new(ctx),
            institutions: table::new(ctx),
        });
    }

    /// Registers (or re-verifies) an institution. Admin-only.
    public fun register_institution(
        _admin: &AdminCap,
        registry: &mut InstitutionRegistry,
        institution_addr: address,
        name: String,
        license_number: String,
        registered_at_ms: u64,
    ) {
        assert!(
            !table::contains(&registry.institutions, institution_addr),
            EAlreadyRegistered,
        );
        table::add(
            &mut registry.institutions,
            institution_addr,
            Institution { name, license_number, verified: true, registered_at_ms },
        );
        event::emit(InstitutionRegistered { institution: institution_addr, name });
    }

    /// Revokes an institution's verified status (e.g. licence withdrawn).
    /// The record is kept (so historical entries it authored remain
    /// attributable) but `verified` is flipped to false, which blocks any
    /// future `add_entry` calls from that address.
    public fun revoke_institution(
        _admin: &AdminCap,
        registry: &mut InstitutionRegistry,
        institution_addr: address,
    ) {
        assert!(
            table::contains(&registry.institutions, institution_addr),
            ENotRegistered,
        );
        let inst = table::borrow_mut(&mut registry.institutions, institution_addr);
        inst.verified = false;
        event::emit(InstitutionRevoked { institution: institution_addr });
    }

    /// Re-instates a previously revoked institution.
    public fun reinstate_institution(
        _admin: &AdminCap,
        registry: &mut InstitutionRegistry,
        institution_addr: address,
    ) {
        assert!(
            table::contains(&registry.institutions, institution_addr),
            ENotRegistered,
        );
        let inst = table::borrow_mut(&mut registry.institutions, institution_addr);
        inst.verified = true;
    }

    /// Read-only check used by other modules (e.g. `medical_history`) to
    /// confirm that whoever is trying to append an entry is a verified
    /// institution.
    public fun is_verified(registry: &InstitutionRegistry, addr: address): bool {
        if (!table::contains(&registry.institutions, addr)) {
            false
        } else {
            table::borrow(&registry.institutions, addr).verified
        }
    }

    public fun name_of(registry: &InstitutionRegistry, addr: address): String {
        assert!(table::contains(&registry.institutions, addr), ENotRegistered);
        table::borrow(&registry.institutions, addr).name
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
