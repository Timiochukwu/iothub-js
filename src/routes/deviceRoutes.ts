import { Router } from 'express';
import { DeviceController } from '../controllers/DeviceController';
import { validateRequest, validateQuery } from '../middleware/validation';
import { deviceSchemas, querySchemas } from '../utils/validationSchemas';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const deviceController = new DeviceController();

// Device management routes (authenticated)
router.post('/register', authenticateToken, validateRequest(deviceSchemas.register), deviceController.registerDevice);
router.get('/', authenticateToken, deviceController.getUserDevices);
router.post('/switch', authenticateToken, validateRequest(deviceSchemas.switch), deviceController.switchActiveDevice);
router.get('/active', authenticateToken, deviceController.getActiveDevice);
router.put('/:deviceId', authenticateToken, validateRequest(deviceSchemas.update), deviceController.updateDevice);
router.delete('/:deviceId', authenticateToken, deviceController.deleteDevice);

// Device routes (by email - for compatibility with existing API)
router.get('/by-email', validateQuery(querySchemas.email), deviceController.getDevicesByEmail);
router.get('/active-by-email', validateQuery(querySchemas.email), deviceController.getActiveDeviceByEmail);
router.get('/imei/:imei', deviceController.getDeviceByImei);

export default router; 
 