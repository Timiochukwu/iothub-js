// NotificationService.ts
import { CollisionEvent, CollisionAlert } from "./CollisionDetectionService";
import { Device } from "../models/Device";
import { User } from "../models/User"; // Assuming you have a User model

export interface NotificationPayload {
  id: string;
  userId: string;
  imei: string;
  type: 'collision' | 'speed_limit' | 'fuel_low' | 'engine_fault' | 'battery_low';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: number;
  isRead: boolean;
  metadata: {
    location?: string;
    speed?: number;
    fuelLevel?: number;
    voltage?: number;
    collisionId?: string;
    [key: string]: any;
  };
}

export interface NotificationHistory {
  notifications: NotificationPayload[];
  unreadCount: number;
  totalCount: number;
}

export class NotificationService {
  private notifications: Map<string, NotificationPayload[]> = new Map(); // userId -> notifications[]
  private maxNotificationsPerUser = 100;

  /**
   * Create collision notification from collision event
   */
  async createCollisionNotification(
    collisionEvent: CollisionEvent,
    userId: string
  ): Promise<NotificationPayload> {
    const notification: NotificationPayload = {
      id: `notif_${collisionEvent.id}`,
      userId,
      imei: collisionEvent.imei,
      type: 'collision',
      severity: this.mapCollisionSeverity(collisionEvent.severity),
      title: this.getCollisionTitle(collisionEvent.severity),
      message: this.getCollisionMessage(collisionEvent),
      timestamp: collisionEvent.timestamp,
      isRead: false,
      metadata: {
        location: collisionEvent.location.address || collisionEvent.location.latlng,
        speed: collisionEvent.vehicleInfo.speed,
        collisionId: collisionEvent.id,
        gForce: Math.sqrt(
          Math.pow(collisionEvent.accelerometerData.x, 2) +
          Math.pow(collisionEvent.accelerometerData.y, 2) +
          Math.pow(collisionEvent.accelerometerData.z, 2)
        ) / 10
      }
    };

    await this.storeNotification(userId, notification);
    return notification;
  }

  /**
   * Create speed limit notification
   */
  async createSpeedLimitNotification(
    imei: string,
    userId: string,
    speed: number,
    speedLimit: number,
    location: string
  ): Promise<NotificationPayload> {
    const notification: NotificationPayload = {
      id: `speed_${imei}_${Date.now()}`,
      userId,
      imei,
      type: 'speed_limit',
      severity: speed > speedLimit * 1.5 ? 'critical' : 'warning',
      title: 'Speed Limit Exceeded',
      message: `Vehicle exceeded speed limit at ${location}`,
      timestamp: Date.now(),
      isRead: false,
      metadata: {
        location,
        speed,
        speedLimit,
        excess: speed - speedLimit
      }
    };

    await this.storeNotification(userId, notification);
    return notification;
  }

  /**
   * Create fuel level notification
   */
  async createFuelLowNotification(
    imei: string,
    userId: string,
    fuelLevel: number,
    location: string
  ): Promise<NotificationPayload> {
    const notification: NotificationPayload = {
      id: `fuel_${imei}_${Date.now()}`,
      userId,
      imei,
      type: 'fuel_low',
      severity: fuelLevel < 10 ? 'critical' : 'warning',
      title: 'Low Fuel Level Detected',
      message: `Fuel level is ${fuelLevel}% remaining at ${location}`,
      timestamp: Date.now(),
      isRead: false,
      metadata: {
        location,
        fuelLevel
      }
    };

    await this.storeNotification(userId, notification);
    return notification;
  }

  /**
   * Create engine fault notification
   */
  async createEngineFaultNotification(
    imei: string,
    userId: string,
    faultCode: string,
    location: string
  ): Promise<NotificationPayload> {
    const notification: NotificationPayload = {
      id: `engine_${imei}_${Date.now()}`,
      userId,
      imei,
      type: 'engine_fault',
      severity: 'warning',
      title: 'Engine Fault Detected',
      message: `Engine fault detected at ${location}`,
      timestamp: Date.now(),
      isRead: false,
      metadata: {
        location,
        faultCode
      }
    };

    await this.storeNotification(userId, notification);
    return notification;
  }

  /**
   * Create battery low notification
   */
  async createBatteryLowNotification(
    imei: string,
    userId: string,
    voltage: number,
    location: string
  ): Promise<NotificationPayload> {
    const notification: NotificationPayload = {
      id: `battery_${imei}_${Date.now()}`,
      userId,
      imei,
      type: 'battery_low',
      severity: voltage < 11 ? 'critical' : 'warning',
      title: 'Low Battery Voltage Detected',
      message: `Battery voltage is ${voltage}V at ${location}`,
      timestamp: Date.now(),
      isRead: false,
      metadata: {
        location,
        voltage
      }
    };

    await this.storeNotification(userId, notification);
    return notification;
  }

  /**
   * Get user notifications with pagination
   */
  async getUserNotifications(
    userId: string,
    limit: number = 20,
    offset: number = 0,
    unreadOnly: boolean = false
  ): Promise<NotificationHistory> {
    const userNotifications = this.notifications.get(userId) || [];
    
    let filteredNotifications = unreadOnly 
      ? userNotifications.filter(n => !n.isRead)
      : userNotifications;

    // Sort by timestamp (newest first)
    filteredNotifications.sort((a, b) => b.timestamp - a.timestamp);

    const paginatedNotifications = filteredNotifications.slice(offset, offset + limit);
    const unreadCount = userNotifications.filter(n => !n.isRead).length;

    return {
      notifications: paginatedNotifications,
      unreadCount,
      totalCount: filteredNotifications.length
    };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(userId: string, notificationId: string): Promise<void> {
    const userNotifications = this.notifications.get(userId) || [];
    const notification = userNotifications.find(n => n.id === notificationId);
    
    if (notification) {
      notification.isRead = true;
      console.log(`Notification ${notificationId} marked as read for user ${userId}`);
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string): Promise<void> {
    const userNotifications = this.notifications.get(userId) || [];
    userNotifications.forEach(notification => {
      notification.isRead = true;
    });
    console.log(`All notifications marked as read for user ${userId}`);
  }

  /**
   * Delete notification
   */
  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    const userNotifications = this.notifications.get(userId) || [];
    const index = userNotifications.findIndex(n => n.id === notificationId);
    
    if (index !== -1) {
      userNotifications.splice(index, 1);
      console.log(`Notification ${notificationId} deleted for user ${userId}`);
    }
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(userId: string, days: number = 7): Promise<{
    total: number;
    unread: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    byDay: Array<{ date: string; count: number }>;
  }> {
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    const userNotifications = (this.notifications.get(userId) || [])
      .filter(n => n.timestamp >= cutoffTime);

    const byType = userNotifications.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const bySeverity = userNotifications.reduce((acc, n) => {
      acc[n.severity] = (acc[n.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byDay = this.groupNotificationsByDay(userNotifications, days);

    return {
      total: userNotifications.length,
      unread: userNotifications.filter(n => !n.isRead).length,
      byType,
      bySeverity,
      byDay
    };
  }

  private async storeNotification(userId: string, notification: NotificationPayload): Promise<void> {
    if (!this.notifications.has(userId)) {
      this.notifications.set(userId, []);
    }

    const userNotifications = this.notifications.get(userId)!;
    userNotifications.push(notification);

    // Keep only the most recent notifications
    if (userNotifications.length > this.maxNotificationsPerUser) {
      userNotifications.splice(0, userNotifications.length - this.maxNotificationsPerUser);
    }

    console.log(`Notification stored for user ${userId}: ${notification.title}`);
  }

  private mapCollisionSeverity(severity: 'minor' | 'moderate' | 'severe'): 'info' | 'warning' | 'critical' {
    switch (severity) {
      case 'minor': return 'info';
      case 'moderate': return 'warning';
      case 'severe': return 'critical';
      default: return 'info';
    }
  }

  private getCollisionTitle(severity: 'minor' | 'moderate' | 'severe'): string {
    switch (severity) {
      case 'minor': return 'Collision Detected';
      case 'moderate': return 'Collision Detected';
      case 'severe': return 'SEVERE COLLISION DETECTED';
      default: return 'Collision Detected';
    }
  }

  private getCollisionMessage(event: CollisionEvent): string {
    const location = event.location.address || event.location.latlng;
    const speed = event.vehicleInfo.speed;
    
    switch (event.severity) {
      case 'minor':
        return `Collision detected at ${location}. Speed: ${speed} km/h`;
      case 'moderate':
        return `Collision detected at ${location}. Speed: ${speed} km/h. Please check vehicle status.`;
      case 'severe':
        return `SEVERE COLLISION at ${location}. Speed: ${speed} km/h. Emergency services may be required.`;
      default:
        return `Collision detected at ${location}`;
    }
  }

  private groupNotificationsByDay(notifications: NotificationPayload[], days: number) {
    const dayGroups: Array<{ date: string; count: number }> = [];
    const now = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const count = notifications.filter(n => {
        const notificationDate = new Date(n.timestamp).toISOString().split('T')[0];
        return notificationDate === dateStr;
      }).length;
      
      dayGroups.unshift({ date: dateStr ?? '', count });
    }
    
    return dayGroups;
  }
}