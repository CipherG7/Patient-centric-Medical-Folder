# Encryption + Off-Chain Storage Layer - Progress

## Encryption Layer
- [x] Create AES-256-GCM encrypt/decrypt module
- [x] Create per-entry key manager with wrapping for grantees
- [ ] (To be done after approval)

## IPFS/Storage Layer
- [x] Create IPFS HTTP client (configurable endpoint + local fallback)
- [x] Create document service orchestrator

## Routes & Integration
- [x] Create documents upload route
- [ ] Update config with encryption & IPFS vars
- [ ] Integrate encryption flow into history add-entry
- [ ] Mount documents router in route aggregator
- [ ] Add entry_keys table migration

## Final
- [ ] Run migration
- [ ] Test build

