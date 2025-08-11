import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  getRecentCollisions,
  getRecentCollision,
  toggleCollisionStatus,
} from "../controllers/collisionController";

const router = Router();

router.get("/", authenticateToken, getRecentCollisions);
router.get("/recent", authenticateToken, getRecentCollision);
router.post("/toggle/:deviceId/", authenticateToken, toggleCollisionStatus);
// router.get("/stats/:imei", authenticateToken, getCollisionStats);
// router.put("/status", authenticateToken, updateCollisionStatus);

export { router as collisionRoutes };
