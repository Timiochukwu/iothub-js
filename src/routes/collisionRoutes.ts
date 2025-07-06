import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  getRecentCollisions,
  getCollisionStats,
  updateCollisionStatus,
} from "../controllers/collisionController";

const router = Router();

router.get("/", authenticateToken, getRecentCollision);
router.get("/recent", authenticateToken, getRecentCollision);
// router.get("/stats/:imei", authenticateToken, getCollisionStats);
// router.put("/status", authenticateToken, updateCollisionStatus);

export { router as collisionRoutes };
