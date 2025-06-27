import { Router } from "express";
import { DeviceController } from "../controllers/DeviceController";
import { DeviceTypeController } from "../controllers/DeviceTypeController";
import { validateRequest, validateQuery } from "../middleware/validation";
import {
  deviceSchemas,
  deviceTypeSchemas,
  querySchemas,
} from "../utils/validationSchemas";
import { authenticateToken, AdminAuth } from "../middleware/auth";

const router = Router();
const deviceController = new DeviceController();
const deviceTypeController = new DeviceTypeController();

/**
 * @swagger
 * tags:
 *   name: Devices
 *   description: Device management and registration
 */

/**
 * @swagger
 * /api/devices:
 *   get:
 *     summary: Get all devices for the authenticated user
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of devices
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Register a new device
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               imei:
 *                 type: string
 *               vehicleInfo:
 *                 type: object
 *                 properties:
 *                   make:
 *                     type: string
 *                   model:
 *                     type: string
 *                   year:
 *                     type: integer
 *                   vin:
 *                     type: string
 *     responses:
 *       201:
 *         description: Device registered
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */

//Device Type
// Device type routes (authenticated)
router.get("/types", deviceTypeController.listDeviceTypes);
router.get("/types/:typeId", AdminAuth, deviceTypeController.getDeviceTypeById);
router.put(
  "/types/:typeId",
  AdminAuth,
  validateRequest(deviceTypeSchemas.update),
  deviceTypeController.updateDeviceType
);

router.post(
  "/types",
  AdminAuth,
  validateRequest(deviceTypeSchemas.create),
  deviceTypeController.createDeviceType
);

// Device routes (matching Java implementation)
router.post(
  "/register",
  authenticateToken,
  validateRequest(deviceSchemas.register),
  deviceController.register
);
router.get("/", authenticateToken, deviceController.listDevices);
router.post(
  "/switch",
  authenticateToken,
  validateRequest(deviceSchemas.switch),
  deviceController.switchDevice
);
router.get("/active", authenticateToken, deviceController.getActiveDevice);

// Device management routes (authenticated)
router.put(
  "/:deviceId",
  authenticateToken,
  validateRequest(deviceSchemas.update),
  deviceController.updateDevice
);
router.delete("/:deviceId", authenticateToken, deviceController.deleteDevice);

// Device routes (by email - for compatibility with existing API)
router.get(
  "/by-email",
  validateQuery(querySchemas.email),
  deviceController.getDevicesByEmail
);
router.get("/imei/:imei", deviceController.getDeviceByImei);

router.get('/:imei/vin', authenticateToken, deviceController.getDeviceVin);

router.post('/:imei/vehicle-info', authenticateToken, deviceController.submitVehicleInfo);

router.get('/:imei', authenticateToken, deviceController.getDeviceByImei);

export default router;
