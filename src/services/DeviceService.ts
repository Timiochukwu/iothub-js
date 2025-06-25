import { Device, IDevice } from '../models/Device';
import { User, IUser } from '../models/User';
import { ApiResponse, PaginatedResponse, DeviceDto, DeviceSwitchRequest } from '../types';
import { CustomError } from '../middleware/errorHandler';
import { Types } from 'mongoose';

export class DeviceService {
  async registerDevice(email: string, deviceData: DeviceDto): Promise<ApiResponse> {
    try {
      // Check if user exists
      const user = await User.findOne({ email });
      if (!user) {
        throw new CustomError('User not found', 404);
      }

      // Check if device already exists (IMEI + VIN combination)
      const imei = deviceData.imei.trim();
      const vin = deviceData.vin ? deviceData.vin.trim().toUpperCase() : '';
      
      const existingDevice = await Device.findOne({
        $or: [
          { imei: imei },
          { $and: [{ imei: imei }, { vin: vin }] }
        ]
      });

      if (existingDevice) {
        throw new CustomError('Device already exists', 409);
      }

      // Create new device
      const device = await Device.create({
        imei: imei,
        user: user._id,
        deviceType: deviceData.deviceType,
        vin: vin,
        make: deviceData.make,
        modelYear: deviceData.modelYear,
        plateNumber: deviceData.plateNumber,
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

  async switchActiveDevice(switchRequest: DeviceSwitchRequest): Promise<ApiResponse> {
    try {
      const { email, imei } = switchRequest;
      
      // Find user
      const user = await User.findOne({ email });
      if (!user) {
        throw new CustomError('User not found', 404);
      }

      // Find the device
      const device = await Device.findOne({ 
        user: user._id, 
        imei: imei 
      });

      if (!device) {
        throw new CustomError('Device not found', 404);
      }

      // Set all user's devices to inactive
      await Device.updateMany(
        { user: user._id },
        { isActive: false }
      );

      // Set the selected device as active
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

  async getActiveDevice(email: string): Promise<ApiResponse> {
    try {
      const user = await User.findOne({ email });
      if (!user) {
        throw new CustomError('User not found', 404);
      }

      const activeDevice = await Device.findOne({ 
        user: user._id, 
        isActive: true 
      });

      if (!activeDevice) {
        return {
          success: true,
          message: 'No active device found',
          data: null
        };
      }

      return {
        success: true,
        message: 'Active device retrieved successfully',
        data: activeDevice
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

  async updateDevice(deviceId: string, updateData: Partial<DeviceDto>): Promise<ApiResponse> {
    try {
      const device = await Device.findById(deviceId);
      if (!device) {
        throw new CustomError('Device not found', 404);
      }

      // Update device fields
      if (updateData.deviceType !== undefined) device.deviceType = updateData.deviceType;
      if (updateData.vin !== undefined) device.vin = updateData.vin;
      if (updateData.make !== undefined) device.make = updateData.make;
      if (updateData.modelYear !== undefined) device.modelYear = updateData.modelYear;
      if (updateData.plateNumber !== undefined) device.plateNumber = updateData.plateNumber;

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

  async listDevices(email: string): Promise<ApiResponse> {
    try {
      const user = await User.findOne({ email });
      if (!user) {
        throw new CustomError('User not found', 404);
      }

      const devices = await Device.find({ user: user._id });
      return {
        success: true,
        message: 'Devices retrieved successfully',
        data: devices
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to retrieve devices', 500);
    }
  }
} 