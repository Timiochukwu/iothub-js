import { Router } from "express";
import { BatteryAnalyticsController } from "../controllers/BatteryAnalyticsController";

const router = Router();
const batteryAnalyticsController = new BatteryAnalyticsController();

import { authenticateToken } from "../middleware/auth";

// Get battery analytics report
router.get(
  "/:imei/analytics", authenticateToken,
  batteryAnalyticsController.getBatteryAnalytics.bind(batteryAnalyticsController)
);

// Get current battery status
router.get(
  "/:imei/current", authenticateToken,
  batteryAnalyticsController.getCurrentBatteryStatus.bind(batteryAnalyticsController)
);

// Get battery health analysis
router.get(
  "/:imei/health", authenticateToken,
  batteryAnalyticsController.getBatteryHealth.bind(batteryAnalyticsController)
);

export default router;