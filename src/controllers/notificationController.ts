import { Notification } from "../models/Notification";
import { Request, Response } from "express";

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

    await Notification.deleteOne({ _id: id, user: userId });

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
