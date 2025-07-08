import { Router } from "express";
import { SpeedAnalyticsController } from "../controllers/SpeedAlertController";

const router = Router();
const speedAnalyticsController = new SpeedAnalyticsController();

// Get speed analytics report
router.get(
  "/:imei/analytics", 
  speedAnalyticsController.getSpeedAnalytics.bind(speedAnalyticsController)
);

// Get current speed status
router.get(
  "/:imei/current", 
  speedAnalyticsController.getCurrentSpeedStatus.bind(speedAnalyticsController)
);

// Get speed summary
router.get(
  "/:imei/summary", 
  speedAnalyticsController.getSpeedSummary.bind(speedAnalyticsController)
);

export default router;