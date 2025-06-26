import { DeviceType, IDeviceType } from "../models/DeviceType";
import {
  ApiResponse,
  PaginatedResponse,
  DeviceTypeDto,
  DeviceSwitchRequest,
} from "../types";
import { CustomError } from "../middleware/errorHandler";
import { Types } from "mongoose";

export class DeviceTypeService {
  async createDeviceType(deviceTypeData: DeviceTypeDto): Promise<ApiResponse> {
    try {
      // Check if device type already exists
      const existingDeviceType = await DeviceType.findOne({
        name: deviceTypeData.name.trim(),
      });

      if (existingDeviceType) {
        throw new CustomError("Device type already exists", 409);
      }

      // Create new device type
      const deviceType = await DeviceType.create({
        name: deviceTypeData.name.trim(),
        description: deviceTypeData.description,
      });

      return {
        success: true,
        message: "Device type created successfully",
        data: deviceType,
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError("Failed to create device type", 500);
    }
  }

  async listDeviceTypes(
    page: number = 1,
    limit: number = 10
  ): Promise<PaginatedResponse<IDeviceType>> {
    try {
      const skip = (page - 1) * limit;
      const total = await DeviceType.countDocuments();
      const deviceTypes = await DeviceType.find()
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

      return {
        data: deviceTypes,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new CustomError("Failed to fetch device types", 500);
    }
  }

  async getDeviceTypeById(id: string): Promise<ApiResponse<IDeviceType>> {
    try {
      const deviceType = await DeviceType.findById(id);
      if (!deviceType) {
        throw new CustomError("Device type not found", 404);
      }
      return {
        success: true,
        message: "Device type retrieved successfully",
        data: deviceType,
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError("Failed to fetch device type", 500);
    }
  }

  async updateDeviceType(
    id: string,
    deviceTypeData: DeviceTypeDto
  ): Promise<ApiResponse<IDeviceType>> {
    try {
      const deviceType = await DeviceType.findByIdAndUpdate(
        id,
        {
          name: deviceTypeData.name.trim(),
          description: deviceTypeData.description,
        },
        { new: true }
      );

      if (!deviceType) {
        throw new CustomError("Device type not found", 404);
      }

      return {
        success: true,
        message: "Device type updated successfully",
        data: deviceType,
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError("Failed to update device type", 500);
    }
  }

  async deleteDeviceType(id: string): Promise<ApiResponse> {
    try {
      const deviceType = await DeviceType.findByIdAndDelete(id);
      if (!deviceType) {
        throw new CustomError("Device type not found", 404);
      }
      return {
        success: true,
        message: "Device type deleted successfully",
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError("Failed to delete device type", 500);
    }
  }
}
