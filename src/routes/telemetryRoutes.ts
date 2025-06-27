import { Router } from 'express';
import { TelemetryController } from '../controllers/TelemetryController';
import { validateRequest, validateQuery } from '../middleware/validation';
import { telemetrySchemas } from '../utils/validationSchemas';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const telemetryController = new TelemetryController();

// Telemetry ingestion (no auth required for IoT devices)
router.post('/ingest', validateRequest(telemetrySchemas.ingest), telemetryController.ingest);

// Telemetry retrieval endpoints (authenticated)
router.get('/all', authenticateToken, telemetryController.getAllTelemetry);
router.get('/latest', authenticateToken, telemetryController.getLatestTelemetry);
router.get('/user', authenticateToken, validateQuery(telemetrySchemas.userQuery), telemetryController.getUserTelemetry);

// Specific telemetry data endpoints (authenticated)
router.get('/tire-pressure', authenticateToken, telemetryController.getTirePressure);
router.get('/position', authenticateToken, telemetryController.getPosition);
router.get('/speed-info', authenticateToken, telemetryController.getSpeedInfo);
router.get('/battery-voltage', authenticateToken, telemetryController.getBattery);
router.get('/fuel', authenticateToken, telemetryController.getFuelLevel);
router.get('/engine-rpm', authenticateToken, telemetryController.getEngineRpm);
router.get('/engine-oil-temp', authenticateToken, telemetryController.getEngineOilTemp);
router.get('/crash', authenticateToken, telemetryController.getCrashDetection);
router.get('/engine-load', authenticateToken, telemetryController.getEngineLoad);
router.get('/dtc', authenticateToken, telemetryController.getDtc);
router.get('/power-stats', authenticateToken, telemetryController.getPowerStats);
router.get('/mileage', authenticateToken, telemetryController.getTotalMileage);
router.get('/vehicle-health', authenticateToken, telemetryController.getVehicleHealthStatus);
router.get('/car-state', authenticateToken, telemetryController.getCarState);
router.get('/location-history', authenticateToken, telemetryController.getLocationHistory);

export default router; 