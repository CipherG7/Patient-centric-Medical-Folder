#[test_only]
module medical_history::medical_history_tests {

    use std::string;
    use sui::test_scenario::{Self as ts};
    use sui::clock::{Self};
    use medical_history::medical_history::ENotVerifiedInstitution;



    use medical_history::institution_registry::{Self, AdminCap, InstitutionRegistry};
    use medical_history::patient_registry::{Self, PatientRegistry};
    use medical_history::permission::{Self, PermissionStore};
    use medical_history::audit_log::{Self, AuditLog};
    use medical_history::medical_history::{Self, MedicalHistory};

    const ADMIN: address = @0xAD;
    const HOSPITAL: address = @0xA1;
    const PATIENT: address = @0xB1;
    const DOCTOR: address = @0xC1;
    const STRANGER: address = @0xD1;

    #[test]
    fun full_flow_add_grant_read_revoke() {
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        // --- publish-time setup: create shared registries/stores ---
        {
            let ctx = ts::ctx(scenario);
            institution_registry::init_for_testing(ctx);
            patient_registry::init_for_testing(ctx);
            permission::init_for_testing(ctx);
            audit_log::init_for_testing(ctx);
        };

        let clock_val = clock::create_for_testing(ts::ctx(scenario));
        let clock_ref = &clock_val;

        // --- admin verifies a hospital ---
        ts::next_tx(scenario, ADMIN);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(scenario);
            let mut registry = ts::take_shared<InstitutionRegistry>(scenario);

            institution_registry::register_institution(
                &admin_cap, &mut registry, HOSPITAL,
                string::utf8(b"County Referral Hospital"),
                string::utf8(b"LIC-001"),
                0,
            );
            ts::return_to_sender(scenario, admin_cap);
            ts::return_shared(registry);
        };

        // --- patient creates their history ---
        ts::next_tx(scenario, PATIENT);
        {
            let mut preg = ts::take_shared<PatientRegistry>(scenario);
            medical_history::create_history(&mut preg, ts::ctx(scenario));
            ts::return_shared(preg);
        };

        // --- hospital appends a lab report entry ---
        ts::next_tx(scenario, HOSPITAL);
        {
            let mut history = ts::take_shared<MedicalHistory>(scenario);
            let institutions = ts::take_shared<InstitutionRegistry>(scenario);
            let mut audit = ts::take_shared<AuditLog>(scenario);
            medical_history::add_entry(
                &mut history, &institutions, &mut audit,
                medical_history::type_lab_report(),
                b"ipfs://Qm.../lab-report-1",
                b"deadbeef", // stand-in SHA-256 digest
                clock_ref, ts::ctx(scenario),
            );
            assert!(medical_history::entry_count(&history) == 1, 0);
            ts::return_shared(history);
            ts::return_shared(institutions);
            ts::return_shared(audit);
        };

        // --- an unauthorized doctor cannot read the history yet ---
        ts::next_tx(scenario, DOCTOR);
        {
            let history = ts::take_shared<MedicalHistory>(scenario);
            let perm = ts::take_shared<PermissionStore>(scenario);
            let audit = ts::take_shared<AuditLog>(scenario);
            // Confirm no full-history access before consent is granted.
            assert!(
                !permission::has_access(
                    &perm, medical_history::history_id(&history), DOCTOR, option::none<u64>(), 0,
                ),
                1,
            );
            ts::return_shared(history);
            ts::return_shared(perm);
            ts::return_shared(audit);
        };

        // --- patient grants the doctor full access ---
        ts::next_tx(scenario, PATIENT);
        {
            let history = ts::take_shared<MedicalHistory>(scenario);
            let mut perm = ts::take_shared<PermissionStore>(scenario);
            let mut audit = ts::take_shared<AuditLog>(scenario);
            medical_history::grant_full_access(
                &history, &mut perm, &mut audit, DOCTOR, 0, clock_ref, ts::ctx(scenario),
            );
            ts::return_shared(history);
            ts::return_shared(perm);
            ts::return_shared(audit);
        };

        // --- doctor can now read the full history ---
        ts::next_tx(scenario, DOCTOR);
        {
            let history = ts::take_shared<MedicalHistory>(scenario);
            let perm = ts::take_shared<PermissionStore>(scenario);
            let mut audit = ts::take_shared<AuditLog>(scenario);
            let entries = medical_history::read_full_history(
                &history, &perm, &mut audit, clock_ref, ts::ctx(scenario),
            );
            assert!(vector::length(&entries) == 1, 2);
            ts::return_shared(history);
            ts::return_shared(perm);
            ts::return_shared(audit);
        };

        // --- patient revokes access; doctor can no longer read ---
        ts::next_tx(scenario, PATIENT);
        {
            let history = ts::take_shared<MedicalHistory>(scenario);
            let mut perm = ts::take_shared<PermissionStore>(scenario);
            let mut audit = ts::take_shared<AuditLog>(scenario);
            medical_history::revoke_access(&history, &mut perm, &mut audit, DOCTOR, clock_ref, ts::ctx(scenario));
            ts::return_shared(history);
            ts::return_shared(perm);
            ts::return_shared(audit);
        };

        ts::next_tx(scenario, DOCTOR);
        {
            let history = ts::take_shared<MedicalHistory>(scenario);
            let perm = ts::take_shared<PermissionStore>(scenario);
            assert!(
                !permission::has_access(
                    &perm, medical_history::history_id(&history), DOCTOR, option::none<u64>(), 0,
                ),
                3,
            );
            ts::return_shared(history);
            ts::return_shared(perm);
        };

        let _ = STRANGER; // referenced to silence unused-constant warning
        clock::destroy_for_testing(clock_val);
        ts::end(scenario_val);
    }

    #[test]
    #[expected_failure(abort_code = ENotVerifiedInstitution)]

    fun unverified_institution_cannot_add_entry() {
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        {
            let ctx = ts::ctx(scenario);
            institution_registry::init_for_testing(ctx);
            patient_registry::init_for_testing(ctx);
            permission::init_for_testing(ctx);
            audit_log::init_for_testing(ctx);
        };
        let clock_val = clock::create_for_testing(ts::ctx(scenario));

        ts::next_tx(scenario, PATIENT);
        {
            let mut preg = ts::take_shared<PatientRegistry>(scenario);
            medical_history::create_history(&mut preg, ts::ctx(scenario));
            ts::return_shared(preg);
        };

        // STRANGER was never registered as an institution.
        ts::next_tx(scenario, STRANGER);
        {
            let mut history = ts::take_shared<MedicalHistory>(scenario);
            let institutions = ts::take_shared<InstitutionRegistry>(scenario);
            let mut audit = ts::take_shared<AuditLog>(scenario);
            medical_history::add_entry(
                &mut history, &institutions, &mut audit,
                medical_history::type_prescription(),
                b"ipfs://Qm.../fake",
                b"badhash",
                &clock_val, ts::ctx(scenario),
            );
            ts::return_shared(history);
            ts::return_shared(institutions);
            ts::return_shared(audit);
        };

        clock::destroy_for_testing(clock_val);
        ts::end(scenario_val);
    }
}

