import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import analyticsController from "../controllers/analyticsController";

const router = Router();

router.get(
  "/:imei",
  authenticateToken,
  analyticsController.getCombinedAnalyticsReport
);
router.get(
  "/fuel/:imei",
  authenticateToken,
  analyticsController.getDailyFuelConsumption
);

export default router;
