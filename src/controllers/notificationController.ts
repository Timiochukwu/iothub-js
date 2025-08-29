import { Notification } from "../models/Notification";
import { Request, Response } from "express";
import { NotificationService } from "../services/NotificationService";

// Initialize notification service
const notificationService = new NotificationService();

export const getNotifications = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const limit = 10;
    const { page = 1 } = (req as any).query;
    const notifications = await Notification.find({ user: userId })
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();

    res.json({
      success: true,
      notifications,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to fetch notifications",
    });
  }
};

export const getNotification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.userId;

    if (!id) {
      res
        .status(400)
        .json({ success: false, message: "Notification ID is required" });
      return;
    }

    const notification = await Notification.findOne({
      _id: id,
      user: userId,
    })
      .select("message type read timestamp")
      .exec();

    if (!notification) {
      res
        .status(404)
        .json({ success: false, message: "Notification not found" });
      return;
    }

    res.json({
      success: true,
      data: notification,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to fetch notification",
    });
  }
};

export const markNotificationAsRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.userId;

    if (!id) {
      res
        .status(400)
        .json({ success: false, message: "Notification ID is required" });
      return;
    }

    await Notification.updateOne({ _id: id, user: userId }, { read: true });

    res.json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to mark notification as read",
    });
  }
};

export const bulkMarkNotificationsAsRead = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { notificationIds } = req.body;

    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      res.status(400).json({ 
        success: false, 
        message: "Notification IDs array is required and must not be empty" 
      });
      return;
    }

    // For MongoDB implementation
    const result = await Notification.updateMany(
      { 
        _id: { $in: notificationIds }, 
        user: userId 
      }, 
      { read: true }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      data: {
        updatedCount: result.modifiedCount,
        requestedCount: notificationIds.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to bulk mark notifications as read",
    });
  }
};

export const markAllNotificationsAsRead = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = (req as any).user.userId;
    await Notification.updateMany({ user: userId }, { read: true });

    res.json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to mark all notifications as read",
    });
  }
};

export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.userId;

    if (!id) {
      res
        .status(400)
        .json({ success: false, message: "Notification ID is required" });
      return;
    }

    const result = await Notification.deleteOne({ _id: id, user: userId });

    if (result.deletedCount === 0) {
      res
        .status(404)
        .json({ success: false, message: "Notification not found" });
      return;
    }

    res.json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to delete notification",
    });
  }
};

export const bulkDeleteNotifications = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { notificationIds } = req.body;

    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      res.status(400).json({ 
        success: false, 
        message: "Notification IDs array is required and must not be empty" 
      });
      return;
    }

    // For MongoDB implementation
    const result = await Notification.deleteMany({
      _id: { $in: notificationIds },
      user: userId
    });

    res.json({
      success: true,
      message: `${result.deletedCount} notifications deleted successfully`,
      data: {
        deletedCount: result.deletedCount,
        requestedCount: notificationIds.length,
        notFoundCount: notificationIds.length - result.deletedCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to bulk delete notifications",
    });
  }
};

export const deleteAllNotifications = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    
    const result = await Notification.deleteMany({ user: userId });

    res.json({
      success: true,
      message: `All ${result.deletedCount} notifications deleted successfully`,
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to delete all notifications",
    });
  }
};

export const deleteNotificationsByType = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { type } = req.params;

    if (!type) {
      res.status(400).json({
        success: false,
        message: "Notification type is required",
      });
      return;
    }

    const result = await Notification.deleteMany({
      user: userId,
      type: type
    });

    res.json({
      success: true,
      message: `${result.deletedCount} notifications of type '${type}' deleted successfully`,
      data: {
        deletedCount: result.deletedCount,
        type: type
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to delete notifications by type",
    });
  }
};

export const deleteNotificationsBySeverity = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { severity } = req.params;

    if (!severity) {
      res.status(400).json({
        success: false,
        message: "Notification severity is required",
      });
      return;
    }

    const result = await Notification.deleteMany({
      user: userId,
      severity: severity
    });

    res.json({
      success: true,
      message: `${result.deletedCount} notifications of severity '${severity}' deleted successfully`,
      data: {
        deletedCount: result.deletedCount,
        severity: severity
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to delete notifications by severity",
    });
  }
};

export const deleteOldNotifications = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { days } = req.body;

    if (!days || isNaN(days) || days <= 0) {
      res.status(400).json({
        success: false,
        message: "Valid number of days is required",
      });
      return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await Notification.deleteMany({
      user: userId,
      timestamp: { $lt: cutoffDate.getTime() }
    });

    res.json({
      success: true,
      message: `${result.deletedCount} notifications older than ${days} days deleted successfully`,
      data: {
        deletedCount: result.deletedCount,
        cutoffDate: cutoffDate.toISOString(),
        days: days
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to delete old notifications",
    });
  }
};

export const getNotificationStats = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const totalNotifications = await Notification.countDocuments({
      user: userId,
    });
    const unreadNotifications = await Notification.countDocuments({
      user: userId,
      read: false,
    });

    res.json({
      success: true,
      stats: {
        totalNotifications,
        unreadNotifications,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to fetch notification stats",
    });
  }
};

export const getNotificationByType = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { type } = req.params;

    if (!type) {
      res.status(400).json({
        success: false,
        message: "Notification type is required",
      });
      return;
    }

    const notifications = await Notification.find({
      user: userId,
      type,
    })
      .sort({ timestamp: -1 })
      .exec();

    if (notifications.length === 0) {
      res.status(404).json({
        success: false,
        message: "No notifications found for this type",
      });
      return;
    }

    res.json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to fetch notifications",
    });
  }
};