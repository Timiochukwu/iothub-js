import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getNotificationStats
} from '../controllers/notificationController';

const notificationRouter = Router();

notificationRouter.get('/', authenticateToken, getNotifications);
notificationRouter.put('/:id/read', authenticateToken, markNotificationAsRead);
notificationRouter.put('/read-all', authenticateToken, markAllNotificationsAsRead);
notificationRouter.delete('/:id', authenticateToken, deleteNotification);
notificationRouter.get('/stats', authenticateToken, getNotificationStats);

export { notificationRouter }; 