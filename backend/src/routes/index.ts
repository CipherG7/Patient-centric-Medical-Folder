/**
 * Route aggregator.
 * Mounts all sub-routers under their respective prefixes.
 */

import { Router } from 'express';
import institutionRoutes from './institution';
import patientRoutes from './patient';
import historyRoutes from './history';
import accessRoutes from './access';
import auditRoutes from './audit';
import documentRoutes from './documents';

const router = Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'medical-history-backend',
  });
});

// Mount routes
router.use('/institutions', institutionRoutes);
router.use('/patients', patientRoutes);
router.use('/history', historyRoutes);
router.use('/history', accessRoutes);
router.use('/history', auditRoutes);
router.use('/documents', documentRoutes);

export default router;

