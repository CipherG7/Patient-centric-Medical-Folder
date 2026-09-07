# Medical History System — Backend API

REST API backend for the Decentralized Patient-Centric Portable Medical History System on Sui.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Client App  │────▶│  Express Server  │────▶│  Sui Testnet    │
│ (REST calls) │     │  (src/index.ts)  │     │  (Move modules) │
└─────────────┘     │                  │     └─────────────────┘
                    │  ┌────────────┐  │     ┌─────────────────┐
                    │  │ PostgreSQL │  │────▶│  Off-chain data  │
                    │  │ (profiles, │  │     │  (profiles,      │
                    │  │  sessions) │  │     │   sessions,      │
                    │  └────────────┘  │     │   metadata)      │
                    └──────────────────┘     └─────────────────┘
```

## Key Design Decision: Wallet Strategy

**This demo uses a backend-held Sui keypair for signing transactions.**

**Why:** The backend signs all transactions on behalf of the admin/operator. This eliminates the need for callers to have a Sui Wallet browser extension installed, making the REST API usable standalone.

**Production recommendation:** The PTB construction code in `src/sui/transactions.ts` stays the same, but signing should be delegated to the client (e.g., Sui Wallet extension via `wallet-standard`). The backend would construct and return a serialised transaction block, and the client would sign and submit it.

## Prerequisites

- **Node.js** >= 18
- **PostgreSQL** >= 14
- A **Sui testnet account** with coins (faucet: https://faucet.sui.io)
- The **published Move package** (run `sui client publish` from the `sui/` directory)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your values:
#   - ADMIN_PRIVATE_KEY: hex-encoded Sui private key
#   - PACKAGE_ID: the published package object ID
#   - SHARED_INSTITUTION_REGISTRY, SHARED_PATIENT_REGISTRY,
#     SHARED_PERMISSION_STORE, SHARED_AUDIT_LOG: object IDs
#     from the publish output
#   - DATABASE_URL: PostgreSQL connection string
```

### 3. Set up PostgreSQL

Create the database:

```bash
createdb medical_history
```

Run migrations:

```bash
npm run migrate
```

### 4. Start the server

```bash
npm run dev
```

The server starts on `http://localhost:4000`.

## API Reference

### Health Check

```
GET /api/health
```

### Institutions

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | `/api/institutions/register` | Register a new institution |
| POST   | `/api/institutions/revoke` | Revoke institution (set verified=false) |
| POST   | `/api/institutions/reinstate` | Reinstate a revoked institution |
| GET    | `/api/institutions/:addr` | Get institution profile |
| GET    | `/api/institutions` | List all institutions |

### Patients

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | `/api/patients/history` | Create a new medical history |
| GET    | `/api/patients/:addr/history` | Lookup patient's history ID |
| POST   | `/api/patients/profile` | Create/update off-chain profile |
| GET    | `/api/patients/:addr/profile` | Get patient profile |

### Medical History

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | `/api/history/:historyId/entry` | Add an entry (institution only) |
| POST   | `/api/history/:historyId/revoke-entry` | Revoke an entry (owner only) |
| GET    | `/api/history/:historyId` | Read full history |
| GET    | `/api/history/:historyId/entry/:entryId` | Read single entry |

### Access Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | `/api/history/:historyId/grant` | Grant full access |
| POST   | `/api/history/:historyId/grant-partial` | Grant partial access |
| POST   | `/api/history/:historyId/revoke-access` | Revoke access |

### Audit

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/api/history/:historyId/audit` | Fetch audit log |

## Project Structure

```
src/
├── index.ts                  # Express server entry
├── config.ts                 # Environment config
├── db/
│   ├── index.ts              # PostgreSQL pool
│   ├── migrate.ts            # Migration runner
│   └── migrations/
│       └── 001_initial.sql   # Schema
├── sui/
│   ├── client.ts             # SuiClient + keypair
│   ├── types.ts              # TypeScript types for Move structs
│   └── transactions.ts       # PTB builders
├── routes/
│   ├── index.ts              # Route aggregator
│   ├── institution.ts
│   ├── patient.ts
│   ├── history.ts
│   ├── access.ts
│   └── audit.ts
├── middleware/
│   ├── auth.ts               # API key auth
│   ├── validate.ts           # Zod validation
│   └── errorHandler.ts       # Error handling
└── utils/
    └── sui-helpers.ts        # Sui utility functions
```

