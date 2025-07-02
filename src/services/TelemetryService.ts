import { Telemetry, ITelemetry } from "../models/Telemetry";
import { Device } from "../models/Device";
import { CollisionDetectionService, CollisionAlert, CollisionEvent } from "./CollisionDetectionService";


const AVL_ID_MAP = {
  FUEL_LEVEL: "66",
  TOTAL_ODOMETER: "241",
  EVENT_IO_ID: "evt",
  // Add other useful IDs here from your device manual
  IGNITION: "239",
  EXTERNAL_VOLTAGE: "67",
  SPEED: "37",
};

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
       const collisionAlert = await this.collisionDetectionService.analyzeForCollision(payload.payload);
      

      return {
        success: true,
        message: "Telemetry data ingested successfully",
        data: { id: telemetry._id!.toString(),
        collisionAlert
        },
        
      };
    } catch (error) {
      throw new CustomError("Failed to ingest telemetry data", 500);
    }
  }
  // Get collision history for a device
  async getCollisionHistory(imei: string, limit: number = 10): Promise<CollisionEvent[]> {
    try {
      return await this.collisionDetectionService.getRecentCollisions(imei, limit);
    } catch (error) {
      throw new CustomError("Failed to fetch collision history", 500);
    }
  }

  // 🟢 NEW: Get collision statistics
  async getCollisionStatistics(imei: string, days: number = 30): Promise<{
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
    status: 'confirmed' | 'false_alarm',
    responseTime?: number
  ): Promise<void> {
    try {
      await this.collisionDetectionService.updateCollisionStatus(imei, collisionId, status, responseTime);
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
        requiresAction: severity === 'severe' || severity === 'moderate'
      };
    } catch (error) {
      throw new CustomError("Failed to fetch crash detection data", 500);
    }
  }

  private getCrashSeverity(crashDetection: number | undefined): 'none' | 'minor' | 'moderate' | 'severe' {
    if (!crashDetection || crashDetection === 0) return 'none';

    switch (crashDetection) {
      case 1:
      case 6:
        return 'severe'; // Real crash detected
      case 4:
      case 5:
        return 'moderate'; // Full crash trace
      case 2:
      case 3:
        return 'minor'; // Limited crash trace
      default:
        return 'minor';
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
      const reported = doc.state.reported;
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
}
