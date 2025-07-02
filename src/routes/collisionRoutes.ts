import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getRecentCollisions,
  getCollisionStats,
  updateCollisionStatus
} from '../controllers/collisionController';

const router = Router();

router.get('/recent/:imei', authenticateToken, getRecentCollisions);
router.get('/stats/:imei', authenticateToken, getCollisionStats);
router.put('/status', authenticateToken, updateCollisionStatus);

export { router as collisionRoutes }; 