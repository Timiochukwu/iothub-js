import { Request, Response } from 'express';
import { DeviceService } from '../services/DeviceService';
import { validateRequest, validateQuery } from '../middleware/validation';
import { deviceSchemas, querySchemas } from '../utils/validationSchemas';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { ApiResponse, DeviceDto, DeviceSwitchRequest } from '../types';
import { CustomError } from '../middleware/errorHandler';

export class DeviceController {
  private deviceService: DeviceService;

  constructor() {
    this.deviceService = new DeviceService();
  }

  // POST /api/devices/register?email=user@example.com
  register = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.query;
      const deviceData: DeviceDto = req.body;

      if (!email || typeof email !== 'string') {
        throw new CustomError('Email parameter is required', 400);
      }

      const result = await this.deviceService.registerDevice(email, deviceData);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof CustomError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Internal server error'
        });
      }
    }
  };

  // GET /api/devices?email=user@example.com
  listDevices = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.query;

      if (!email || typeof email !== 'string') {
        throw new CustomError('Email parameter is required', 400);
      }

      const result = await this.deviceService.listDevices(email);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof CustomError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Internal server error'
        });
      }
    }
  };

  // POST /api/devices/switch
  switchDevice = async (req: Request, res: Response): Promise<void> => {
    try {
      const switchRequest: DeviceSwitchRequest = req.body;
      const result = await this.deviceService.switchActiveDevice(switchRequest);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof CustomError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Internal server error'
        });
      }
    }
  };

  // GET /api/devices/active?email=user@example.com
  getActiveDevice = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.query;

      if (!email || typeof email !== 'string') {
        throw new CustomError('Email parameter is required', 400);
      }

      const result = await this.deviceService.getActiveDevice(email);
      
      if (result.data === null) {
        res.status(204).send(); // No content (like in Java)
      } else {
        res.status(200).json(result);
      }
    } catch (error) {
      if (error instanceof CustomError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Internal server error'
        });
      }
    }
  };

  getUserDevices = async (req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated',
          error: 'UNAUTHORIZED'
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await this.deviceService.getUserDevices(req.user.userId, page, limit);
      res.status(200).json(result);
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  getDevicesByEmail = async (req: Request, res: Response<ApiResponse>): Promise<void> => {
    try {
      const { email } = req.query as { email: string };
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await this.deviceService.getDevicesByEmail(email, page, limit);
      res.status(200).json(result);
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  updateDevice = async (req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated',
          error: 'UNAUTHORIZED'
        });
        return;
      }

      const { deviceId } = req.params;
      if (!deviceId) {
        res.status(400).json({
          success: false,
          message: 'Device ID is required',
          error: 'MISSING_DEVICE_ID'
        });
        return;
      }

      const updateData = req.body;
      const result = await this.deviceService.updateDevice(deviceId, updateData);
      res.status(200).json(result);
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  deleteDevice = async (req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated',
          error: 'UNAUTHORIZED'
        });
        return;
      }

      const { deviceId } = req.params;
      if (!deviceId) {
        res.status(400).json({
          success: false,
          message: 'Device ID is required',
          error: 'MISSING_DEVICE_ID'
        });
        return;
      }

      const result = await this.deviceService.deleteDevice(deviceId, req.user.userId);
      res.status(200).json(result);
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  getDeviceByImei = async (req: Request, res: Response<ApiResponse>): Promise<void> => {
    try {
      const { imei } = req.params;
      if (!imei) {
        res.status(400).json({
          success: false,
          message: 'IMEI is required',
          error: 'MISSING_IMEI'
        });
        return;
      }

      const result = await this.deviceService.getDeviceByImei(imei);
      res.status(200).json(result);
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };
} 