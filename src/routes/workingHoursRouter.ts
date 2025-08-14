// src/routes/workingHoursRoutes.ts
import { Router } from "express";
import { WorkingHoursController } from "../controllers/WorkingHoursController";
import { authenticateToken } from "../middleware/auth";

const workingHoursRouter = Router();

workingHoursRouter.post("/", authenticateToken, async (req, res) => {
  await WorkingHoursController.create(req, res);
});

workingHoursRouter.get("/", authenticateToken, async (req, res) => {
  await WorkingHoursController.getAll(req, res);
});

workingHoursRouter.put("/:id/status", authenticateToken, async (req, res) => {
  await WorkingHoursController.updateStatus(req, res);
});

workingHoursRouter.put("/:imei", authenticateToken, async (req, res) => {
  await WorkingHoursController.update(req, res);
});

workingHoursRouter.delete("/:id", authenticateToken, async (req, res) => {
  await WorkingHoursController.delete(req, res);
});

workingHoursRouter.get("/:imei", authenticateToken, async (req, res) => {
  await WorkingHoursController.getByImei(req, res);
});


// // Working hour alert endpoints
// workingHoursRouter.post(
//   "/working-hour-alerts",
//   authenticateToken,
//   async (req, res) => {
//     await WorkingHoursController.createAlert(req, res);
//   }
// );
// workingHoursRouter.get(
//   "/working-hour-alerts",
//   authenticateToken,
//   async (req, res) => {
//     await WorkingHoursController.getAlerts(req, res);
//   }
// );
// workingHoursRouter.patch(
//   "/working-hour-alerts/:id/status",
//   authenticateToken,
//   async (req, res) => {
//     await WorkingHoursController.updateAlertStatus(req, res);
//   }
// );
// workingHoursRouter.delete(
//   "/working-hour-alerts/:id",
//   authenticateToken,
//   async (req, res) => {
//     await WorkingHoursController.deleteAlert(req, res);
//   }
// );
// workingHoursRouter.get(
//   "/working-hour-alerts/:id/violations",
//   authenticateToken,
//   async (req, res) => {
//     await WorkingHoursController.getAlertViolations(req, res);
//   }
// );
// workingHoursRouter.post(
//   "/working-hour-alerts/:deviceId/check-violations",
//   authenticateToken,
//   async (req, res) => {
//     await WorkingHoursController.checkViolationsForDevice(req, res);
//   }
// );

// // Filtered working hours
// workingHoursRouter.get(
//   "/filtered-working-hours",
//   authenticateToken,
//   async (req, res) => {
//     await WorkingHoursController.getFilteredWorkingHours(req, res);
//   }
// );

export default workingHoursRouter;
