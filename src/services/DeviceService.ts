import { Device, IDevice } from '../models/Device';
import { User, IUser } from '../models/User';
import { ApiResponse, PaginatedResponse } from '../types';
import { CustomError } from '../middleware/errorHandler';
import { Types } from 'mongoose';

export class DeviceService {
  async registerDevice(deviceData: {
    imei: string;
    userId: string;
    name?: string;
    description?: string;
  }): Promise<ApiResponse> {
    try {
      // Check if user exists
      const user = await User.findById(deviceData.userId);
      if (!user) {
        throw new CustomError('User not found', 404);
      }
      // Check if device already exists
      const existingDevice = await Device.findOne({ imei: deviceData.imei });
      if (existingDevice) {
        throw new CustomError('Device with this IMEI already exists', 409);
      }
      // Create new device
      const device = await Device.create({
        imei: deviceData.imei,
        user: user._id,
        name: deviceData.name,
        description: deviceData.description,
        isActive: true
      });
      return {
        success: true,
        message: 'Device registered successfully',
        data: device
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to register device', 500);
    }
  }

  async getUserDevices(userId: string, page: number = 1, limit: number = 10): Promise<ApiResponse<PaginatedResponse<IDevice>>> {
    try {
      const skip = (page - 1) * limit;
      const [devices, total] = await Promise.all([
        Device.find({ user: userId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
        Device.countDocuments({ user: userId })
      ]);
      const totalPages = Math.ceil(total / limit);
      return {
        success: true,
        message: 'Devices retrieved successfully',
        data: {
          data: devices,
          pagination: {
            page,
            limit,
            total,
            totalPages
          }
        }
      };
    } catch (error) {
      throw new CustomError('Failed to retrieve devices', 500);
    }
  }

  async getDevicesByEmail(email: string, page: number = 1, limit: number = 10): Promise<ApiResponse<PaginatedResponse<IDevice>>> {
    try {
      // Find user by email
      const user = await User.findOne({ email });
      if (!user) {
        throw new CustomError('User not found', 404);
      }
      return this.getUserDevices((user._id as any).toString(), page, limit);
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to retrieve devices', 500);
    }
  }

  async switchActiveDevice(userId: string, imei: string): Promise<ApiResponse> {
    try {
      // Find the device
      const device = await Device.findOne({ imei, user: userId });
      if (!device) {
        throw new CustomError('Device not found', 404);
      }
      // Deactivate all user's devices
      await Device.updateMany({ user: userId }, { isActive: false });
      // Activate the specified device
      device.isActive = true;
      await device.save();
      return {
        success: true,
        message: 'Active device switched successfully',
        data: device
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to switch active device', 500);
    }
  }

  async getActiveDevice(userId: string): Promise<ApiResponse> {
    try {
      const device = await Device.findOne({ user: userId, isActive: true });
      if (!device) {
        throw new CustomError('No active device found', 404);
      }
      return {
        success: true,
        message: 'Active device retrieved successfully',
        data: device
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to retrieve active device', 500);
    }
  }

  async getActiveDeviceByEmail(email: string): Promise<ApiResponse> {
    try {
      const user = await User.findOne({ email });
      if (!user) {
        throw new CustomError('User not found', 404);
      }
      return this.getActiveDevice((user._id as any).toString());
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to retrieve active device', 500);
    }
  }

  async updateDevice(deviceId: string, userId: string, updateData: {
    name?: string;
    description?: string;
    isActive?: boolean;
  }): Promise<ApiResponse> {
    try {
      const device = await Device.findOne({ _id: deviceId, user: userId });
      if (!device) {
        throw new CustomError('Device not found', 404);
      }
      // Update device fields
      if (updateData.name !== undefined) device.name = updateData.name;
      if (updateData.description !== undefined) device.description = updateData.description;
      if (updateData.isActive !== undefined) device.isActive = updateData.isActive;
      await device.save();
      return {
        success: true,
        message: 'Device updated successfully',
        data: device
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to update device', 500);
    }
  }

  async deleteDevice(deviceId: string, userId: string): Promise<ApiResponse> {
    try {
      const device = await Device.findOne({ _id: deviceId, user: userId });
      if (!device) {
        throw new CustomError('Device not found', 404);
      }
      await device.deleteOne();
      return {
        success: true,
        message: 'Device deleted successfully'
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to delete device', 500);
    }
  }

  async getDeviceByImei(imei: string): Promise<ApiResponse> {
    try {
      const device = await Device.findOne({ imei }).populate('user');
      if (!device) {
        throw new CustomError('Device not found', 404);
      }
      return {
        success: true,
        message: 'Device retrieved successfully',
        data: device
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to retrieve device', 500);
    }
  }
} 