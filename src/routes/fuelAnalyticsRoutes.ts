import { Router } from "express";
import { FuelAnalyticsController } from "../controllers/FuelAnalyticsController";

const router = Router();
const fuelAnalyticsController = new FuelAnalyticsController();
import { authenticateToken } from "../middleware/auth";


// Get fuel analytics report
router.get(
  "/:imei/analytics", authenticateToken,
  fuelAnalyticsController.getFuelAnalytics.bind(fuelAnalyticsController)
);

// Get daily fuel bar chart data
router.get(
  "/:imei/bar-chart", authenticateToken,
  fuelAnalyticsController.getDailyFuelBarChart.bind(fuelAnalyticsController)
);

// Get current fuel level
router.get(
  "/:imei/current", authenticateToken,
  fuelAnalyticsController.getCurrentFuelLevel.bind(fuelAnalyticsController)
);

export default router;