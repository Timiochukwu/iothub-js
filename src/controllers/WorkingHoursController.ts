// src/controllers/WorkingHoursController.ts
import { Request, Response } from "express";
import { WorkingHours } from "../models/WorkingHours";
import { Telemetry } from "../models/Telemetry";
import { sendAlert } from "../utils/alertUtils";
import { WorkingHourAlert } from "../models/WorkingHours";
import { Device } from "../models/Device";
import { User } from "../models/User";
import { NotificationService } from "../services/NotificationService";

export class WorkingHoursController {
  static async create(req: Request, res: Response) {
    try {
      const { imei, date, thresholdHours } = req.body;

      // Get all telemetry for the day sorted by timestamp
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const records = await Telemetry.find({
        imei,
        timestamp: {
          $gte: startOfDay.getTime(),
          $lte: endOfDay.getTime(),
        },
      }).sort({ timestamp: 1 });

      if (!records.length) {
        return res.status(404).json({ message: "No telemetry data found" });
      }

      // For demo: treat first record as ignition on, last as ignition off
      const startRecord = records[0];
      const endRecord = records[records.length - 1];

      const startTimestamp = startRecord?.timestamp;
      const endTimestamp = endRecord?.timestamp;
      if (startTimestamp === undefined || endTimestamp === undefined) {
        return res.status(400).json({ message: "Missing telemetry timestamps for working hours calculation" });
      }
      const durationSeconds = Math.floor((endTimestamp - startTimestamp) / 1000);
      const durationHours = durationSeconds / 3600;

      const workingHours = await WorkingHours.create({
        imei,
        date,
        startTime: new Date(Number(startTimestamp)),
        endTime: new Date(Number(endTimestamp)),
        durationSeconds,
        startLocation: parseLatLng(startRecord?.latlng),
        endLocation: parseLatLng(endRecord?.latlng),
        overworked: durationHours > thresholdHours,
      });

      const notificationService = new NotificationService();

      if (workingHours.overworked) {
        await sendAlert({
          imei,
          title: "Overworking Alert",
          message: `Device ${imei} exceeded threshold (${durationHours.toFixed(2)} hrs)`
        });
        // Find the device to get the userId
        const device = await Device.findOne({ imei });
        if (device && device.user) {
          await notificationService.createWorkingHourNotification(
            device.user.toString(),
            imei,
            `Device ${imei} exceeded working hour threshold (${durationHours.toFixed(2)} hrs)`,
            endRecord?.latlng
          );
        }
      }

      return res.status(201).json(workingHours);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  static async getAll(req: Request, res: Response) {
    try {
      const records = await WorkingHours.find().sort({ date: -1 });
      return res.status(200).json(records);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Failed to fetch working hours" });
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
  static async createAlert(req: Request, res: Response) {
    try {
      const { userId, deviceId, startTime, endTime } = req.body;
      if (!userId || !deviceId || !startTime || !endTime) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      // Find the device to get its IMEI
      const device = await Device.findById(deviceId);
      if (!device) {
        return res.status(404).json({ message: "Device not found" });
      }
      // Fetch latest telemetry for the device
      const latestTelemetry = await Telemetry.findOne({ imei: device.imei }).sort({ timestamp: -1 });
      const location = latestTelemetry?.latlng || null;
      const alert = await WorkingHourAlert.create({
        user: userId,
        device: deviceId,
        schedule: { startTime, endTime },
        location,
      });
      return res.status(201).json(alert);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Failed to create alert" });
    }
  }

  // List working hour alerts (optionally filter by user/device/status)
  static async getAlerts(req: Request, res: Response) {
    try {
      const { userId, deviceId, status } = req.query;
      const filter: any = {};
      if (userId) filter.user = userId;
      if (deviceId) filter.device = deviceId;
      if (status) filter.status = status;
      const alerts = await WorkingHourAlert.find(filter).populate("device").populate("user").sort({ createdAt: -1 });
      return res.status(200).json(alerts);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Failed to fetch alerts" });
    }
  }

  // Update alert status (e.g., disable or expire)
  static async updateAlertStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (!status) return res.status(400).json({ message: "Status required" });
      const alert = await WorkingHourAlert.findByIdAndUpdate(id, { status }, { new: true });
      if (!alert) return res.status(404).json({ message: "Alert not found" });
      return res.status(200).json(alert);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Failed to update alert" });
    }
  }

  // Delete a working hour alert
  static async deleteAlert(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const deleted = await WorkingHourAlert.findByIdAndDelete(id);
      if (!deleted) return res.status(404).json({ message: "Alert not found" });
      return res.status(200).json({ message: "Alert deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Failed to delete alert" });
    }
  }

  // Filter working hours by user/device
  static async getFilteredWorkingHours(req: Request, res: Response) {
    try {
      const { imei, userId, date } = req.query;
      const filter: any = {};
      if (imei) filter.imei = imei;
      if (date) filter.date = date;
      // Optionally join with Device to filter by user
      if (userId) {
        const devices = await Device.find({ user: userId });
        filter.imei = { $in: devices.map((d) => d.imei) };
      }
      const records = await WorkingHours.find(filter).sort({ date: -1 });
      return res.status(200).json(records);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Failed to fetch working hours" });
    }
  }
}

function parseLatLng(latlng?: string): { lat: number, lng: number } | null {
  if (!latlng) return null;
  const [latStr, lngStr] = latlng.split(",");
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (isNaN(lat) || isNaN(lng) || latStr === undefined || lngStr === undefined) return null;
  return { lat, lng };
}
