import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import analyticsController from "../controllers/analyticsController";

const router = Router();

router.get(
  "/speed/:imei",
  authenticateToken,
  analyticsController.getSpeedHistory
);
router.get(
  "/fuel/:imei",
  authenticateToken,
  analyticsController.getDailyFuelConsumption
);

export default router;
