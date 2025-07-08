import { Router } from "express";
import { TirePressureController } from "../controllers/TirePressureController";
import { authenticateToken } from "../middleware/auth";

const router = Router();
const tirePressureController = new TirePressureController();

// Get daily tire pressure data
router.get(
  "/:imei/daily", authenticateToken,
  tirePressureController.getDailyTirePressureData.bind(tirePressureController)
);

// Get current tire pressure
router.get(
  "/:imei/current", authenticateToken,
  tirePressureController.getCurrentTirePressure.bind(tirePressureController)
);

// Get tire pressure history
router.get(
  "/:imei/history", authenticateToken,
  tirePressureController.getTirePressureHistory.bind(tirePressureController)
);

// Get tire pressure alert
router.get(
  "/:imei/alert", authenticateToken,
  tirePressureController.getTirePressureAlert.bind(tirePressureController)
);

export default router;