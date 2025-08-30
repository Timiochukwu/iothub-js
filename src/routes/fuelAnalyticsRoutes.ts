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
