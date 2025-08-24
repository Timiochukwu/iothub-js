import { Router } from "express";
import { FuelAnalyticsController } from "../controllers/FuelAnalyticsController";

const router = Router();
const fuelAnalyticsController = new FuelAnalyticsController();

/**
 * Primary Endpoints (matches your dashboard exactly)
 */

// Endpoint A: Fuel Consumption Chart (Refueled vs Consumed)
// GET /api/fuel/:imei/consumption-chart?startDate=2025-08-01&endDate=2025-08-31&type=daily
router.get(
  "/:imei/consumption-chart",
  fuelAnalyticsController.getFuelConsumptionChart.bind(fuelAnalyticsController)
);

// Endpoint B: Current Fuel Summary (Starting fuel, ending fuel, distance, estimated used)
// GET /api/fuel/:imei/current-summary
router.get(
  "/:imei/current-summary",
  fuelAnalyticsController.getCurrentFuelSummary.bind(fuelAnalyticsController)
);

/**
 * Additional Endpoints
 */

// Debug endpoint for fuel events
// GET /api/fuel/:imei/events?startDate=2025-08-01&endDate=2025-08-31
router.get(
  "/:imei/events",
  fuelAnalyticsController.getFuelEvents.bind(fuelAnalyticsController)
);

/**
 * Legacy Endpoints (backward compatibility)
 */

// Legacy: GET /api/fuel/:imei/analytics (deprecated)
router.get(
  "/:imei/analytics",
  fuelAnalyticsController.getFuelAnalytics.bind(fuelAnalyticsController)
);

// Legacy: GET /api/fuel/:imei/current-level (deprecated)
router.get(
  "/:imei/current-level",
  fuelAnalyticsController.getCurrentFuelLevel.bind(fuelAnalyticsController)
);

export default router;

/**
 * Usage Examples:
 * 
 * 1. Get fuel consumption chart for last 7 days:
 * GET /api/fuel/353691843198101/consumption-chart?startDate=2025-08-17&endDate=2025-08-24&type=daily
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "date": "2025-08-17",
 *       "refueled": 35.5,
 *       "consumed": 12.3,
 *       "dayLabel": "Sat"
 *     },
 *     {
 *       "date": "2025-08-18",
 *       "refueled": 0,
 *       "consumed": 8.7,
 *       "dayLabel": "Sun"
 *     }
 *   ]
 * }
 * 
 * 2. Get current fuel summary:
 * GET /api/fuel/353691843198101/current-summary
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "vehicleInfo": {
 *       "vehicleId": "JTHBK1GG4F2202458",
 *       "imei": "353691843198101",
 *       "status": "Active",
 *       "lastUpdated": "2025-08-10T11:26:46.000Z"
 *     },
 *     "dailyUsage": {
 *       "startingFuel": "68%",
 *       "endingFuel": "44%",
 *       "distanceDriven": "0km",
 *       "estimatedUsed": "0.0%"
 *     },
 *     "currentStatus": {
 *       "fuelLevel": "44%",
 *       "fuelLevelStatus": "Good",
 *       "totalOdometer": "176844km",
 *       "fuelType": "Unknown"
 *     }
 *   }
 * }
 */