// src/routes/geofences.ts
import { Router } from 'express';
import { GeofenceController } from '../controllers/GeofenceController';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const geofenceController = new GeofenceController();

// Basic CRUD operations
router.post('/', authenticateToken, geofenceController.createGeofence);
router.get('/', authenticateToken, geofenceController.listGeofences);
router.get('/:id', authenticateToken, geofenceController.getGeofence);
router.put('/:id', authenticateToken, geofenceController.updateGeofence);
router.delete('/:id', authenticateToken, geofenceController.deleteGeofence);

// Advanced operations
router.patch('/:id/toggle', authenticateToken, geofenceController.toggleGeofence);
router.post('/bulk', authenticateToken, geofenceController.bulkOperation);
router.post('/template/:templateId', authenticateToken, geofenceController.createFromTemplate);

// Analytics and reporting
router.get('/stats', authenticateToken, geofenceController.getStats);
router.get('/events', authenticateToken, geofenceController.getEvents);

// Device-specific operations
router.get('/device/:imei', authenticateToken, geofenceController.getDeviceGeofences);

export default router;