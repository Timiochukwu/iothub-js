import { Router } from "express";
import { SpeedAnalyticsController } from "../controllers/SpeedAnalyticsController";

const router = Router();
const speedAnalyticsController = new SpeedAnalyticsController();

// Get speed analytics report
router.get(
  "/:imei/current",
  speedAnalyticsController.getCurrentSpeedData.bind(speedAnalyticsController)
);

// Get current speed status
router.get(
  "/:imei",
  speedAnalyticsController.getSpeedReport.bind(speedAnalyticsController)
);

export default router;
