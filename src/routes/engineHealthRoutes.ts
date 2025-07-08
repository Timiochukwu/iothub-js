import { Router } from "express";
import { EngineHealthController } from "../controllers/EngineHealthController";

const router = Router();
const engineHealthController = new EngineHealthController();
import { authenticateToken } from "../middleware/auth";

// Get engine health data
router.get(
  "/:imei/health", authenticateToken,
  engineHealthController.getEngineHealth.bind(engineHealthController)
);

// Get current engine status
router.get(
  "/:imei/status", authenticateToken,
  engineHealthController.getCurrentEngineStatus.bind(engineHealthController)
);

// Get active fault codes
router.get(
  "/:imei/faults", authenticateToken,
  engineHealthController.getActiveFaults.bind(engineHealthController)
);

// Get comprehensive engine health summary
router.get(
  "/:imei/summary", authenticateToken,
  engineHealthController.getEngineHealthSummary.bind(engineHealthController)
);

export default router;