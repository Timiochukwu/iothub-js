import { Request, Response } from "express";
import { DeviceService } from "../services/DeviceService";
import { validateRequest, validateQuery } from "../middleware/validation";
import { deviceSchemas, querySchemas } from "../utils/validationSchemas";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth";
import { ApiResponse, DeviceDto, DeviceSwitchRequest } from "../types";
import { CustomError } from "../middleware/errorHandler";
import { Telemetry } from "../models/Telemetry";
import { mapTelemetry } from "../utils/mapTelemetry";

export class DeviceController {
  private deviceService: DeviceService;

  constructor() {
    this.deviceService = new DeviceService();
  }

  // POST /api/devices/register?email=user@example.com
  register = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      // const { email } = req.query;
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError("User not authenticated", 401);
      }
      const deviceData: DeviceDto = req.body;

      // if (!email || typeof email !== "string") {
      //   throw new CustomError("Email parameter is required", 400);
      // }

      const result = await this.deviceService.registerDevice(
        userId,
        deviceData
      );
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof CustomError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    }
  };

  // GET /api/devices?email=user@example.com
  listDevices = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { userId } = req.user || {};
      if (!userId) {
        throw new CustomError("User not authenticated", 401);
      }

      const result = await this.deviceService.listDevices(userId);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof CustomError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    }
  };

  // POST /api/devices/switch
  switchDevice = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const switchRequest: DeviceSwitchRequest = req.body;
      switchRequest.userId = req.user?.userId || "";
      const result = await this.deviceService.switchActiveDevice(switchRequest);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof CustomError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    }
  };

  // GET /api/devices/active?email=user@example.com
  getActiveDevice = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.query;

      if (!email || typeof email !== "string") {
        throw new CustomError("Email parameter is required", 400);
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
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    }
  };

  getUserDevices = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse>
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "User not authenticated",
          error: "UNAUTHORIZED",
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await this.deviceService.getUserDevices(
        req.user.userId,
        page,
        limit
      );
      res.status(200).json(result);
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : "INTERNAL_ERROR",
      });
    }
  };

  getDevicesByEmail = async (
    req: Request,
    res: Response<ApiResponse>
  ): Promise<void> => {
    try {
      const { email } = req.query as { email: string };
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await this.deviceService.getDevicesByEmail(
        email,
        page,
        limit
      );
      res.status(200).json(result);
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : "INTERNAL_ERROR",
      });
    }
  };

  updateDevice = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse>
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "User not authenticated",
          error: "UNAUTHORIZED",
        });
        return;
      }

      const { deviceId } = req.params;
      if (!deviceId) {
        res.status(400).json({
          success: false,
          message: "Device ID is required",
          error: "MISSING_DEVICE_ID",
        });
        return;
      }

      const updateData = req.body;
      const result = await this.deviceService.updateDevice(
        deviceId,
        updateData
      );
      res.status(200).json(result);
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : "INTERNAL_ERROR",
      });
    }
  };

  deleteDevice = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse>
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "User not authenticated",
          error: "UNAUTHORIZED",
        });
        return;
      }

      const { deviceId } = req.params;
      if (!deviceId) {
        res.status(400).json({
          success: false,
          message: "Device ID is required",
          error: "MISSING_DEVICE_ID",
        });
        return;
      }

      const result = await this.deviceService.deleteDevice(
        deviceId,
        req.user.userId
      );
      res.status(200).json(result);
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : "INTERNAL_ERROR",
      });
    }
  };

  getDeviceByImei = async (req: Request, res: Response): Promise<void> => {
    try {
      const { imei } = req.params;
      if (!imei) {
        res.status(400).json({
          success: false,
          message: "IMEI is required",
          error: "MISSING_IMEI",
        });
        return;
      }
      const result = await this.deviceService.getDeviceByImei(imei);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: "INTERNAL_ERROR",
      });
    }
  };

// GET /api/devices/:imei/vin
getDeviceVin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { imei } = req.params;

    if (!imei) {
      res.status(400).json({
        success: false,
        message: "IMEI is required",
        error: "MISSING_IMEI",
      });
      return;
    }

    // 🔍 First: Try to get VIN from latest telemetry with VIN
    const latestTelemetry = await Telemetry.findOne({
      imei,
      "state.reported.256": { $exists: true },
    }).sort({ "state.reported.ts": -1 });

    if (latestTelemetry) {
      const raw = { state: { reported: {} }, ...latestTelemetry.toObject() };
      raw.state.reported = raw.state.reported || {};
      const mapped = mapTelemetry(raw);
      if (mapped.vin) {
        res.status(200).json({ success: true, vin: mapped.vin });
        return;
      }
    }

    //  If no VIN found anywhere
    res.status(404).json({
      success: false,
      message: "VIN not found in telemetry or device metadata",
      error: "VIN_NOT_FOUND",
    });
  } catch (error) {
    console.error("[getDeviceVin] Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: "INTERNAL_ERROR",
    });
  }
};


  // POST /api/devices/:imei/vehicle-info
  submitVehicleInfo = async (req: Request, res: Response): Promise<void> => {
    try {
      const { imei } = req.params;
      const vehicleInfo = req.body;
      if (!imei) {
        res.status(400).json({
          success: false,
          message: "IMEI is required",
          error: "MISSING_IMEI",
        });
        return;
      }
      const result = await this.deviceService.updateVehicleInfo(
        imei,
        vehicleInfo
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: "INTERNAL_ERROR",
      });
    }
  };
}
