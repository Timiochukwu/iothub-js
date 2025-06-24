import { Request, Response } from 'express';
import { DeviceService } from '../services/DeviceService';
import { validateRequest, validateQuery } from '../middleware/validation';
import { deviceSchemas, querySchemas } from '../utils/validationSchemas';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import { CustomError } from '../middleware/errorHandler';

export class DeviceController {
  private deviceService: DeviceService;

  constructor() {
    this.deviceService = new DeviceService();
  }

  registerDevice = async (req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated',
          error: 'UNAUTHORIZED'
        });
        return;
      }

      const result = await this.deviceService.registerDevice({
        ...req.body,
        userId: req.user.userId
      });
      res.status(201).json(result);
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
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

  switchActiveDevice = async (req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated',
          error: 'UNAUTHORIZED'
        });
        return;
      }

      const { imei } = req.body;
      const result = await this.deviceService.switchActiveDevice(req.user.userId, imei);
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

  getActiveDevice = async (req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated',
          error: 'UNAUTHORIZED'
        });
        return;
      }

      const result = await this.deviceService.getActiveDevice(req.user.userId);
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

  getActiveDeviceByEmail = async (req: Request, res: Response<ApiResponse>): Promise<void> => {
    try {
      const { email } = req.query as { email: string };
      const result = await this.deviceService.getActiveDeviceByEmail(email);
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

      const result = await this.deviceService.updateDevice(deviceId, req.user.userId, req.body);
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