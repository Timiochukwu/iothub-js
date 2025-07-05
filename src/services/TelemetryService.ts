import { Telemetry, ITelemetry } from "../models/Telemetry";
import { Device } from "../models/Device";
import {
  CollisionDetectionService,
  CollisionAlert,
  CollisionEvent,
} from "./CollisionDetectionService";

const AVL_ID_MAP = {
  FUEL_LEVEL: "66",
  TOTAL_ODOMETER: "241",
  EVENT_IO_ID: "evt",
  IGNITION: "239",
  EXTERNAL_VOLTAGE: "67",
  SPEED: "37",
  TIMESTAMP: "ts",
  RPM: "36",
};

export interface ReportOptions {
  speedLimitKph: number;
  rapidAccelKph: number; // Speed increase threshold
  rapidAccelSeconds: number; // Time window for acceleration
  rapidDecelKph: number; // Speed decrease threshold
  rapidDecelSeconds: number; // Time window for deceleration
}

/**
 * The output structure for the main analytics summary.
 * This matches the "May Details" card in your UI.
 */
export interface AnalyticsSummary {
  totalDistanceKm: number;
  totalDrivingTimeSeconds: number;
  maxSpeedKph: number;
  averageMovingSpeedKph: number;
  averageRpm: number;
  speedingCount: number;
  speedingDistanceKm: number;
  rapidAccelCount: number;
  rapidDecelCount: number;
}

export interface DrivingSummary {
  totalDistanceKm: number;
  totalDrivingTimeSeconds: number;
  maxSpeedKph: number;
  averageMovingSpeedKph: number;
  averageRpm: number;
  speedingCount: number;
  speedingDistanceKm: number;
  rapidAccelCount: number;
  rapidDecelCount: number;
}

// This interface represents the summary of fuel consumption for a period.
// export interface FuelSummary {
//   totalFuelConsumedLiters: number;
//   totalDistanceKm: number;
//   mileageKmL: number;
// }

// Define the data structure for the report, now including all UI elements
export interface FuelSummary {
  totalFuelConsumedLiters: number;
  totalFuelRefueledLiters: number; // NEW: For the blue bars in the chart
  totalDistanceKm: number;
  mileageKmL: number;
  startingFuel: number; // NEW: For the "Fuel Usage" card
  endingFuel: number; // NEW: For the "Fuel Usage" card
}

// This is the final, combined data structure for each point in the report.
export interface CombinedAnalyticsPoint {
  label: string;
  driving_data: DrivingSummary | null;
  fuel_data: FuelSummary | null;
}

/**
 * The grouping type for chart data.
 */
export type ChartGroupingType = "daily" | "weekly" | "monthly";

/**
 * A single data point for the speed chart.
 */
export interface SpeedChartPoint {
  label: string; // e.g., "2023-05-26", "Week 21", "2023-05"
  maxSpeed: number;
  averageSpeed: number;
}

import {
  FuelLevelHistoryPoint,
  DailyConsumptionPoint,
  SpeedHistoryPoint,
  DailySpeedReportPoint,
} from "../types/AnalyticsDTO";
import {
  TelemetryData,
  TelemetryPayload,
  TirePressureDTO,
  PositionDTO,
  SpeedDTO,
  BatteryDTO,
  FuelLevelDTO,
  EngineRpmDTO,
  EngineOilTempDTO,
  CrashDetectionDTO,
  EngineLoadDTO,
  DtcDTO,
  PowerStatsDTO,
  TotalMileageDTO,
  VehicleHealthDTO,
  ApiResponse,
} from "../types";
// import appEmitter from "../utils/appEmitter";

import { TelemetryDTO } from "../types/TelemetryDTO";

import { mapTelemetry } from "../utils/mapTelemetry";
import { CustomError } from "../middleware/errorHandler";

export class TelemetryService {
  private collisionDetectionService: CollisionDetectionService;

  constructor() {
    this.collisionDetectionService = new CollisionDetectionService();
  }

  async ingestTelemetry(payload: TelemetryPayload): Promise<ApiResponse> {
    try {
      const { imei, payload: telemetryPayload } = payload;
      const reported = telemetryPayload.state.reported;

      const telemetryData: Partial<TelemetryData> = {
        imei,
        timestamp: reported.ts || Date.now(),
        tirePressure: this.toNumberSafe(reported.pr),
        speed: this.toNumberSafe(reported["24"] || reported.sp),
        latlng: reported.latlng,
        altitude: this.toNumberSafe(reported.alt),
        angle: this.toNumberSafe(reported.ang),
        satellites: this.toIntegerSafe(reported.sat),
        event: this.toIntegerSafe(reported.evt),
        battery: this.toNumberSafe(reported["67"]),
        fuelLevel: this.toNumberSafe(reported["48"]),
        engineRpm: this.toNumberSafe(reported["36"]),
        engineOilTemp: this.toNumberSafe(reported["58"]),
        crashDetection: this.toIntegerSafe(reported["247"]),
        engineLoad: this.toNumberSafe(reported["31"]),
        dtc: this.toIntegerSafe(reported["30"]),
        externalVoltage: this.toNumberSafe(reported["66"]),
        totalMileage: this.toNumberSafe(reported["16"]),
      };

      const telemetry = new Telemetry(telemetryData);
      await telemetry.save();

      // Check for collision events
      const collisionAlert =
        await this.collisionDetectionService.analyzeForCollision(
          payload.payload
        );

      return {
        success: true,
        message: "Telemetry data ingested successfully",
        data: { id: telemetry._id!.toString(), collisionAlert },
      };
    } catch (error) {
      throw new CustomError("Failed to ingest telemetry data", 500);
    }
  }
  // Get collision history for a device
  async getCollisionHistory(
    imei: string,
    limit: number = 10
  ): Promise<CollisionEvent[]> {
    try {
      return await this.collisionDetectionService.getRecentCollisions(
        imei,
        limit
      );
    } catch (error) {
      throw new CustomError("Failed to fetch collision history", 500);
    }
  }

  // 🟢 NEW: Get collision statistics
  async getCollisionStatistics(
    imei: string,
    days: number = 30
  ): Promise<{
    total: number;
    byDay: Array<{ date: string; count: number }>;
    bySeverity: { minor: number; moderate: number; severe: number };
  }> {
    try {
      return await this.collisionDetectionService.getCollisionStats(imei, days);
    } catch (error) {
      throw new CustomError("Failed to fetch collision statistics", 500);
    }
  }

  // 🟢 NEW: Update collision status
  async updateCollisionStatus(
    imei: string,
    collisionId: string,
    status: "confirmed" | "false_alarm",
    responseTime?: number
  ): Promise<void> {
    try {
      await this.collisionDetectionService.updateCollisionStatus(
        imei,
        collisionId,
        status,
        responseTime
      );
    } catch (error) {
      throw new CustomError("Failed to update collision status", 500);
    }
  }

  // 🟢 NEW: Enhanced crash detection method with more detailed information
  async getLatestCrashDetection(): Promise<CrashDetectionDTO | null> {
    try {
      const latest = await this.getLatestTelemetry();
      if (!latest) return null;

      const message = this.getCrashDetectionMessage(latest.crashDetection);
      const severity = this.getCrashSeverity(latest.crashDetection);

      return {
        id: latest.id!,
        crashDetection: latest.crashDetection || null,
        timestamp: latest.timestamp,
        message,
        severity,
        formattedTimestamp: this.formatTimestamp(latest.timestamp),
        requiresAction: severity === "severe" || severity === "moderate",
      };
    } catch (error) {
      throw new CustomError("Failed to fetch crash detection data", 500);
    }
  }

  private getCrashSeverity(
    crashDetection: number | undefined
  ): "none" | "minor" | "moderate" | "severe" {
    if (!crashDetection || crashDetection === 0) return "none";

    switch (crashDetection) {
      case 1:
      case 6:
        return "severe"; // Real crash detected
      case 4:
      case 5:
        return "moderate"; // Full crash trace
      case 2:
      case 3:
        return "minor"; // Limited crash trace
      default:
        return "minor";
    }
  }

  async getAllTelemetry(): Promise<TelemetryData[]> {
    try {
      const telemetries = await Telemetry.find().sort({ timestamp: -1 });
      return telemetries.map(this.mapToTelemetryData);
    } catch (error) {
      throw new CustomError("Failed to fetch telemetry data", 500);
    }
  }

  async getLatestTelemetry(): Promise<TelemetryData | null> {
    try {
      const latest = await Telemetry.findOne().sort({ timestamp: -1 });
      return latest ? this.mapToTelemetryData(latest) : null;
    } catch (error) {
      throw new CustomError("Failed to fetch latest telemetry", 500);
    }
  }

  async getDeviceLatestTelemetry(imei: string): Promise<TelemetryData | null> {
    try {
      // const latest = await Telemetry.findOne({ imei }).sort({ timestamp: -1 });
      // get last data by imei there's no timestamp field in Telemetry
      // sort by state.reported.ts
      const latest = await Telemetry.findOne({ imei }).sort({
        "state.reported.ts": -1,
      });

      return latest ? this.mapToTelemetryData(latest) : null;
    } catch (error) {
      throw new CustomError("Failed to fetch latest telemetry for device", 500);
    }
  }

  public async getFuelLevelHistory(
    imei: string,
    startDate: Date,
    endDate: Date
  ): Promise<FuelLevelHistoryPoint[]> {
    const fuelLevelKey = `state.reported.${AVL_ID_MAP.FUEL_LEVEL}`;

    // Find all telemetry records in the range that have a fuel level value
    const records = await Telemetry.find({
      imei,
      "state.reported.ts": {
        $gte: startDate.getTime(),
        $lte: endDate.getTime(),
      },
      [fuelLevelKey]: { $exists: true }, // Only get records where fuel data is present
    })
      .sort({ "state.reported.ts": 1 }) // Ensure chronological order
      .select({ "state.reported.ts": 1, [fuelLevelKey]: 1 }); // Optimize by fetching only needed fields

    if (!records || records.length === 0) {
      return [];
    }

    // Map the raw DB documents to our clean DTO
    return records.map((doc: any) => {
      const reported = doc?.state?.reported;
      const timestamp =
        typeof reported.ts === "object" ? reported.ts.$numberLong : reported.ts;
      const rawFuelLevel = reported[AVL_ID_MAP.FUEL_LEVEL];

      return {
        timestamp: new Date(Number(timestamp)).getTime(),
        // Assuming the value is in milliliters, convert to liters. Adjust if needed.
        fuelLevel: rawFuelLevel / 1000,
      };
    });
  }

  public async getSpeedHistory(
    imei: string,
    startDate: Date,
    endDate: Date
  ): Promise<SpeedHistoryPoint[]> {
    const speedKey = `state.reported.${AVL_ID_MAP.SPEED}`;
    const tsKey = "state.reported.ts";

    const records = await Telemetry.find({
      imei,
      [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
      [speedKey]: { $exists: true },
    })
      .sort({ [tsKey]: 1 })
      .select({ [tsKey]: 1, [speedKey]: 1 });

    if (!records || records.length === 0) {
      return [];
    }

    return records.map((doc: any) => {
      const reported = doc.state?.reported || {};
      const timestamp =
        typeof reported.ts === "object" ? reported.ts.$numberLong : reported.ts;

      return {
        timestamp: new Date(Number(timestamp)).getTime(),
        speed: reported[AVL_ID_MAP.SPEED],
      };
    });
  }

  public async getDailySpeedReport(
    imei: string,
    startDate: Date,
    endDate: Date,
    speedLimitKph: number = 120
  ): Promise<DailySpeedReportPoint[]> {
    const speedKey = `state.reported.${AVL_ID_MAP.SPEED}`;
    const tsKey = "state.reported.ts";

    const results = await Telemetry.aggregate([
      // 1. Filter for the right device, time range, and data presence
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [speedKey]: { $exists: true, $type: "number" },
        },
      },
      // 2. Group by day and collect all speeds for that day into an array
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: { $toDate: `$${tsKey}` },
            },
          },
          allSpeeds: { $push: `$${speedKey}` },
        },
      },
      // 3. Project the final calculated fields from the 'allSpeeds' array
      {
        $project: {
          _id: 0,
          date: "$_id",
          maxSpeed: { $max: "$allSpeeds" },
          // Filter for moving speeds ( > 0 ) and then average them
          averageMovingSpeed: {
            $avg: {
              $filter: {
                input: "$allSpeeds",
                as: "speed",
                cond: { $gt: ["$$speed", 0] },
              },
            },
          },
          // Filter for speeding incidents and count them
          speedingEventCount: {
            $size: {
              $filter: {
                input: "$allSpeeds",
                as: "speed",
                cond: { $gt: ["$$speed", speedLimitKph] },
              },
            },
          },
        },
      },
      // 4. Sort the final results by date
      { $sort: { date: 1 } },
    ]);

    // Clean up the numbers (rounding, handling nulls)
    return results.map((r) => ({
      ...r,
      maxSpeed: r.maxSpeed ? parseFloat(r.maxSpeed.toFixed(2)) : 0,
      averageMovingSpeed: r.averageMovingSpeed
        ? parseFloat(r.averageMovingSpeed.toFixed(2))
        : null,
    }));
  }

  public async getDailyFuelConsumption(
    imei: string,
    startDate: Date,
    endDate: Date
  ): Promise<DailyConsumptionPoint[]> {
    const fuelKey = `state.reported.${AVL_ID_MAP.FUEL_LEVEL}`;
    const odoKey = `state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`;
    const tsKey = "state.reported.ts";

    const results = await Telemetry.aggregate([
      // 1. Filter for the right device, time range, and for records that have the necessary data
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [fuelKey]: { $exists: true },
          [odoKey]: { $exists: true },
        },
      },
      // 2. Sort by time to get first/last values correctly
      { $sort: { [tsKey]: 1 } },
      // 3. Group by the day
      {
        $group: {
          _id: {
            // Grouping key
            $dateToString: {
              format: "%Y-%m-%d",
              date: { $toDate: `$${tsKey}` },
            },
          },
          // Get the first and last values for fuel and odometer for each day
          firstFuel: { $first: `$${fuelKey}` },
          lastFuel: { $last: `$${fuelKey}` },
          firstOdo: { $first: `$${odoKey}` },
          lastOdo: { $last: `$${odoKey}` },
        },
      },
      // 4. Calculate the consumption for each day
      {
        $project: {
          _id: 0, // Exclude the default _id field
          date: "$_id",
          distanceTraveledMeters: { $subtract: ["$lastOdo", "$firstOdo"] },
          // Convert from ml to Liters
          fuelConsumedLiters: {
            $divide: [{ $subtract: ["$firstFuel", "$lastFuel"] }, 1000],
          },
        },
      },
      // 5. Final calculations and formatting
      {
        $project: {
          date: 1,
          fuelConsumedLiters: 1,
          distanceTraveledKm: { $divide: ["$distanceTraveledMeters", 1000] },
          // Calculate L/100km, with checks to prevent division by zero or invalid data
          litersPer100Km: {
            $cond: {
              if: {
                $and: [
                  { $gt: ["$distanceTraveledMeters", 0] },
                  { $gt: ["$fuelConsumedLiters", 0] },
                ],
              },
              then: {
                $multiply: [
                  {
                    $divide: [
                      "$fuelConsumedLiters",
                      { $divide: ["$distanceTraveledMeters", 1000] },
                    ],
                  },
                  100,
                ],
              },
              else: null, // Return null if no distance or if refueling happened
            },
          },
        },
      },
      // 6. Sort the final results by date
      { $sort: { date: 1 } },
    ]);

    // Round the numbers for cleaner output
    return results.map((r) => ({
      ...r,
      litersPer100Km: r.litersPer100Km
        ? parseFloat(r.litersPer100Km.toFixed(2))
        : null,
      distanceTraveledKm: parseFloat(r.distanceTraveledKm.toFixed(2)),
      fuelConsumedLiters: parseFloat(r.fuelConsumedLiters.toFixed(2)),
    }));
  }

  async getTelemetryForUser(email: string): Promise<TelemetryData[]> {
    try {
      const devices = await Device.find({ user: email });
      const imeis = devices.map((device) => device.imei);

      if (imeis.length === 0) {
        return [];
      }

      const telemetries = await Telemetry.find({ imei: { $in: imeis } }).sort({
        timestamp: -1,
      });
      return telemetries.map(this.mapToTelemetryData);
    } catch (error) {
      throw new CustomError("Failed to fetch user telemetry", 500);
    }
  }

  async getLatestTirePressure(): Promise<TirePressureDTO | null> {
    try {
      const latest = await this.getLatestTelemetry();
      if (!latest) return null;

      const message =
        latest.tirePressure && latest.tirePressure > 0
          ? `Tire is down ${45 - latest.tirePressure} psi`
          : "Tire pressure not detected";

      return {
        id: latest.id!,
        tirePressure: latest.tirePressure || null,
        timestamp: latest.timestamp,
        message,
        formattedTimestamp: this.formatTimestamp(latest.timestamp),
      };
    } catch (error) {
      throw new CustomError("Failed to fetch tire pressure data", 500);
    }
  }

  async getLatestPosition(): Promise<PositionDTO | null> {
    try {
      const latest = await this.getLatestTelemetry();
      if (!latest) return null;

      const message = latest.latlng
        ? `Vehicle located at ${latest.latlng}`
        : "Position not available";

      return {
        id: latest.id!,
        latlng: latest.latlng || null,
        altitude: latest.altitude || null,
        angle: latest.angle || null,
        satellites: latest.satellites || null,
        timestamp: latest.timestamp,
        message,
        formattedTimestamp: this.formatTimestamp(latest.timestamp),
      };
    } catch (error) {
      throw new CustomError("Failed to fetch position data", 500);
    }
  }

  async getSpeedInfo(): Promise<SpeedDTO | null> {
    try {
      const latest = await this.getLatestTelemetry();
      if (!latest) return null;

      const message =
        latest.speed && latest.speed > 0
          ? `Car currently moving at ${latest.speed} m/s`
          : "Car is not moving";

      return {
        id: latest.id!,
        speed: latest.speed || null,
        timestamp: latest.timestamp,
        message,
      };
    } catch (error) {
      throw new CustomError("Failed to fetch speed data", 500);
    }
  }

  async getLatestBattery(): Promise<BatteryDTO | null> {
    try {
      const latest = await this.getLatestTelemetry();
      if (!latest) return null;

      const message =
        latest.battery && latest.battery > 0
          ? `Battery level is ${latest.battery * 0.001}v`
          : "Battery value not detected";

      return {
        id: latest.id!,
        battery: latest.battery || null,
        timestamp: latest.timestamp,
        message,
        formattedTimestamp: this.formatTimestamp(latest.timestamp),
      };
    } catch (error) {
      throw new CustomError("Failed to fetch battery data", 500);
    }
  }

  async getLatestFuelLevel(): Promise<FuelLevelDTO | null> {
    try {
      const latest = await this.getLatestTelemetry();
      if (!latest) return null;

      const message =
        latest.fuelLevel && latest.fuelLevel > 0
          ? `Fuel level is ${latest.fuelLevel}%`
          : "Fuel level not detected";

      return {
        id: latest.id!,
        fuelLevel: latest.fuelLevel || null,
        timestamp: latest.timestamp,
        message,
        formattedTimestamp: this.formatTimestamp(latest.timestamp),
      };
    } catch (error) {
      throw new CustomError("Failed to fetch fuel level data", 500);
    }
  }

  async getLatestEngineRpm(): Promise<EngineRpmDTO | null> {
    try {
      const latest = await this.getLatestTelemetry();
      if (!latest) return null;

      const message =
        latest.engineRpm && latest.engineRpm > 0
          ? `Engine RPM is ${latest.engineRpm} rpm`
          : "Engine rpm not detected";

      return {
        id: latest.id!,
        engineRpm: latest.engineRpm || null,
        timestamp: latest.timestamp,
        message,
        formattedTimestamp: this.formatTimestamp(latest.timestamp),
      };
    } catch (error) {
      throw new CustomError("Failed to fetch engine RPM data", 500);
    }
  }

  async getLatestEngineOilTemp(): Promise<EngineOilTempDTO | null> {
    try {
      const latest = await this.getLatestTelemetry();
      if (!latest) return null;

      const message =
        latest.engineOilTemp && latest.engineOilTemp > 0
          ? `Engine oil temperature is ${latest.engineOilTemp}°C`
          : "Engine oil temperature not detected";

      return {
        id: latest.id!,
        engineOilTemp: latest.engineOilTemp || null,
        timestamp: latest.timestamp,
        message,
        formattedTimestamp: this.formatTimestamp(latest.timestamp),
      };
    } catch (error) {
      throw new CustomError("Failed to fetch engine oil temperature data", 500);
    }
  }

  async getLatestEngineLoad(): Promise<EngineLoadDTO | null> {
    try {
      const latest = await this.getLatestTelemetry();
      if (!latest) return null;

      const message =
        latest.engineLoad && latest.engineLoad > 0
          ? `Engine load is ${latest.engineLoad}%`
          : "Engine load not detected";

      return {
        id: latest.id!,
        engineLoad: latest.engineLoad || null,
        timestamp: latest.timestamp,
        message,
        formattedTimestamp: this.formatTimestamp(latest.timestamp),
      };
    } catch (error) {
      throw new CustomError("Failed to fetch engine load data", 500);
    }
  }

  async getLatestDtc(): Promise<DtcDTO | null> {
    try {
      const latest = await this.getLatestTelemetry();
      if (!latest) return null;

      const message =
        latest.dtc && latest.dtc > 0
          ? `DTC Code: ${latest.dtc} – diagnostic trouble detected`
          : "No DTC (Diagnostic Trouble Code) detected";

      return {
        id: latest.id!,
        dtc: latest.dtc || null,
        timestamp: latest.timestamp,
        message,
        formattedTimestamp: this.formatTimestamp(latest.timestamp),
      };
    } catch (error) {
      throw new CustomError("Failed to fetch DTC data", 500);
    }
  }

  async getPowerStats(): Promise<PowerStatsDTO | null> {
    try {
      const latest = await this.getLatestTelemetry();
      if (!latest) return null;

      const externalVoltage = latest.externalVoltage
        ? latest.externalVoltage * 0.001
        : null;
      const batteryVoltage = latest.battery ? latest.battery * 0.001 : null;
      const batteryHealth = this.evaluateBatteryHealth(latest.externalVoltage);
      const message = `External Voltage: ${externalVoltage?.toFixed(2) || "N/A"} V, Battery Voltage: ${batteryVoltage?.toFixed(2) || "N/A"} V`;

      return {
        id: latest.id!,
        externalVoltage,
        batteryVoltage,
        timestamp: latest.timestamp,
        message,
        batteryHealth,
        formattedTimestamp: this.formatTimestamp(latest.timestamp),
      };
    } catch (error) {
      throw new CustomError("Failed to fetch power stats", 500);
    }
  }

  async getLatestTotalMileage(): Promise<TotalMileageDTO | null> {
    try {
      const latest = await this.getLatestTelemetry();
      if (!latest) return null;

      const message =
        latest.totalMileage && latest.totalMileage > 0
          ? `Total mileage recorded: ${latest.totalMileage} km`
          : "Total mileage not available";

      return {
        id: latest.id!,
        totalMileage: latest.totalMileage || null,
        timestamp: latest.timestamp,
        message,
        formattedTimestamp: this.formatTimestamp(latest.timestamp),
      };
    } catch (error) {
      throw new CustomError("Failed to fetch mileage data", 500);
    }
  }

  async getVehicleHealthStatus(): Promise<VehicleHealthDTO | null> {
    try {
      const latest = await this.getLatestTelemetry();
      if (!latest) return null;

      const dtc = latest.dtc ? latest.dtc.toString() : "None";
      const batteryVoltage = latest.externalVoltage
        ? latest.externalVoltage * 0.001
        : null;
      const batteryHealth = this.evaluateBatteryHealth(latest.externalVoltage);
      const engineHealth = this.evaluateEngineHealth(latest.engineRpm);

      return {
        dtc,
        mileage: latest.totalMileage || null,
        batteryVoltage,
        batteryHealth,
        engineRPM: latest.engineRpm || null,
        engineHealth,
      };
    } catch (error) {
      throw new CustomError("Failed to fetch vehicle health data", 500);
    }
  }

  async getCarState(imei: string): Promise<{
    state: "on" | "off";
    engineRpm?: number;
    speed?: number;
    timestamp?: number;
  }> {
    try {
      const latest = await Telemetry.findOne({ imei }).sort({ timestamp: -1 });
      if (!latest) return { state: "off" };
      const isOn =
        (latest.engineRpm && latest.engineRpm > 0) ||
        (latest.speed && latest.speed > 0);
      return {
        state: isOn ? "on" : "off",
        engineRpm: latest.engineRpm,
        speed: latest.speed,
        timestamp: latest.timestamp,
      };
    } catch (error) {
      throw new CustomError("Failed to fetch car state", 500);
    }
  }

  async getLocationHistory(
    imei: string,
    limit = 100
  ): Promise<
    Array<{
      latlng: string;
      timestamp: number;
      altitude?: number;
      angle?: number;
    }>
  > {
    try {
      const telemetries = await Telemetry.find({
        imei,
        latlng: { $exists: true, $ne: null },
      })
        .sort({ timestamp: -1 })
        .limit(limit);
      return telemetries.map((t) => ({
        latlng: t.latlng!,
        timestamp: t.timestamp,
        altitude: t.altitude,
        angle: t.angle,
      }));
    } catch (error) {
      throw new CustomError("Failed to fetch location history", 500);
    }
  }

  private mapToTelemetryData(telemetry: ITelemetry): TelemetryData {
    // console.log("Mapping telemetry data:", telemetry);

    // Step 1: Use the generic utility to get a flexible DTO
    const telemetryDto: TelemetryDTO = mapTelemetry(telemetry);

    // console.log("Mapped telemetry DTO:", telemetryDto);

    // Step 2: Validate the DTO to ensure it meets the stricter TelemetryData contract
    if (!telemetryDto.imei) {
      throw new Error(
        `Data integrity error: Telemetry record ${telemetry._id} is missing an IMEI.`
      );
    }
    if (telemetryDto.id === undefined) {
      telemetryDto.id = telemetry._id.toString();
    }

    // Step 3: Now that we've validated it, we can safely cast and return it as TelemetryData
    return telemetryDto as TelemetryData;
  }

  private toNumberSafe(value: any): number | undefined {
    if (value === null || value === undefined) return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  }

  private toIntegerSafe(value: any): number | undefined {
    if (value === null || value === undefined) return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : Math.floor(num);
  }

  private formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toISOString().replace("T", " ").substring(0, 19);
  }

  // Enhanced crash detection message method
  private getCrashDetectionMessage(crashDetection: number | undefined): string {
    if (!crashDetection || crashDetection === 0) return "No crash detected";

    switch (crashDetection) {
      case 1:
        return "🚨 REAL CRASH DETECTED (device calibrated) - Emergency response may be required";
      case 2:
        return "⚠️ Limited crash trace detected (device not calibrated)";
      case 3:
        return "⚠️ Limited crash trace detected (device calibrated)";
      case 4:
        return "🔶 Full crash trace detected (device not calibrated)";
      case 5:
        return "🔶 Full crash trace detected (device calibrated)";
      case 6:
        return "🚨 REAL CRASH DETECTED (device not calibrated) - Emergency response may be required";
      default:
        return `Unknown crash detection value: ${crashDetection}`;
    }
  }

  private evaluateBatteryHealth(externalVoltage: number | undefined): string {
    if (!externalVoltage) return "Unknown";
    const voltage = externalVoltage * 0.001;
    if (voltage >= 13.0) return "Good";
    if (voltage >= 12.4) return "Fair";
    return "Bad";
  }

  private evaluateEngineHealth(engineRpm: number | undefined): string {
    if (!engineRpm) return "Unknown";
    if (engineRpm < 600) return "Idle";
    if (engineRpm > 4000) return "High Load";
    return "Normal";
  }

  public async getAnalyticsSummary(
    imei: string,
    startDate: Date,
    endDate: Date,
    options: ReportOptions
  ): Promise<AnalyticsSummary | null> {
    const tsKey = `state.reported.${AVL_ID_MAP.TIMESTAMP}`;
    const speedKey = `state.reported.${AVL_ID_MAP.SPEED}`;
    const rpmKey = `state.reported.${AVL_ID_MAP.RPM}`;

    const pipeline: any[] = [
      // 1. Filter for the specific device, time range, and where speed data exists.
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [speedKey]: { $exists: true, $type: "number" },
        },
      },
      // 2. Sort documents by timestamp. This is CRITICAL for window functions.
      {
        $sort: { [tsKey]: 1 },
      },
      // 3. Use $setWindowFields to get the PREVIOUS speed and timestamp.
      // This lets us calculate deltas (change in time, speed, distance).
      {
        $setWindowFields: {
          partitionBy: "$imei",
          sortBy: { [tsKey]: 1 },
          output: {
            previousSpeed: {
              $shift: { output: `$${speedKey}`, by: -1, default: null },
            },
            previousTimestamp: {
              $shift: { output: `$${tsKey}`, by: -1, default: null },
            },
          },
        },
      },
      // 4. Calculate metrics for EACH telemetry point based on its previous point.
      {
        $addFields: {
          // Only perform calculations if we have a previous point
          timeDeltaSeconds: {
            $cond: {
              if: { $ne: ["$previousTimestamp", null] },
              then: {
                $divide: [
                  { $subtract: [`$${tsKey}`, "$previousTimestamp"] },
                  1000,
                ],
              },
              else: 0,
            },
          },
          speedDeltaKph: {
            $cond: {
              if: { $ne: ["$previousSpeed", null] },
              then: { $subtract: [`$${speedKey}`, "$previousSpeed"] },
              else: 0,
            },
          },
          // Distance for this segment using trapezoidal rule (more accurate)
          // Formula: avg_speed * time_delta
          distanceDeltaKm: {
            $cond: {
              if: { $ne: ["$previousTimestamp", null] },
              then: {
                $multiply: [
                  {
                    $divide: [{ $add: [`$${speedKey}`, "$previousSpeed"] }, 2],
                  }, // Avg Speed in km/h
                  {
                    $divide: [
                      // Time in hours
                      { $subtract: [`$${tsKey}`, "$previousTimestamp"] },
                      3600000, // ms in an hour
                    ],
                  },
                ],
              },
              else: 0,
            },
          },
        },
      },
      // 5. Add boolean flags for different event types to make grouping easier.
      {
        $addFields: {
          isMoving: { $gt: [`$${speedKey}`, 0] },
          isSpeeding: { $gt: [`$${speedKey}`, options.speedLimitKph] },
          isRapidAccel: {
            $and: [
              { $ne: ["$previousTimestamp", null] },
              { $gt: ["$speedDeltaKph", options.rapidAccelKph] },
              { $lte: ["$timeDeltaSeconds", options.rapidAccelSeconds] },
            ],
          },
          isRapidDecel: {
            $and: [
              { $ne: ["$previousTimestamp", null] },
              { $lt: ["$speedDeltaKph", -options.rapidDecelKph] }, // Note: negative delta
              { $lte: ["$timeDeltaSeconds", options.rapidDecelSeconds] },
            ],
          },
        },
      },
      // 6. Group all processed points into a single summary document.
      {
        $group: {
          _id: null,
          totalDistanceKm: { $sum: "$distanceDeltaKm" },
          totalDrivingTimeSeconds: {
            $sum: { $cond: ["$isMoving", "$timeDeltaSeconds", 0] },
          },
          maxSpeedKph: { $max: `$${speedKey}` },
          // Collect moving speeds and RPMs to average them correctly
          movingSpeeds: {
            $push: { $cond: ["$isMoving", `$${speedKey}`, "$$REMOVE"] },
          },
          movingRpms: {
            $push: { $cond: ["$isMoving", `$${rpmKey}`, "$$REMOVE"] },
          },
          speedingCount: { $sum: { $cond: ["$isSpeeding", 1, 0] } },
          speedingDistanceKm: {
            $sum: { $cond: ["$isSpeeding", "$distanceDeltaKm", 0] },
          },
          rapidAccelCount: { $sum: { $cond: ["$isRapidAccel", 1, 0] } },
          rapidDecelCount: { $sum: { $cond: ["$isRapidDecel", 1, 0] } },
        },
      },
      // 7. Project the final fields and perform final calculations.
      {
        $project: {
          _id: 0,
          totalDistanceKm: 1,
          totalDrivingTimeSeconds: 1,
          maxSpeedKph: 1,
          averageMovingSpeedKph: { $avg: "$movingSpeeds" },
          averageRpm: { $avg: "$movingRpms" },
          speedingCount: 1,
          speedingDistanceKm: 1,
          rapidAccelCount: 1,
          rapidDecelCount: 1,
        },
      },
    ];

    const results = await Telemetry.aggregate(pipeline);

    if (!results || results.length === 0) {
      return null; // No data found for the period
    }

    // Round the numbers for a clean output
    const summary = results[0];
    return {
      totalDistanceKm: parseFloat(summary.totalDistanceKm?.toFixed(2) ?? 0),
      totalDrivingTimeSeconds: Math.round(summary.totalDrivingTimeSeconds ?? 0),
      maxSpeedKph: parseFloat(summary.maxSpeedKph?.toFixed(2) ?? 0),
      averageMovingSpeedKph: parseFloat(
        summary.averageMovingSpeedKph?.toFixed(2) ?? 0
      ),
      averageRpm: Math.round(summary.averageRpm ?? 0),
      speedingCount: summary.speedingCount ?? 0,
      speedingDistanceKm: parseFloat(
        summary.speedingDistanceKm?.toFixed(2) ?? 0
      ),
      rapidAccelCount: summary.rapidAccelCount ?? 0,
      rapidDecelCount: summary.rapidDecelCount ?? 0,
    };
  }

  /**
   * Generates time-series data for a speed chart, grouped by a specified period.
   * This provides the data for the "Speed Report" chart in the UI.
   *
   * @param imei The device identifier.
   * @param startDate The start of the reporting period.
   * @param endDate The end of the reporting period.
   * @param type The grouping period: 'daily', 'weekly', or 'monthly'.
   * @returns A promise that resolves to an array of SpeedChartPoint objects.
   */
  public async getSpeedChartData(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType
  ): Promise<SpeedChartPoint[]> {
    const tsKey = `state.reported.${AVL_ID_MAP.TIMESTAMP}`;
    const speedKey = `state.reported.${AVL_ID_MAP.SPEED}`;

    let groupByFormat: string;
    switch (type) {
      case "weekly":
        groupByFormat = "%Y-%U"; // Year-WeekNumber (e.g., 2023-21)
        break;
      case "monthly":
        groupByFormat = "%Y-%m"; // Year-Month (e.g., 2023-05)
        break;
      case "daily":
      default:
        groupByFormat = "%Y-%m-%d"; // Year-Month-Day (e.g., 2023-05-26)
        break;
    }

    const results = await Telemetry.aggregate([
      // 1. Filter for the right device, time range, and data presence
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [speedKey]: { $exists: true, $type: "number" },
        },
      },
      // 2. Group by the specified date format
      {
        $group: {
          _id: {
            $dateToString: {
              format: groupByFormat,
              date: { $toDate: `$${tsKey}` },
            },
          },
          maxSpeed: { $max: `$${speedKey}` },
          // Filter for moving speeds (> 0) and then average them
          averageSpeed: {
            $avg: {
              $cond: [{ $gt: [`$${speedKey}`, 0] }, `$${speedKey}`, null],
            },
          },
        },
      },
      // 3. Project into the final format
      {
        $project: {
          _id: 0,
          label: "$_id",
          maxSpeed: { $ifNull: ["$maxSpeed", 0] },
          averageSpeed: { $ifNull: ["$averageSpeed", 0] },
        },
      },
      // 4. Sort the final results by label
      { $sort: { label: 1 } },
    ]);

    // Clean up the numbers
    return results.map((r) => ({
      ...r,
      maxSpeed: parseFloat(r.maxSpeed.toFixed(2)),
      averageSpeed: parseFloat(r.averageSpeed.toFixed(2)),
    }));
  }

  // public async getDetailedSummary(
  //   imei: string,
  //   startDate: Date,
  //   endDate: Date,
  //   type: ChartGroupingType,
  //   options: ReportOptions
  // ): Promise<DetailedAnalyticsPoint[]> {
  //   const tsKey = `state.reported.${AVL_ID_MAP.TIMESTAMP}`;
  //   const speedKey = `state.reported.${AVL_ID_MAP.SPEED}`;
  //   const rpmKey = `state.reported.${AVL_ID_MAP.RPM}`;

  //   let groupByFormat: string;
  //   switch (type) {
  //     case "weekly":
  //       groupByFormat = "%Y-%U"; // Year-WeekNumber (e.g., 2023-21)
  //       break;
  //     case "monthly":
  //       groupByFormat = "%Y-%m"; // Year-Month (e.g., 2023-05)
  //       break;
  //     case "daily":
  //     default:
  //       groupByFormat = "%Y-%m-%d"; // Year-Month-Day (e.g., 2023-05-26)
  //       break;
  //   }

  //   const pipeline: any[] = [
  //     // Steps 1-5: Calculate deltas and flags for EACH telemetry point.
  //     // This part is identical to the previous getAnalyticsSummary function.
  //     {
  //       $match: {
  //         imei,
  //         [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
  //         [speedKey]: { $exists: true, $type: "number" },
  //       },
  //     },
  //     { $sort: { [tsKey]: 1 } },
  //     {
  //       $setWindowFields: {
  //         partitionBy: "$imei",
  //         sortBy: { [tsKey]: 1 },
  //         output: {
  //           previousSpeed: {
  //             $shift: { output: `$${speedKey}`, by: -1, default: null },
  //           },
  //           previousTimestamp: {
  //             $shift: { output: `$${tsKey}`, by: -1, default: null },
  //           },
  //         },
  //       },
  //     },
  //     {
  //       $addFields: {
  //         timeDeltaSeconds: {
  //           $cond: {
  //             if: { $ne: ["$previousTimestamp", null] },
  //             then: {
  //               $divide: [
  //                 { $subtract: [`$${tsKey}`, "$previousTimestamp"] },
  //                 1000,
  //               ],
  //             },
  //             else: 0,
  //           },
  //         },
  //         speedDeltaKph: {
  //           $cond: {
  //             if: { $ne: ["$previousSpeed", null] },
  //             then: { $subtract: [`$${speedKey}`, "$previousSpeed"] },
  //             else: 0,
  //           },
  //         },
  //         distanceDeltaKm: {
  //           $cond: {
  //             if: { $ne: ["$previousTimestamp", null] },
  //             then: {
  //               $multiply: [
  //                 {
  //                   $divide: [{ $add: [`$${speedKey}`, "$previousSpeed"] }, 2],
  //                 },
  //                 {
  //                   $divide: [
  //                     { $subtract: [`$${tsKey}`, "$previousTimestamp"] },
  //                     3600000,
  //                   ],
  //                 },
  //               ],
  //             },
  //             else: 0,
  //           },
  //         },
  //       },
  //     },
  //     {
  //       $addFields: {
  //         isMoving: { $gt: [`$${speedKey}`, 0] },
  //         isSpeeding: { $gt: [`$${speedKey}`, options.speedLimitKph] },
  //         isRapidAccel: {
  //           $and: [
  //             { $ne: ["$previousTimestamp", null] },
  //             { $gt: ["$speedDeltaKph", options.rapidAccelKph] },
  //             { $lte: ["$timeDeltaSeconds", options.rapidAccelSeconds] },
  //           ],
  //         },
  //         isRapidDecel: {
  //           $and: [
  //             { $ne: ["$previousTimestamp", null] },
  //             { $lt: ["$speedDeltaKph", -options.rapidDecelKph] },
  //             { $lte: ["$timeDeltaSeconds", options.rapidDecelSeconds] },
  //           ],
  //         },
  //       },
  //     },

  //     // --- CRITICAL CHANGE HERE ---
  //     // 6. Group all points into BUCKETS (daily, weekly, or monthly) and calculate summaries for each bucket.
  //     {
  //       $group: {
  //         // Group by the selected date format instead of _id: null
  //         _id: {
  //           $dateToString: {
  //             format: groupByFormat,
  //             date: { $toDate: `$${tsKey}` },
  //             timezone: "UTC", // Specify timezone to avoid inconsistencies
  //           },
  //         },
  //         // The summary calculations are the same, but now they apply per-group.
  //         totalDistanceKm: { $sum: "$distanceDeltaKm" },
  //         totalDrivingTimeSeconds: {
  //           $sum: { $cond: ["$isMoving", "$timeDeltaSeconds", 0] },
  //         },
  //         maxSpeedKph: { $max: `$${speedKey}` },
  //         movingSpeeds: {
  //           $push: { $cond: ["$isMoving", `$${speedKey}`, "$$REMOVE"] },
  //         },
  //         movingRpms: {
  //           $push: { $cond: ["$isMoving", `$${rpmKey}`, "$$REMOVE"] },
  //         },
  //         speedingCount: { $sum: { $cond: ["$isSpeeding", 1, 0] } },
  //         speedingDistanceKm: {
  //           $sum: { $cond: ["$isSpeeding", "$distanceDeltaKm", 0] },
  //         },
  //         rapidAccelCount: { $sum: { $cond: ["$isRapidAccel", 1, 0] } },
  //         rapidDecelCount: { $sum: { $cond: ["$isRapidDecel", 1, 0] } },
  //       },
  //     },

  //     // 7. Project into the final desired shape for the API.
  //     {
  //       $project: {
  //         _id: 0,
  //         label: "$_id", // The date/week/month string
  //         summary: {
  //           // Nest all the details into a summary object
  //           totalDistanceKm: "$totalDistanceKm",
  //           totalDrivingTimeSeconds: "$totalDrivingTimeSeconds",
  //           maxSpeedKph: "$maxSpeedKph",
  //           averageMovingSpeedKph: { $avg: "$movingSpeeds" },
  //           averageRpm: { $avg: "$movingRpms" },
  //           speedingCount: "$speedingCount",
  //           speedingDistanceKm: "$speedingDistanceKm",
  //           rapidAccelCount: "$rapidAccelCount",
  //           rapidDecelCount: "$rapidDecelCount",
  //         },
  //       },
  //     },
  //     // 8. Sort the final report by the label (date/week/month).
  //     { $sort: { label: 1 } },
  //   ];

  //   const results = await Telemetry.aggregate(pipeline);

  //   if (!results || results.length === 0) {
  //     return []; // Return an empty array if no data
  //   }

  //   // Clean up numbers for each point in the report
  //   return results.map((point) => ({
  //     label: point.label,
  //     summary: {
  //       totalDistanceKm: parseFloat(
  //         point.summary.totalDistanceKm?.toFixed(2) ?? 0
  //       ),
  //       totalDrivingTimeSeconds: Math.round(
  //         point.summary.totalDrivingTimeSeconds ?? 0
  //       ),
  //       maxSpeedKph: parseFloat(point.summary.maxSpeedKph?.toFixed(2) ?? 0),
  //       averageMovingSpeedKph: parseFloat(
  //         point.summary.averageMovingSpeedKph?.toFixed(2) ?? 0
  //       ),
  //       averageRpm: Math.round(point.summary.averageRpm ?? 0),
  //       speedingCount: point.summary.speedingCount ?? 0,
  //       speedingDistanceKm: parseFloat(
  //         point.summary.speedingDistanceKm?.toFixed(2) ?? 0
  //       ),
  //       rapidAccelCount: point.summary.rapidAccelCount ?? 0,
  //       rapidDecelCount: point.summary.rapidDecelCount ?? 0,
  //     },
  //   }));
  // }

  public async getCombinedAnalyticsReport(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType,
    options: ReportOptions
  ): Promise<CombinedAnalyticsPoint[]> {
    // 1. Fetch both reports in parallel for maximum efficiency
    const [drivingReportMap, fuelReportMap] = await Promise.all([
      this._getDrivingBehaviorReport(imei, startDate, endDate, type, options),
      this._getFuelAnalyticsReport(imei, startDate, endDate, type),
    ]);

    // 2. Merge the two reports using their labels (dates/weeks/months) as keys
    const combinedReport = new Map<string, CombinedAnalyticsPoint>();

    // Add driving data to the map
    for (const [label, summary] of drivingReportMap.entries()) {
      combinedReport.set(label, {
        label,
        driving_data: summary,
        fuel_data: null,
      });
    }

    // Add/merge fuel data into the map
    for (const [label, summary] of fuelReportMap.entries()) {
      const existingEntry = combinedReport.get(label);
      if (existingEntry) {
        existingEntry.fuel_data = summary;
      } else {
        // This day has fuel data but no driving data (edge case)
        combinedReport.set(label, {
          label,
          driving_data: null,
          fuel_data: summary,
        });
      }
    }

    // 3. Convert the map back to a sorted array for the final response
    const finalReport = Array.from(combinedReport.values());
    finalReport.sort((a, b) => a.label.localeCompare(b.label));

    return finalReport;
  }

  // ===================================================================
  // MODULAR HELPER FUNCTIONS (PRIVATE)
  // ===================================================================

  /**
   * [PRIVATE] Generates a time-bucketed report for driving behavior.
   * Returns a Map for easy merging.
   */

  private async _getDrivingBehaviorReport(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType,
    options: ReportOptions
  ): Promise<Map<string, DrivingSummary>> {
    // Define keys for telemetry fields for maintainability
    const tsKey = `state.reported.${AVL_ID_MAP.TIMESTAMP}`;
    const speedKey = `state.reported.${AVL_ID_MAP.SPEED}`;
    const rpmKey = `state.reported.${AVL_ID_MAP.RPM}`;

    // Determine the date format string for the grouping stage
    let groupByFormat: string;
    switch (type) {
      case "weekly":
        groupByFormat = "%Y-%U"; // Year-WeekNumber (e.g., 2023-21)
        break;
      case "monthly":
        groupByFormat = "%Y-%m"; // Year-Month (e.g., 2023-05)
        break;
      case "daily":
      default:
        groupByFormat = "%Y-%m-%d"; // Year-Month-Day (e.g., 2023-05-26)
        break;
    }

    const pipeline: any[] = [
      // STAGE 1: Filter for the specific device, time range, and necessary data.
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [speedKey]: { $exists: true, $type: "number" },
        },
      },

      // STAGE 2: Sort documents by timestamp. This is CRITICAL for the next stage.
      { $sort: { [tsKey]: 1 } },

      // STAGE 3: Use $setWindowFields to get the PREVIOUS speed and timestamp.
      // This allows us to calculate deltas between consecutive points.
      {
        $setWindowFields: {
          partitionBy: "$imei",
          sortBy: { [tsKey]: 1 },
          output: {
            previousSpeed: {
              $shift: { output: `$${speedKey}`, by: -1, default: null },
            },
            previousTimestamp: {
              $shift: { output: `$${tsKey}`, by: -1, default: null },
            },
          },
        },
      },

      // STAGE 4: Calculate metrics for EACH telemetry point based on its previous point.
      {
        $addFields: {
          timeDeltaSeconds: {
            $cond: {
              if: { $ne: ["$previousTimestamp", null] },
              then: {
                $divide: [
                  { $subtract: [`$${tsKey}`, "$previousTimestamp"] },
                  1000,
                ],
              },
              else: 0,
            },
          },
          speedDeltaKph: {
            $cond: {
              if: { $ne: ["$previousSpeed", null] },
              then: { $subtract: [`$${speedKey}`, "$previousSpeed"] },
              else: 0,
            },
          },
          // Calculate distance for this segment using average speed (Trapezoidal rule)
          distanceDeltaKm: {
            $cond: {
              if: { $ne: ["$previousTimestamp", null] },
              then: {
                $multiply: [
                  {
                    $divide: [{ $add: [`$${speedKey}`, "$previousSpeed"] }, 2],
                  }, // Avg Speed in km/h
                  {
                    $divide: [
                      { $subtract: [`$${tsKey}`, "$previousTimestamp"] },
                      3600000,
                    ],
                  }, // Time in hours
                ],
              },
              else: 0,
            },
          },
        },
      },

      // STAGE 5: Add boolean flags for different event types to simplify grouping.
      {
        $addFields: {
          isMoving: { $gt: [`$${speedKey}`, 0] },
          isSpeeding: { $gt: [`$${speedKey}`, options.speedLimitKph] },
          isRapidAccel: {
            $and: [
              { $ne: ["$previousTimestamp", null] },
              { $gt: ["$speedDeltaKph", options.rapidAccelKph] },
              { $lte: ["$timeDeltaSeconds", options.rapidAccelSeconds] },
            ],
          },
          isRapidDecel: {
            $and: [
              { $ne: ["$previousTimestamp", null] },
              { $lt: ["$speedDeltaKph", -options.rapidDecelKph] }, // Note: negative delta
              { $lte: ["$timeDeltaSeconds", options.rapidDecelSeconds] },
            ],
          },
        },
      },

      // STAGE 6: Group all points into time BUCKETS and calculate summaries for each.
      {
        $group: {
          _id: {
            $dateToString: {
              format: groupByFormat,
              date: { $toDate: `$${tsKey}` },
              timezone: "UTC",
            },
          },
          totalDistanceKm: { $sum: "$distanceDeltaKm" },
          totalDrivingTimeSeconds: {
            $sum: { $cond: ["$isMoving", "$timeDeltaSeconds", 0] },
          },
          maxSpeedKph: { $max: `$${speedKey}` },
          // Collect moving speeds/RPMs into arrays to average them correctly in the next stage
          movingSpeeds: {
            $push: { $cond: ["$isMoving", `$${speedKey}`, "$$REMOVE"] },
          },
          movingRpms: {
            $push: { $cond: ["$isMoving", `$${rpmKey}`, "$$REMOVE"] },
          },
          speedingCount: { $sum: { $cond: ["$isSpeeding", 1, 0] } },
          speedingDistanceKm: {
            $sum: { $cond: ["$isSpeeding", "$distanceDeltaKm", 0] },
          },
          rapidAccelCount: { $sum: { $cond: ["$isRapidAccel", 1, 0] } },
          rapidDecelCount: { $sum: { $cond: ["$isRapidDecel", 1, 0] } },
        },
      },

      // STAGE 7: Project into the final shape, calculating averages from the arrays.
      {
        $project: {
          _id: 0,
          label: "$_id",
          summary: {
            totalDistanceKm: "$totalDistanceKm",
            totalDrivingTimeSeconds: "$totalDrivingTimeSeconds",
            maxSpeedKph: "$maxSpeedKph",
            averageMovingSpeedKph: { $avg: "$movingSpeeds" },
            averageRpm: { $avg: "$movingRpms" },
            speedingCount: "$speedingCount",
            speedingDistanceKm: "$speedingDistanceKm",
            rapidAccelCount: "$rapidAccelCount",
            rapidDecelCount: "$rapidDecelCount",
          },
        },
      },

      // STAGE 8: Sort the final report by the label (date/week/month).
      { $sort: { label: 1 } },
    ];

    const results = await Telemetry.aggregate(pipeline);

    // Map the results to the final Map<string, DrivingSummary> structure.
    const reportMap = new Map<string, DrivingSummary>();

    results.forEach((point) => {
      const summary = point.summary;
      reportMap.set(point.label, {
        totalDistanceKm: parseFloat(summary.totalDistanceKm?.toFixed(2) ?? 0),
        totalDrivingTimeSeconds: Math.round(
          summary.totalDrivingTimeSeconds ?? 0
        ),
        maxSpeedKph: parseFloat(summary.maxSpeedKph?.toFixed(2) ?? 0),
        averageMovingSpeedKph: parseFloat(
          summary.averageMovingSpeedKph?.toFixed(2) ?? 0
        ),
        averageRpm: Math.round(summary.averageRpm ?? 0),
        speedingCount: summary.speedingCount ?? 0,
        speedingDistanceKm: parseFloat(
          summary.speedingDistanceKm?.toFixed(2) ?? 0
        ),
        rapidAccelCount: summary.rapidAccelCount ?? 0,
        rapidDecelCount: summary.rapidDecelCount ?? 0,
      });
    });

    return reportMap;
  }

  // /**
  //  * [PRIVATE] Generates a time-bucketed report for fuel consumption and mileage.
  //  * Returns a Map for easy merging.
  //  */
  // private async _getFuelAnalyticsReport(
  //   imei: string,
  //   startDate: Date,
  //   endDate: Date,
  //   type: ChartGroupingType
  // ): Promise<Map<string, FuelSummary>> {
  //   // Define keys for telemetry fields
  //   const tsKey = `state.reported.${AVL_ID_MAP.TIMESTAMP}`;
  //   const speedKey = `state.reported.${AVL_ID_MAP.SPEED}`;
  //   const fuelKey = `state.reported.${AVL_ID_MAP.FUEL_LEVEL}`;

  //   // Determine the date format string for the grouping stage
  //   let groupByFormat: string;
  //   switch (type) {
  //     case "weekly":
  //       groupByFormat = "%Y-%U"; // Year-WeekNumber (e.g., 2023-21)
  //       break;
  //     case "monthly":
  //       groupByFormat = "%Y-%m"; // Year-Month (e.g., 2023-05)
  //       break;
  //     case "daily":
  //     default:
  //       groupByFormat = "%Y-%m-%d"; // Year-Month-Day (e.g., 2023-05-26)
  //       break;
  //   }

  //   const pipeline: any[] = [
  //     // STAGE 1: Filter for the device, time range, and essential data fields.
  //     {
  //       $match: {
  //         imei,
  //         [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
  //         [fuelKey]: { $exists: true, $type: "number" },
  //         [speedKey]: { $exists: true, $type: "number" },
  //       },
  //     },

  //     // STAGE 2: Sort documents by timestamp to process them in chronological order.
  //     { $sort: { [tsKey]: 1 } },

  //     // STAGE 3: Use $setWindowFields to get the PREVIOUS values for each field.
  //     {
  //       $setWindowFields: {
  //         partitionBy: "$imei",
  //         sortBy: { [tsKey]: 1 },
  //         output: {
  //           previousSpeed: {
  //             $shift: { output: `$${speedKey}`, by: -1, default: null },
  //           },
  //           previousTimestamp: {
  //             $shift: { output: `$${tsKey}`, by: -1, default: null },
  //           },
  //           previousFuel: {
  //             $shift: { output: `$${fuelKey}`, by: -1, default: null },
  //           },
  //         },
  //       },
  //     },

  //     // STAGE 4: Calculate deltas for distance and fuel for each segment.
  //     {
  //       $addFields: {
  //         // Calculate distance for this segment using average speed.
  //         distanceDeltaKm: {
  //           $cond: {
  //             if: { $ne: ["$previousTimestamp", null] },
  //             then: {
  //               $multiply: [
  //                 {
  //                   $divide: [{ $add: [`$${speedKey}`, "$previousSpeed"] }, 2],
  //                 },
  //                 {
  //                   $divide: [
  //                     { $subtract: [`$${tsKey}`, "$previousTimestamp"] },
  //                     3600000,
  //                   ],
  //                 },
  //               ],
  //             },
  //             else: 0,
  //           },
  //         },
  //         // Calculate fuel consumption. Ignore refills (where fuel level increases).
  //         // If (previousFuel - currentFuel) is negative, it's a refill, so consumption is 0.
  //         fuelDeltaLiters: {
  //           $cond: {
  //             if: { $ne: ["$previousFuel", null] },
  //             then: {
  //               $max: [0, { $subtract: ["$previousFuel", `$${fuelKey}`] }],
  //             },
  //             else: 0,
  //           },
  //         },
  //       },
  //     },

  //     // STAGE 5: Group the segments into time buckets (daily, weekly, monthly).
  //     {
  //       $group: {
  //         _id: {
  //           $dateToString: {
  //             format: groupByFormat,
  //             date: { $toDate: `$${tsKey}` },
  //             timezone: "UTC",
  //           },
  //         },
  //         totalFuelConsumedLiters: { $sum: "$fuelDeltaLiters" },
  //         totalDistanceKm: { $sum: "$distanceDeltaKm" },
  //       },
  //     },

  //     // STAGE 6: Project the final format and calculate mileage.
  //     {
  //       $project: {
  //         _id: 0,
  //         label: "$_id",
  //         totalFuelConsumedLiters: 1,
  //         totalDistanceKm: 1,
  //         // Calculate mileage (km/L), handling division by zero.
  //         mileageKmL: {
  //           $cond: {
  //             if: { $gt: ["$totalFuelConsumedLiters", 0] },
  //             then: {
  //               $divide: ["$totalDistanceKm", "$totalFuelConsumedLiters"],
  //             },
  //             else: 0,
  //           },
  //         },
  //       },
  //     },

  //     // STAGE 7: Sort the final report by the label (date/week/month).
  //     { $sort: { label: 1 } },
  //   ];

  //   const results = await Telemetry.aggregate(pipeline);

  //   // Map the results to the final Map<string, FuelSummary> structure.
  //   const reportMap = new Map<string, FuelSummary>();

  //   results.forEach((point) => {
  //     reportMap.set(point.label, {
  //       totalFuelConsumedLiters: parseFloat(
  //         point.totalFuelConsumedLiters?.toFixed(2) ?? 0
  //       ),
  //       totalDistanceKm: parseFloat(point.totalDistanceKm?.toFixed(2) ?? 0),
  //       mileageKmL: parseFloat(point.mileageKmL?.toFixed(2) ?? 0),
  //     });
  //   });

  //   return reportMap;
  // }

  // Assume Telemetry model and AVL_ID_MAP are defined elsewhere
  // e.g., import { Telemetry } from './telemetry.model';
  // e.g., import { AVL_ID_MAP, ChartGroupingType } from './constants';

  private async _getFuelAnalyticsReport(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType
  ): Promise<Map<string, FuelSummary>> {
    // Define keys for telemetry fields
    const tsKey = `state.reported.${AVL_ID_MAP.TIMESTAMP}`;
    const speedKey = `state.reported.${AVL_ID_MAP.SPEED}`;
    const fuelKey = `state.reported.${AVL_ID_MAP.FUEL_LEVEL}`; // Assumed to be in Liters

    // Determine the date format string for the grouping stage
    let groupByFormat: string;
    switch (type) {
      case "weekly":
        groupByFormat = "%Y-%U"; // Year-WeekNumber (e.g., 2023-21)
        break;
      case "monthly":
        groupByFormat = "%Y-%m"; // Year-Month (e.g., 2023-05)
        break;
      case "daily":
      default:
        groupByFormat = "%Y-%m-%d"; // Year-Month-Day (e.g., 2023-05-26)
        break;
    }

    const pipeline: any[] = [
      // STAGE 1: Filter for the device, time range, and essential data fields.
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [fuelKey]: { $exists: true, $type: "number" },
          [speedKey]: { $exists: true, $type: "number" },
        },
      },

      // STAGE 2: Sort documents by timestamp to process them in chronological order.
      { $sort: { [tsKey]: 1 } },

      // STAGE 3: Use $setWindowFields to get the PREVIOUS values for each field.
      {
        $setWindowFields: {
          partitionBy: "$imei",
          sortBy: { [tsKey]: 1 },
          output: {
            previousSpeed: {
              $shift: { output: `$${speedKey}`, by: -1, default: null },
            },
            previousTimestamp: {
              $shift: { output: `$${tsKey}`, by: -1, default: null },
            },
            previousFuel: {
              $shift: { output: `$${fuelKey}`, by: -1, default: null },
            },
          },
        },
      },

      // STAGE 4: Calculate deltas for distance, fuel consumed, and fuel refueled.
      {
        $addFields: {
          distanceDeltaKm: {
            $cond: {
              if: { $ne: ["$previousTimestamp", null] },
              then: {
                $multiply: [
                  {
                    $divide: [{ $add: [`$${speedKey}`, "$previousSpeed"] }, 2],
                  },
                  {
                    $divide: [
                      { $subtract: [`$${tsKey}`, "$previousTimestamp"] },
                      3600000,
                    ],
                  },
                ],
              },
              else: 0,
            },
          },
          fuelDeltaLiters: {
            // Fuel Consumption (drop in fuel level)
            $cond: {
              if: { $ne: ["$previousFuel", null] },
              then: {
                $max: [0, { $subtract: ["$previousFuel", `$${fuelKey}`] }],
              },
              else: 0,
            },
          },
          // --- NEW: Calculate fuel added (refueling) ---
          refuelDeltaLiters: {
            // Fuel Refill (increase in fuel level)
            $cond: {
              if: { $ne: ["$previousFuel", null] },
              then: {
                $max: [0, { $subtract: [`$${fuelKey}`, "$previousFuel"] }],
              },
              else: 0,
            },
          },
        },
      },

      // STAGE 5: Group the segments into time buckets (daily, weekly, monthly).
      {
        $group: {
          _id: {
            $dateToString: {
              format: groupByFormat,
              date: { $toDate: `$${tsKey}` },
              timezone: "UTC",
            },
          },
          totalFuelConsumedRaw: { $sum: "$fuelDeltaLiters" }, // In mL
          totalDistanceKm: { $sum: "$distanceDeltaKm" },
          totalFuelRefueledRaw: { $sum: "$refuelDeltaLiters" }, // In mL
          startingFuelRaw: { $first: `$${fuelKey}` }, // In mL
          endingFuelRaw: { $last: `$${fuelKey}` }, // In mL
        },
      },

      // STAGE 6: Project, Calculate, AND CONVERT units
      {
        $project: {
          _id: 0,
          label: "$_id",
          totalDistanceKm: 1,

          // *** FIX: Convert all raw fuel values from mL to Liters by dividing by 1000 ***
          totalFuelConsumedLiters: { $divide: ["$totalFuelConsumedRaw", 1000] },
          totalFuelRefueledLiters: { $divide: ["$totalFuelRefueledRaw", 1000] },
          startingFuel: { $divide: ["$startingFuelRaw", 1000] },
          endingFuel: { $divide: ["$endingFuelRaw", 1000] },

          // Mileage calculation now uses the CORRECTED fuel consumption in Liters
          mileageKmL: {
            $cond: {
              if: { $gt: ["$totalFuelConsumedRaw", 0] }, // Check against raw value to avoid float issues
              then: {
                $divide: [
                  "$totalDistanceKm",
                  { $divide: ["$totalFuelConsumedRaw", 1000] }, // Use the converted value here
                ],
              },
              else: 0,
            },
          },
        },
      },

      // STAGE 7: Sort the final report by the label (date/week/month).
      { $sort: { label: 1 } },
    ];

    const results = await Telemetry.aggregate(pipeline);

    // Map the results to the final Map<string, FuelSummary> structure.
    // The values from the pipeline are now already in the correct units.
    const reportMap = new Map<string, FuelSummary>();
    results.forEach((point) => {
      reportMap.set(point.label, {
        totalFuelConsumedLiters: parseFloat(
          point.totalFuelConsumedLiters?.toFixed(2) ?? 0
        ),
        totalFuelRefueledLiters: parseFloat(
          point.totalFuelRefueledLiters?.toFixed(2) ?? 0
        ),
        startingFuel: parseFloat(point.startingFuel?.toFixed(2) ?? 0),
        endingFuel: parseFloat(point.endingFuel?.toFixed(2) ?? 0),
        totalDistanceKm: parseFloat(point.totalDistanceKm?.toFixed(2) ?? 0),
        mileageKmL: parseFloat(point.mileageKmL?.toFixed(2) ?? 0),
      });
    });

    return reportMap;
  }
}
