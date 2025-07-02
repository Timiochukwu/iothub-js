import { Request, Response } from 'express';
import { CollisionDetectionService } from '../services/CollisionDetectionService';
import { Device } from '../models/Device';
import { CustomError } from '../middleware/errorHandler';

const collisionService = new CollisionDetectionService();

export const getRecentCollisions = async (req: Request, res: Response) => {
  try {
    const { imei } = req.params;
    const { limit = 10 } = req.query;
    const userId = (req as any).user.userId;

    if (!imei) {
      throw new CustomError('IMEI is required', 400);
    }

    const device = await Device.findOne({ imei, user: userId });
    if (!device) throw new CustomError(`Access denied to device ${imei}`, 403);

    const recentCollisions = await collisionService.getRecentCollisions(
      imei!, parseInt(limit as string)
    );

    const formattedCollisions = recentCollisions.map(collision => ({
      id: collision.id,
      imei: collision.imei,
      timestamp: collision.timestamp,
      date: new Date(collision.timestamp).toLocaleDateString(),
      time: new Date(collision.timestamp).toLocaleTimeString(),
      severity: collision.severity,
      location: collision.location.address || collision.location.latlng,
      speed: collision.vehicleInfo.speed,
      status: collision.status,
      emergencyContacted: collision.emergencyContacted,
      responseTime: collision.responseTime,
      vehicleInfo: collision.vehicleInfo,
      accelerometerData: collision.accelerometerData
    }));

    res.json({
      success: true,
      data: {
        imei,
        collisions: formattedCollisions,
        count: formattedCollisions.length
      }
    });
  } catch (error) {
    const statusCode = error instanceof CustomError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to fetch collision history'
    });
  }
};

export const getCollisionStats = async (req: Request, res: Response) => {
  try {
    const { imei } = req.params;
    const { days = 30 } = req.query;
    const userId = (req as any).user.userId;

    if (!imei) {
      throw new CustomError('IMEI is required', 400);
    }

    const device = await Device.findOne({ imei, user: userId });
    if (!device) throw new CustomError(`Access denied to device ${imei}`, 403);

    const stats = await collisionService.getCollisionStats(
      imei!, parseInt(days as string)
    );

    res.json({
      success: true,
      data: {
        imei,
        period: `${days} days`,
        ...stats
      }
    });
  } catch (error) {
    const statusCode = error instanceof CustomError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to fetch collision statistics'
    });
  }
};

export const updateCollisionStatus = async (req: Request, res: Response) => {
  try {
    const { imei, collisionId, status, responseTime } = req.body;
    const userId = (req as any).user.userId;

    if (!imei || !collisionId || !status) {
      throw new CustomError('IMEI, collisionId, and status are required', 400);
    }
    if (!['confirmed', 'false_alarm'].includes(status)) {
      throw new CustomError('Status must be either "confirmed" or "false_alarm"', 400);
    }

    const device = await Device.findOne({ imei, user: userId });
    if (!device) throw new CustomError(`Access denied to device ${imei}`, 403);

    await collisionService.updateCollisionStatus(imei, collisionId, status, responseTime);

    res.json({
      success: true,
      message: `Collision status updated to ${status}`,
      data: {
        imei,
        collisionId,
        status,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    const statusCode = error instanceof CustomError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update collision status'
    });
  }
}; 