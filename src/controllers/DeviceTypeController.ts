import { Request, Response } from "express";
import { DeviceTypeService } from "../services/DeviceTypeService";
import { validateRequest, validateQuery } from "../middleware/validation";
import { deviceTypeSchemas, querySchemas } from "../utils/validationSchemas";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth";
import { ApiResponse, DeviceDto, DeviceSwitchRequest } from "../types";
import { CustomError } from "../middleware/errorHandler";

export class DeviceTypeController {
  private deviceTypeService: DeviceTypeService;

  constructor() {
    this.deviceTypeService = new DeviceTypeService();
  }

  // POST /api/device-types
  createDeviceType = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse>
  ): Promise<void> => {
    try {
      const deviceTypeData = req.body;
      const result =
        await this.deviceTypeService.createDeviceType(deviceTypeData);
      res.status(201).json({
        success: true,
        data: result,
        message: "Device type created successfully",
      });
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

  // GET /api/device-types
  listDeviceTypes = async (
    req: Request,
    res: Response<ApiResponse>
  ): Promise<void> => {
    try {
      const result = await this.deviceTypeService.listDeviceTypes();
      res.status(200).json({
        success: true,
        data: result,
        message: "Device types retrieved successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };

  // GET /api/device-types/:id
  getDeviceTypeById = async (
    req: Request,
    res: Response<ApiResponse>
  ): Promise<void> => {
    try {
      const id = req?.params?.id || "";
      const result = await this.deviceTypeService.getDeviceTypeById(id);
      res.status(200).json({
        success: true,
        data: result,
        message: "Device type retrieved successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };

  // PUT /api/device-types/:id
  updateDeviceType = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse>
  ): Promise<void> => {
    try {
      const id = req?.params?.id || "";
      const deviceTypeData = req.body;
      const result = await this.deviceTypeService.updateDeviceType(
        id,
        deviceTypeData
      );
      res.status(200).json({
        success: true,
        data: result,
        message: "Device type updated successfully",
      });
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
  // DELETE /api/device-types/:id
  deleteDeviceType = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse>
  ): Promise<void> => {
    try {
      const id = req?.params?.id || "";
      await this.deviceTypeService.deleteDeviceType(id);
      res.status(204).json({
        success: true,
        message: "Device type deleted successfully",
      });
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
}
