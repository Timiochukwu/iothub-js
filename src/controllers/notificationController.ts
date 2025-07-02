import { Request, Response } from 'express';
import { NotificationService } from '../services/NotificationService';

const notificationService = new NotificationService();

export const getNotifications = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { limit = 20, offset = 0, unreadOnly = false } = req.query;

    const notifications = await notificationService.getUserNotifications(
      userId,
      parseInt(limit as string),
      parseInt(offset as string),
      unreadOnly === 'true'
    );

    const formattedNotifications = notifications.notifications.map(notification => ({
      id: notification.id,
      imei: notification.imei,
      type: notification.type,
      severity: notification.severity,
      title: notification.title,
      message: notification.message,
      timestamp: notification.timestamp,
      date: new Date(notification.timestamp).toLocaleDateString(),
      time: new Date(notification.timestamp).toLocaleTimeString(),
      isRead: notification.isRead,
      metadata: notification.metadata,
      icon: getNotificationIcon(notification.type),
      color: getSeverityColor(notification.severity)
    }));

    res.json({
      success: true,
      data: {
        notifications: formattedNotifications,
        unreadCount: notifications.unreadCount,
        totalCount: notifications.totalCount,
        hasMore: (parseInt(offset as string) + formattedNotifications.length) < notifications.totalCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to fetch notifications'
    });
  }
};

export const markNotificationAsRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.userId;

    if (!id) {
      res.status(400).json({ success: false, message: 'Notification ID is required' });
      return;
    }

    await notificationService.markAsRead(userId, id);

    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to mark notification as read'
    });
  }
};

export const markAllNotificationsAsRead = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    await notificationService.markAllAsRead(userId);

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to mark all notifications as read'
    });
  }
};

export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.userId;

    if (!id) {
      res.status(400).json({ success: false, message: 'Notification ID is required' });
      return;
    }

    await notificationService.deleteNotification(userId, id);

    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to delete notification'
    });
  }
};

export const getNotificationStats = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { days = 7 } = req.query;

    const stats = await notificationService.getNotificationStats(
      userId,
      parseInt(days as string)
    );

    res.json({
      success: true,
      data: {
        period: `${days} days`,
        ...stats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to fetch notification statistics'
    });
  }
};

// Helper functions for UI formatting
function getNotificationIcon(type: string): string {
  const icons = {
    collision: '🚗',
    speed_limit: '⚡',
    fuel_low: '⛽',
    engine_fault: '🔧',
    battery_low: '🔋'
  };
  return icons[type as keyof typeof icons] || '📱';
}

function getSeverityColor(severity: string): string {
  const colors = {
    info: '#3B82F6',
    warning: '#F59E0B',
    critical: '#EF4444'
  };
  return colors[severity as keyof typeof colors] || '#6B7280';
} 