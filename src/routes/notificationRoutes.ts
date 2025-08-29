import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  getNotifications,
  getNotification,
  markNotificationAsRead,
  bulkMarkNotificationsAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  bulkDeleteNotifications,
  deleteAllNotifications,
  deleteNotificationsByType,
  deleteNotificationsBySeverity,
  deleteOldNotifications,
  getNotificationStats,
  getNotificationByType,
} from "../controllers/notificationController";

const notificationRouter = Router();

// GET routes
notificationRouter.get("/", authenticateToken, getNotifications);
notificationRouter.get("/stats", authenticateToken, getNotificationStats);
notificationRouter.get("/type/:type", authenticateToken, getNotificationByType);
notificationRouter.get("/:id", authenticateToken, getNotification);

// PUT routes (Mark as read)
notificationRouter.put("/:id/read", authenticateToken, markNotificationAsRead);
notificationRouter.put("/bulk/read", authenticateToken, bulkMarkNotificationsAsRead);
notificationRouter.put("/read/all", authenticateToken, markAllNotificationsAsRead);

// DELETE routes (Single delete)
notificationRouter.delete("/:id", authenticateToken, deleteNotification);

// DELETE routes (Bulk operations)
notificationRouter.delete("/bulk/delete", authenticateToken, bulkDeleteNotifications);
notificationRouter.delete("/all", authenticateToken, deleteAllNotifications);
notificationRouter.delete("/type/:type", authenticateToken, deleteNotificationsByType);
notificationRouter.delete("/severity/:severity", authenticateToken, deleteNotificationsBySeverity);
notificationRouter.delete("/old", authenticateToken, deleteOldNotifications);

export { notificationRouter };