import { Router } from 'express';
import { RealTimeController } from '../controllers/RealTimeController';
import { RealTimeService } from '../services/RealTimeService';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Note: RealTimeService instance will be injected from main app
let realTimeController: RealTimeController;

// Initialize controller with service instance
export const initializeRealTimeRoutes = (realTimeService: RealTimeService) => {
  realTimeController = new RealTimeController(realTimeService);
};

// GET /api/realtime/connections - Get all active connections (Admin only)
router.get('/connections', authenticateToken, (req, res) => {
  realTimeController.getConnections(req, res);
});

// GET /api/realtime/devices - Get connected devices
router.get('/devices', authenticateToken, (req, res) => {
  realTimeController.getConnectedDevices(req, res);
});

// GET /api/realtime/users - Get connected users
router.get('/users', authenticateToken, (req, res) => {
  realTimeController.getConnectedUsers(req, res);
});

// POST /api/realtime/broadcast - Broadcast message to all connected clients (Admin only)
router.post('/broadcast', authenticateToken, (req, res) => {
  realTimeController.broadcastMessage(req, res);
});

// POST /api/realtime/device/:imei - Send message to specific device
router.post('/device/:imei', authenticateToken, (req, res) => {
  realTimeController.sendToDevice(req, res);
});

// POST /api/realtime/user/:email - Send message to specific user
router.post('/user/:email', authenticateToken, (req, res) => {
  realTimeController.sendToUser(req, res);
});

export default router; 