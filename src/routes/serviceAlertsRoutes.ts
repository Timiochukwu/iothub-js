import { Router } from "express";
import { ServiceAlertsController } from "../controllers/ServiceAlertsController";
import { authenticateToken } from "../middleware/auth";

const router = Router();
const serviceAlertsController = new ServiceAlertsController();

// Apply authentication middleware to all routes
router.use(authenticateToken);

/**
 * @swagger
 * /api/service-alerts/summary/{imei}:
 *   get:
 *     summary: Get service alerts summary
 *     tags: [Service Alerts]
 *     parameters:
 *       - in: path
 *         name: imei
 *         required: true
 *         schema:
 *           type: string
 *         description: Device IMEI
 *     responses:
 *       200:
 *         description: Service alerts summary retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalFaults:
 *                       type: number
 *                     critical:
 *                       type: number
 *                     warning:
 *                       type: number
 *                     info:
 *                       type: number
 */
router.get("/summary/:imei", serviceAlertsController.getServiceAlertsSummary);

/**
 * @swagger
 * /api/service-alerts/recent/{imei}:
 *   get:
 *     summary: Get recent alerts
 *     tags: [Service Alerts]
 *     parameters:
 *       - in: path
 *         name: imei
 *         required: true
 *         schema:
 *           type: string
 *         description: Device IMEI
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [All, DTC, Battery, Fuel, Engine, Tire, Safety]
 *         description: Filter alerts by type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Maximum number of alerts to return
 *     responses:
 *       200:
 *         description: Recent alerts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 alerts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       type:
 *                         type: string
 *                       severity:
 *                         type: string
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
 *                       detectedTime:
 *                         type: string
 *                         format: date-time
 *                       value:
 *                         type: number
 *                       unit:
 *                         type: string
 */
router.get("/recent/:imei", serviceAlertsController.getRecentAlerts);

/**
 * @swagger
 * /api/service-alerts/by-type/{imei}/{type}:
 *   get:
 *     summary: Get alerts by specific type
 *     tags: [Service Alerts]
 *     parameters:
 *       - in: path
 *         name: imei
 *         required: true
 *         schema:
 *           type: string
 *         description: Device IMEI
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [DTC, Battery, Fuel, Engine, Tire, Safety]
 *         description: Alert type to filter by
 *     responses:
 *       200:
 *         description: Alerts by type retrieved successfully
 */
router.get("/by-type/:imei/:type", serviceAlertsController.getAlertsByType);

/**
 * @swagger
 * /api/service-alerts/detail/{imei}/{alertId}:
 *   get:
 *     summary: Get specific alert details
 *     tags: [Service Alerts]
 *     parameters:
 *       - in: path
 *         name: imei
 *         required: true
 *         schema:
 *           type: string
 *         description: Device IMEI
 *       - in: path
 *         name: alertId
 *         required: true
 *         schema:
 *           type: string
 *         description: Alert ID
 *     responses:
 *       200:
 *         description: Alert details retrieved successfully
 *       404:
 *         description: Alert not found
 */
router.get("/detail/:imei/:alertId", serviceAlertsController.getAlertDetails);

/**
 * @swagger
 * /api/service-alerts/statistics/{imei}:
 *   get:
 *     summary: Get alert statistics for dashboard
 *     tags: [Service Alerts]
 *     parameters:
 *       - in: path
 *         name: imei
 *         required: true
 *         schema:
 *           type: string
 *         description: Device IMEI
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *         description: Number of days to include in statistics
 *     responses:
 *       200:
 *         description: Alert statistics retrieved successfully
 */
router.get("/statistics/:imei", serviceAlertsController.getAlertStatistics);

/**
 * @swagger
 * /api/service-alerts/dashboard/{imei}:
 *   get:
 *     summary: Get combined dashboard data
 *     tags: [Service Alerts]
 *     parameters:
 *       - in: path
 *         name: imei
 *         required: true
 *         schema:
 *           type: string
 *         description: Device IMEI
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
 */
router.get("/dashboard/:imei", serviceAlertsController.getDashboardData);

router.get("/debug/:imei", serviceAlertsController.debugTelemetryData);

export default router;