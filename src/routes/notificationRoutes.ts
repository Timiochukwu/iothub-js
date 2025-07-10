import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  getNotifications,
  getNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getNotificationStats,
  getNotificationByType,
} from "../controllers/notificationController";

const notificationRouter = Router();

notificationRouter.get("/", authenticateToken, getNotifications);
notificationRouter.get("/:id", authenticateToken, getNotification);
notificationRouter.put("/:id/read", authenticateToken, markNotificationAsRead);
notificationRouter.put(
  "/read/all",
  authenticateToken,
  markAllNotificationsAsRead
);
notificationRouter.delete("/:id", authenticateToken, deleteNotification);
notificationRouter.get("/stats", authenticateToken, getNotificationStats);
notificationRouter.get("/type/:type", authenticateToken, getNotificationByType);

export { notificationRouter };
