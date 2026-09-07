/// A lightweight directory that lets anyone (with the patient's address)
/// look up the object ID of that patient's `MedicalHistory`, without the
/// patient having to hand out the ID out-of-band. Registration is
/// self-service: a patient calls `register` themselves, there is no
/// gatekeeping here (unlike institutions, patients don't need vetting).
module medical_history::patient_registry {

    use sui::table::{Self, Table};
    use sui::event;

    /// Raised when an address tries to register a second medical history.
    const EAlreadyRegistered: u64 = 0;

    /// Shared, singleton directory: patient address -> history object ID.
    public struct PatientRegistry has key {
        id: UID,
        histories: Table<address, ID>,
    }

    public struct PatientRegistered has copy, drop {
        patient: address,
        history_id: ID,
    }

    fun init(ctx: &mut TxContext) {
        transfer::share_object(PatientRegistry {
            id: object::new(ctx),
            histories: table::new(ctx),
        });
    }

    /// Called once by `medical_history::create_history` right after a new
    /// `MedicalHistory` object is created, to record the mapping. Restricted
    /// to the package so it can't be spoofed to point at someone else's
    /// history.
    public(package) fun record(
        registry: &mut PatientRegistry,
        patient: address,
        history_id: ID,
    ) {
        assert!(!table::contains(&registry.histories, patient), EAlreadyRegistered);
        table::add(&mut registry.histories, patient, history_id);
        event::emit(PatientRegistered { patient, history_id });
    }

    public fun has_history(registry: &PatientRegistry, patient: address): bool {
        table::contains(&registry.histories, patient)
    }

    public fun history_id_of(registry: &PatientRegistry, patient: address): ID {
        *table::borrow(&registry.histories, patient)
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
