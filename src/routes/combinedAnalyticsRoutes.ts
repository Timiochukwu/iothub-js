import { Router } from "express";
import { CombinedAnalyticsController } from "../controllers/CombinedAnalyticsController";

const router = Router();
const combinedAnalyticsController = new CombinedAnalyticsController();

// Combined analytics endpoints
router.get(
  "/:imei/combined", 
  combinedAnalyticsController.getCombinedAnalytics.bind(combinedAnalyticsController)
);

router.get(
  "/:imei/overview", 
  combinedAnalyticsController.getVehicleOverview.bind(combinedAnalyticsController)
);

router.get(
  "/:imei/summary", 
  combinedAnalyticsController.getAnalyticsSummary.bind(combinedAnalyticsController)
);

export default router;