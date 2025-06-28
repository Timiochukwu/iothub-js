// src/utils/responseHandler.ts
import { Request, Response } from "express";
import { CustomError } from "../middleware/errorHandler";
import { ApiResponse } from "../types";
// import geofence
import { CreateGeofenceRequest } from "../types/index";
import { GeofenceService } from "../services/GeofenceService";

export class ResponseHandler {
  // --- FIX #2: THE `success` METHOD WAS MISSING THE `data` PARAMETER ---
  static success<T>(
    res: Response,
    data: T, // This parameter was missing
    message = "Success",
    statusCode = 200
  ): void {
    res.status(statusCode).json({
      success: true,
      message,
      data, // Now this refers to the parameter
      timestamp: new Date().toISOString(),
    });
  }

  static successWithMeta<T>(
    res: Response,
    data: T,
    meta: any,
    message = "Success",
    statusCode = 200
  ): void {
    res.status(statusCode).json({
      success: true,
      message,
      data,
      meta,
      timestamp: new Date().toISOString(),
    });
  }

  static error(
    res: Response,
    error: unknown,
    defaultMessage = "Internal server error"
  ): void {
    const customError = error as CustomError;
    const statusCode = customError.statusCode || 500;
    const message = customError.message || defaultMessage;

    res.status(statusCode).json({
      success: false,
      message,
      error: customError.statusCode ? undefined : "INTERNAL_ERROR",
      timestamp: new Date().toISOString(),
    });
  }

  static validationError(
    res: Response,
    message: string,
    errorCode = "VALIDATION_ERROR"
  ): void {
    res.status(400).json({
      success: false,
      message,
      error: errorCode,
      timestamp: new Date().toISOString(),
    });
  }

  static notFound(res: Response, message = "Resource not found"): void {
    res.status(404).json({
      success: false,
      message,
      error: "NOT_FOUND",
      timestamp: new Date().toISOString(),
    });
  }
}

// Usage example in controller
export class ImprovedGeofenceController {
  private geofenceService: GeofenceService;

  constructor() {
    this.geofenceService = new GeofenceService();
  }

  // Use the imported Request and Response types here
  createGeofence = async (req: Request, res: Response): Promise<void> => {
    try {
      // req.body is now correctly typed
      const geofenceData: CreateGeofenceRequest = req.body;
      const geofence = await this.geofenceService.createGeofence(geofenceData);

      // The success call signature was wrong. It should be (res, data, message, statusCode)
      ResponseHandler.success(
        res,
        geofence,
        "Geofence created successfully",
        201
      );
    } catch (error) {
      ResponseHandler.error(res, error);
    }
  };

  // Use the imported Request and Response types here
  getGeofence = async (req: Request, res: Response): Promise<void> => {
    try {
      // req.params is now correctly typed
      const { id } = req.params;
      const geofence = await this.geofenceService.getGeofenceById(id);

      if (!geofence) {
        ResponseHandler.notFound(res, "Geofence not found");
        return;
      }

      // FIX: The argument for `success` should be the geofence data, not a string
      ResponseHandler.success(res, geofence);
    } catch (error) {
      ResponseHandler.error(res, error);
    }
  };

  // Use the imported Request and Response types here
  listGeofences = async (req: Request, res: Response): Promise<void> => {
    try {
      // req.query is now correctly typed
      const query = {
        deviceImei: req.query.deviceImei as string,
        userEmail: req.query.userEmail as string,
        isActive: req.query.isActive
          ? req.query.isActive === "true"
          : undefined,
        limit: req.query.limit
          ? parseInt(req.query.limit as string, 10) // Always specify radix
          : 50, // Provide a default
        offset: req.query.offset
          ? parseInt(req.query.offset as string, 10) // Always specify radix
          : 0, // Provide a default
      };

      const result = await this.geofenceService.listGeofences(query);

      const meta = {
        total: result.total,
        hasMore: result.hasMore,
        limit: query.limit,
        offset: query.offset,
      };

      ResponseHandler.successWithMeta(res, result.geofences, meta);
    } catch (error) {
      ResponseHandler.error(res, error);
    }
  };
}
