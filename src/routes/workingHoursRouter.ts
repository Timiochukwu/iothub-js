// src/routes/workingHoursRoutes.ts
import { Router } from "express";
import { WorkingHoursController } from "../controllers/WorkingHoursController";
import { authenticateToken } from "../middleware/auth";
// import { validateRequest } from "../middleware/validation"; // Uncomment if you add validation

const workingHoursRouter = Router();

workingHoursRouter.post("/working-hours", authenticateToken, async (req, res) => { await WorkingHoursController.create(req, res); });
workingHoursRouter.get("/working-hours", authenticateToken, async (req, res) => { await WorkingHoursController.getAll(req, res); });
workingHoursRouter.delete("/working-hours/:id", authenticateToken, async (req, res) => { await WorkingHoursController.delete(req, res); });

// Working hour alert endpoints
workingHoursRouter.post("/working-hour-alerts", authenticateToken, async (req, res) => { await WorkingHoursController.createAlert(req, res); });
workingHoursRouter.get("/working-hour-alerts", authenticateToken, async (req, res) => { await WorkingHoursController.getAlerts(req, res); });
workingHoursRouter.patch("/working-hour-alerts/:id/status", authenticateToken, async (req, res) => { await WorkingHoursController.updateAlertStatus(req, res); });
workingHoursRouter.delete("/working-hour-alerts/:id", authenticateToken, async (req, res) => { await WorkingHoursController.deleteAlert(req, res); });

// Filtered working hours
workingHoursRouter.get("/filtered-working-hours", authenticateToken, async (req, res) => { await WorkingHoursController.getFilteredWorkingHours(req, res); });

export default workingHoursRouter;