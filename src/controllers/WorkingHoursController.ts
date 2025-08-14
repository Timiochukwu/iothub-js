  // src/controllers/WorkingHoursController.ts
import { Request, Response } from "express";
import { WorkingHours } from "../models/WorkingHours";
import { Telemetry } from "../models/Telemetry";
import { sendAlert } from "../utils/alertUtils";
import { WorkingHourAlert } from "../models/WorkingHours";
import { Device } from "../models/Device";
import { User } from "../models/User";
import { NotificationService } from "../services/NotificationService";
import { log } from "console";

export class WorkingHoursController {
  static async create(req: Request, res: Response) {
    try {
      const { imei, startTime, endTime, restingLocation } = req.body;
      if (!imei || !startTime || !endTime || !restingLocation) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      // check endTime is after startTime
      const startTimestamp = new Date(startTime).getTime();
      const endTimestamp = new Date(endTime).getTime();
      if (endTimestamp <= startTimestamp) {
        return res.status(400).json({
          message: "End time must be after start time",
        });
      }
      // check device exists
      const device = await Device.findOne({imei});
      if (!device) {
        return res.status(404).json({ message: "Device not found" });
      }

      const workingHours = await WorkingHours.create({
        imei: imei,
        startTime,
        endTime,
        // startLocation: parseLatLng(startRecord?.latlng),
        endLocation: parseLatLng(restingLocation),
        // overworked: durationHours > thresholdHours,
      });

      const response = {
        status: "success",
        message: "Working hours created successfully",
        data: {
          deviceId: device._id,
          imei: imei,
          startTime: workingHours.startTime,
          endTime: workingHours.endTime,
          endLocation: workingHours.endLocation,
        },
      };
      return res.status(201).json(response);
    } catch (error: any) {
      console.error(error);
      // get unique entry  error
      if (error.code === 11000) {
        return res.status(409).json({
          message: "Working hours already exist for this device",
        });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  static async getByImei(req: Request, res: Response) {
    try {
      const { imei } = req.params;
      if (!imei) {
        return res.status(400).json({ message: "IMEI is required" });
      }
  
      const records = await WorkingHours.find({ imei }).sort({ createdAt: -1 });
      return res.status(200).json(records);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Failed to fetch working hours" });
    }
  }

  static async getAll(req: Request, res: Response) {
    try {
      const records = await WorkingHours.find().sort({ createdAt: -1 });
      return res.status(200).json(records);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Failed to fetch working hours" });
    }
  }

  static async updateStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;

      log("Updating status for working hours with ID:", id);
      const { status } = req.body;
      if (!status || !["enabled", "disabled"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      // incase the data does not have status field before
      const existingRecord = await WorkingHours.findById(id);
      if (!existingRecord) {
        return res.status(404).json({ message: "Working hours not found" });
      }

      // update status
      existingRecord.status = status;
      const updatedRecord = await existingRecord.save();

      if (!updatedRecord) {
        return res.status(404).json({ message: "Working hours not found" });
      }

      return res.status(200).json({
        message: `Working hours status updated to ${status}`,
        data: updatedRecord,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Failed to update status" });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { startTime, endTime, restingLocation } = req.body;
      
      if (!startTime || !endTime || !restingLocation) {
        return res.status(400).json({ message: "Missing required fields" });
      }
  
      // check endTime is after startTime
      const startTimestamp = new Date(startTime).getTime();
      const endTimestamp = new Date(endTime).getTime();
      if (endTimestamp <= startTimestamp) {
        return res.status(400).json({
          message: "End time must be after start time",
        });
      }
  
      const updatedRecord = await WorkingHours.findByIdAndUpdate(
        id,
        { startTime, endTime, endLocation: parseLatLng(restingLocation) },
        { new: true }
      );
  
      if (!updatedRecord) {
        return res.status(404).json({ message: "Working hours record not found" });
      }
  
      return res.status(200).json({ 
        message: "Working hours updated",
        data: updatedRecord 
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Failed to update working hours" });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const deleted = await WorkingHours.findByIdAndDelete(id);
      if (!deleted) {
        return res.status(404).json({ message: "Record not found" });
      }
      return res.status(200).json({ message: "Record deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Failed to delete record" });
    }
  }

  // Create a working hour alert
  // static async createAlert(req: Request, res: Response) {
  //   try {
  //     // Use authenticated user from middleware
  //     const userId = (req as any).user?.userId;
  //     const { deviceId, startTime, endTime } = req.body;
  //     if (!userId || !deviceId || !startTime || !endTime) {
  //       return res.status(400).json({ message: "Missing required fields" });
  //     }
  //     // Find the device to get its IMEI
  //     const device = await Device.findById(deviceId);
  //     if (!device) {
  //       return res.status(404).json({ message: "Device not found" });
  //     }
  //     // Fetch latest telemetry for the device
  //     const latestTelemetry = await Telemetry.findOne({
  //       imei: device.imei,
  //     }).sort({ timestamp: -1 });
  //     const location = latestTelemetry?.latlng
  //       ? parseLatLng(latestTelemetry.latlng)
  //       : null;
  //     const alert = await WorkingHourAlert.create({
  //       user: userId,
  //       device: deviceId,
  //       schedule: { startTime, endTime },
  //       location: latestTelemetry?.latlng || null,
  //     });
  //     // Return minimal info in response
  //     return res.status(201).json({
  //       ...alert.toObject(),
  //       user: {
  //         _id: device.user,
  //       },
  //       device: {
  //         _id: device._id,
  //         imei: device.imei,
  //         make: device.make,
  //         modelYear: device.modelYear,
  //         plateNumber: device.plateNumber,
  //         deviceType: device.deviceType,
  //       },
  //       location,
  //     });
  //   } catch (error) {
  //     console.error(error);
  //     return res.status(500).json({ message: "Failed to create alert" });
  //   }
  // }

  // // List working hour alerts (optionally filter by user/device/status)
  // static async getAlerts(req: Request, res: Response) {
  //   try {
  //     const { userId, deviceId, status } = req.query;
  //     const filter: any = {};
  //     if (userId) filter.user = userId;
  //     if (deviceId) filter.device = deviceId;
  //     if (status) filter.status = status;
  //     const alerts = await WorkingHourAlert.find(filter)
  //       .populate({
  //         path: "device",
  //         select: "_id imei make modelYear plateNumber",
  //       })
  //       .populate({ path: "user", select: "_id firstName lastName" })
  //       .sort({ createdAt: -1 });
  //     // Map location to {lat, lng} if possible
  //     const mapped = alerts.map((alert) => {
  //       let location = null;
  //       if (alert.location) location = parseLatLng(alert.location);
  //       // Defensive: Only include extra fields if populated
  //       let user = undefined;
  //       if (
  //         alert.user &&
  //         typeof alert.user === "object" &&
  //         "_id" in alert.user
  //       ) {
  //         user = {
  //           _id: alert.user._id,
  //           firstName: (alert.user as any).firstName,
  //           lastName: (alert.user as any).lastName,
  //         };
  //       } else if (alert.user) {
  //         user = { _id: alert.user };
  //       }
  //       let device = undefined;
  //       if (
  //         alert.device &&
  //         typeof alert.device === "object" &&
  //         "_id" in alert.device
  //       ) {
  //         device = {
  //           _id: alert.device._id,
  //           imei: (alert.device as any).imei,
  //           make: (alert.device as any).make,
  //           modelYear: (alert.device as any).modelYear,
  //           plateNumber: (alert.device as any).plateNumber,
  //         };
  //       } else if (alert.device) {
  //         device = { _id: alert.device };
  //       }
  //       return {
  //         ...alert.toObject(),
  //         user,
  //         device,
  //         location,
  //       };
  //     });
  //     return res.status(200).json(mapped);
  //   } catch (error) {
  //     console.error(error);
  //     return res.status(500).json({ message: "Failed to fetch alerts" });
  //   }
  // }

  // // Update alert status (e.g., disable or expire)
  // static async updateAlertStatus(req: Request, res: Response) {
  //   try {
  //     const { id } = req.params;
  //     const { status } = req.body;
  //     if (!status) return res.status(400).json({ message: "Status required" });
  //     const alert = await WorkingHourAlert.findByIdAndUpdate(
  //       id,
  //       { status },
  //       { new: true }
  //     );
  //     if (!alert) return res.status(404).json({ message: "Alert not found" });
  //     return res.status(200).json(alert);
  //   } catch (error) {
  //     console.error(error);
  //     return res.status(500).json({ message: "Failed to update alert" });
  //   }
  // }

  // // Delete a working hour alert
  // static async deleteAlert(req: Request, res: Response) {
  //   try {
  //     const { id } = req.params;
  //     const deleted = await WorkingHourAlert.findByIdAndDelete(id);
  //     if (!deleted) return res.status(404).json({ message: "Alert not found" });
  //     return res.status(200).json({ message: "Alert deleted" });
  //   } catch (error) {
  //     console.error(error);
  //     return res.status(500).json({ message: "Failed to delete alert" });
  //   }
  // }

  // // Filter working hours by user/device
  // static async getFilteredWorkingHours(req: Request, res: Response) {
  //   try {
  //     const { imei, userId, date } = req.query;
  //     const filter: any = {};
  //     if (imei) filter.imei = imei;
  //     if (date) filter.date = date;
  //     // Optionally join with Device to filter by user
  //     if (userId) {
  //       const devices = await Device.find({ user: userId });
  //       filter.imei = { $in: devices.map((d) => d.imei) };
  //     }
  //     const records = await WorkingHours.find(filter).sort({ date: -1 });
  //     return res.status(200).json(records);
  //   } catch (error) {
  //     console.error(error);
  //     return res.status(500).json({ message: "Failed to fetch working hours" });
  //   }
  // }

  // // Get violations for a specific alert
  // static async getAlertViolations(req: Request, res: Response) {
  //   try {
  //     const { id } = req.params;
  //     const alert = await WorkingHourAlert.findById(id);
  //     if (!alert) return res.status(404).json({ message: "Alert not found" });
  //     return res.status(200).json(alert.violations || []);
  //   } catch (error) {
  //     console.error(error);
  //     return res.status(500).json({ message: "Failed to fetch violations" });
  //   }
  // }

  // // Check for violations for all active alerts for a device (on demand)
  // static async checkViolationsForDevice(req: Request, res: Response) {
  //   try {
  //     const { deviceId } = req.params;
  //     const device = await Device.findById(deviceId);
  //     if (!device) return res.status(404).json({ message: "Device not found" });
  //     const alerts = await WorkingHourAlert.find({
  //       device: deviceId,
  //       status: "active",
  //     });
  //     const now = new Date();
  //     const currentHour = now.getHours();
  //     const currentMinute = now.getMinutes();
  //     // Fetch latest telemetry for location
  //     const latestTelemetry = await Telemetry.findOne({
  //       imei: device.imei,
  //     }).sort({ timestamp: -1 });
  //     const location = parseLatLng(latestTelemetry?.latlng);
  //     for (const alert of alerts) {
  //       // Parse alert schedule
  //       if (
  //         !alert.schedule ||
  //         !alert.schedule.startTime ||
  //         !alert.schedule.endTime
  //       )
  //         continue;
  //       const [startHour, startMinute] = parseTime(
  //         alert.schedule.startTime
  //       ) ?? [0, 0];
  //       const [endHour, endMinute] = parseTime(alert.schedule.endTime) ?? [
  //         0, 0,
  //       ];
  //       // Check if now is outside allowed schedule
  //       const nowMinutes = currentHour * 60 + currentMinute;
  //       const startMinutes = startHour * 60 + startMinute;
  //       const endMinutes = endHour * 60 + endMinute;
  //       if (nowMinutes < startMinutes || nowMinutes > endMinutes) {
  //         // Violation detected
  //         const violation = {
  //           timestamp: now,
  //           location,
  //           durationSeconds: 0, // Could be calculated if you track start/end
  //           status: "active",
  //         };
  //         alert.violations.push(violation);
  //         await alert.save();
  //         // Notify user
  //         const notificationService = new NotificationService();
  //         await notificationService.createWorkingHourNotification(
  //           alert.user.toString(),
  //           device.imei,
  //           `Device ${device.imei} violated working hour schedule at ${now.toISOString()}`,
  //           latestTelemetry?.latlng
  //         );
  //       }
  //     }
  //     return res.status(200).json({ message: "Violation check complete" });
  //   } catch (error) {
  //     console.error(error);
  //     return res.status(500).json({ message: "Failed to check violations" });
  //   }
  // }
}

function parseLatLng(latlng?: string): { lat: number; lng: number } | null {
  if (!latlng) return null;
  const [latStr, lngStr] = latlng.split(",");
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (isNaN(lat) || isNaN(lng) || latStr === undefined || lngStr === undefined)
    return null;
  return { lat, lng };
}

// Helper to parse time string like "09:00 AM" to [hour, minute]
function parseTime(timeStr: string): [number, number] {
  if (!timeStr) return [0, 0];
  // Supports "09:00 AM" or "17:00" formats
  let hour = 0,
    minute = 0;
  if (timeStr.includes("AM") || timeStr.includes("PM")) {
    const [time, period] = timeStr.split(" ");
    if (!time || !period) return [0, 0];
    const [h, m] = time.split(":").map(Number);
    hour = h ?? 0;
    minute = m ?? 0;
    if (period === "PM" && hour < 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;
  } else {
    const [h, m] = timeStr.split(":").map(Number);
    hour = h ?? 0;
    minute = m ?? 0;
  }
  return [hour, minute];
}
