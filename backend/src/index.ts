/**
 * Entry point for the Medical History System Backend API.
 *
 * This Express server exposes REST endpoints that wrap the Sui Move
 * smart contracts, with PostgreSQL for off-chain data.
 *
 * DESIGN TRADEOFF (explicit for the report):
 *   The backend holds a Sui keypair and signs transactions itself.
 *   In production, the same Programmable Transaction Blocks (PTBs)
 *   should be constructed here but signed client-side via Sui Wallet.
 *   See sui/client.ts for the full discussion.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config, validateConfig } from './config';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';

// Validate critical configuration at startup
validateConfig();

const app = express();

// ─── Middleware ─────────────────────────────────────────────

app.use(helmet());
app.use(cors());
app.use(morgan('short'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ────────────────────────────────────────────────

app.use('/api', routes);

// ─── Error handling ────────────────────────────────────────

app.use(errorHandler);

// ─── Start server ──────────────────────────────────────────

app.listen(config.PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════════════╗
  ║   Medical History System — Backend API                  ║
  ║   Running on port ${String(config.PORT).padEnd(37)}║
  ║   Network: ${config.SUI_NETWORK.padEnd(45)}║
  ║   Package: ${(config.PACKAGE_ID || 'NOT SET').padEnd(45)}║
  ╚══════════════════════════════════════════════════════════╝
  `);
});

export default app;

