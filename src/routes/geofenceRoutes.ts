import { Router } from 'express';
import { GeofenceController } from '../controllers/GeofenceController';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const geofenceController = new GeofenceController();

// Create geofence
router.post('/', authenticateToken, geofenceController.createGeofence);
// List geofences
router.get('/', authenticateToken, geofenceController.listGeofences);
// Delete geofence
router.delete('/:id', authenticateToken, geofenceController.deleteGeofence);

export default router; 