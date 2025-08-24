import { Telemetry, ITelemetry } from "../models/Telemetry";
import { Device } from "../models/Device";
import {
  CollisionDetectionService,
  CollisionAlert,
  CollisionEvent,
} from "./CollisionDetectionService";



// Based on your sample data, fuel level appears to be percentage
const FUEL_UNIT = 'percentage'; // or 'liters' or 'milliliters'

// Adjust conversion accordingly
const convertFuelValue = (value : number, unit : string) : number => {
  switch(unit) {
    case 'percentage': return value; // Keep as percentage
    case 'milliliters': return value / 1000; // Convert to liters
    case 'liters': return value; // Already in liters
    default: return value;
  }
};
type MongoAggregationPipeline = any[];

export const AVL_ID_MAP = {
  RPM: "36",

  // --- OBD & Vehicle Parameters ---
  TOTAL_ODOMETER: 16,
  DTC_COUNT: 30, // Number of Diagnostic Trouble Codes
  ENGINE_LOAD: 31,
  COOLANT_TEMPERATURE: 32, // in Celsius
  SHORT_FUEL_TRIM: 33, // as a percentage
  ENGINE_RPM: 36,
  SPEED: 37, // OBD reported speed in Kph
  // VEHICLE_SPEED: 37, // OBD reported speed in Kph
  TIMING_ADVANCE: 38,
  INTAKE_AIR_TEMPERATURE: 39,
  RUNTIME_SINCE_ENGINE_START: 42, // in Seconds
  DISTANCE_TRAVELED_MIL_ON: 43, // MIL = Malfunction Indicator Lamp
  FUEL_RAIL_PRESSURE: 45, // in kPa
  FUEL_LEVEL: 48, // Can be percentage or raw value (e.g., Liters, mL)
  DISTANCE_SINCE_CODES_CLEAR: 49,
  BAROMETRIC_PRESSURE: 50, // in kPa
  CONTROL_MODULE_VOLTAGE: 51, // in Millivolts (mV)
  ABSOLUTE_LOAD_VALUE: 52,
  AMBIENT_AIR_TEMPERATURE: 53,
  OBD_OEM_TOTAL_MILEAGE: 389,
  COMMANDED_EQUIVALENCE_RATIO: 541,
  FUEL_TYPE: 759,

  // --- Device & Power Parameters ---
  EXTERNAL_VOLTAGE: 66, // Vehicle battery voltage in Millivolts (mV)
  BATTERY_VOLTAGE: 67, // Device internal battery voltage in Millivolts (mV)
  BATTERY_CURRENT: 68,
  CONTROL_MODULE_VOLTAGE_ALIAS: 13986, // Note: your sample shows 51: 13986, which is unusual. This is likely an error in the sample. I will use 51.

  // --- GNSS (GPS) Parameters ---
  GNSS_STATUS: 69,
  GNSS_PDOP: 181, // Position Dilution of Precision
  GNSS_HDOP: 182, // Horizontal Dilution of Precision
  SATELLITES: "sat",
  LAT_LNG: "latlng",
  ALTITUDE: "alt",
  ANGLE: "ang",
  // SPEED: "sp", // GPS reported speed, often in Kph

  // --- Network & Device Status ---
  GSM_SIGNAL: 21, // Scale 1-5
  IGNITION: 239, // 1 for ON, 0 for OFF
  MOVEMENT: 240, // 1 for MOVING, 0 for STOPPED
  SLEEP_MODE: 200,
  ACTIVE_GSM_OPERATOR: 241,

  // --- Other Root-Level Parameters ---
  TIMESTAMP: "ts",
  EVENT_ID: "evt",
  TYRE_PRESSURE: "pr",
  VIN: 256, // Vehicle Identification Number
};

export interface DTCFaultData {
  faultId: string;
  timestamp: string;
  dtcCount: number;
  suspectedCode: string;      // e.g., "P0217"
  description: string;        // e.g., "Engine Overheating"
  severity: string;          // CRITICAL, HIGH, MEDIUM, LOW
  location: string;          // GPS coordinates
  symptoms: string[];        // Array of symptoms
  milDistance: number;       // Distance with MIL on
  isActive: boolean;
}

export interface EngineHealthData {
  date: string;
  ignitionStatus: string;        // "ON" or "OFF"
  engineStatus: string;          // "ON" or "OFF" - current engine status
  avgRpm: number;               // Average RPM
  temperature: number;          // Coolant temperature in °C
  oilLevel: string;             // "NORMAL", "LOW", "CRITICAL"
  speed: number;                // Current speed in km/h
  activeFaults: number;         // Number of active DTCs
  dtcFaults: DTCFaultData[];
  hasData: boolean;
}


export interface DailyTirePressureData {
  date: string;
  dayName: string;
  dayOfWeek: number;
  chartLabel: string;
  distanceCovered: number;
  mainPressure: number;
  startLocation: string;  
  endLocation: string; 
  hasData: boolean;
}

export interface TripPressureData {
  tripId: string;
  startTime: string;
  endTime: string;
  startLocation: string;
  endLocation: string;
  startPressure: number;
  endPressure: number;
  pressureChange: number;
  distanceKm: number;
  duration: number; // minutes
  pressureVariations: PressureVariation[];
}

export interface PressureVariation {
  time: string;
  pressure: number;
  location: string;
}

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

export interface BatterySummary {
  startingVoltage: number;
  endingVoltage: number;
  minVoltage: number;
  maxVoltage: number;
  averageVoltage: number;
}

// This interface represents the summary of fuel consumption for a period.
// export interface FuelSummary {
//   : number;
//   totalDistanceKm: number;
//   mileageKmL: number;
// }

// Define the data structure for the report, now including all UI elements
export interface FuelSummary {
  startingFuelPercent: number;
  endingFuelPercent: number;
  currentFuelLevel: number;           // NEW: Current fuel level %
  currentFuelLiters: number;          // NEW: Current fuel level in liters
  startingFuelLiters: number;
  endingFuelLiters: number;
  totalFuelConsumedLiters: number;
  estimatedFuelUsed: number;          // NEW: For UI display (9.2L)
  totalFuelRefueledLiters: number;
  totalDistanceKm: number;
  mileageKmL: number;
  fuelEfficiencyL100km: number;
  currentIgnitionStatus: number;      // NEW: 1 = ON, 0 = OFF
  ignitionStatusText: string;         // NEW: "ON" or "OFF"
  refuelOccurred: boolean;
  lastUpdateTime: number;             // NEW: Timestamp of last update
  dataQuality: number;
}

export interface DailyFuelBarChartData {
  date: string;                      // "2024-01-15"
  dayName: string;                   // "Monday"
  dayOfWeek: number;                 // 1-7 (1=Sunday)
  chartLabel: string;                // "Monday" (simplified)
  totalFuelConsumedLiters: number;   // For red bars
  totalFuelRefueledLiters: number;   // For blue bars
  hasData: boolean;  
}

// This is the final, combined data structure for each point in the report.
export interface CombinedAnalyticsPoint {
  label: string;
  driving_data: DrivingSummary | null;
  fuel_data: FuelSummary | null;
  battery_data: BatterySummary | null;
  fuel_chart_data: DailyFuelBarChartData | null;
  tire_pressure_data: DailyTirePressureData | null;
  engine_health_data: EngineHealthData | null;
}

interface EnhancedFuelReading {
  timestamp: number;          // Standardized Unix timestamp in milliseconds
  date: Date;                 // JavaScript Date object for easier manipulation
  fuelLevel: number;          // Fuel level percentage (0-100)
  fuelLiters: number;         // Calculated fuel in liters
  odometer: number;           // Odometer reading in meters
  speed: number;              // Speed in km/h
  rpm: number;                // Engine RPM
  ignition: number;           // 1 = ON, 0 = OFF
  movement: number;           // 1 = MOVING, 0 = STOPPED
  isEngineActive: boolean;    // Derived from ignition, movement, speed, RPM
  location?: string;          // GPS coordinates if available
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

      // Calculate engine status based on ignition, RPM, and speed
      const ignitionStatus = reported["239"]; // AVL ID 239 for ignition
      const engineRpm = this.toNumberSafe(reported["36"]);
      const speed = this.toNumberSafe(reported["24"] || reported.sp);
      
      let engineStatus: "ON" | "OFF" = "OFF";
      if (ignitionStatus === 1 || (engineRpm && engineRpm > 0) || (speed && speed > 0)) {
        engineStatus = "ON";
      }

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
        engineStatus,
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
        timestamp: -1,
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
  const odometerKey = `state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`; 

    const pipeline: MongoAggregationPipeline = [
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
              if: { $ne: ["$previousOdometer", null] },
              then: {
                $divide: [
                  { $subtract: [`$${odometerKey}`, "$previousOdometer"] },
                  1000 // Convert meters to km if needed
                ]
              },
              else: 0
            }
          }
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


  public async getCombinedAnalyticsReport(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType,
    options: ReportOptions
  ): Promise<CombinedAnalyticsPoint[]> {
    // 1. Fetch both reports in parallel for maximum efficiency
    const [drivingReportMap, fuelReportMap, batteryReportMap, fuelBarChartMap, tirePressureMap, engineHealthMap] =
      await Promise.all([
        this._getDrivingBehaviorReport(imei, startDate, endDate, type, options),
        this._getFuelAnalyticsReport(imei, startDate, endDate, type),
        this._getBatteryAnalyticsReport(imei, startDate, endDate, type),
        this._getDailyFuelBarChartData(imei, startDate, endDate, type),
        this._getDailyTirePressureData(imei, startDate, endDate, type),
        this._getEngineHealthData(imei, startDate, endDate, type),
      ]);

    // 2. Merge the two reports using their labels (dates/weeks/months) as keys
    const combinedReport = new Map<string, CombinedAnalyticsPoint>();

    // Add driving data to the map
    for (const [label, summary] of drivingReportMap.entries()) {
      combinedReport.set(label, {
        label,
        driving_data: summary,
        fuel_data: null,
        battery_data: null,
        fuel_chart_data: null,
        tire_pressure_data: null,
        engine_health_data: null, 
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
          battery_data: null,
          fuel_chart_data: null,
          tire_pressure_data: null,
          engine_health_data: null, 
        });
      }
    }

    // Add/merge battery data into the map
    for (const [label, summary] of batteryReportMap.entries()) {
      const existingEntry = combinedReport.get(label);
      if (existingEntry) {
        existingEntry.battery_data = summary;
      } else {
        // This day has battery data but no driving or fuel data (edge case)
        combinedReport.set(label, {
          label,
          driving_data: null,
          fuel_data: null,
          battery_data: summary,
        fuel_chart_data: null,
        tire_pressure_data: null,
        engine_health_data: null, 
        });
      }
    }

    for (const [label, summary] of fuelBarChartMap.entries()) {
      const existingEntry = combinedReport.get(label);
      if (existingEntry) {
        existingEntry.fuel_chart_data = summary;
      } else {
        combinedReport.set(label, {
          label,
          driving_data: null,
          fuel_data: null,
          battery_data: null,
          fuel_chart_data: summary,
          tire_pressure_data: null,
          engine_health_data: null, 
        });
      }
    }

    for (const [label, summary] of tirePressureMap.entries()) {
      const existingEntry = combinedReport.get(label);
      if (existingEntry) {
        existingEntry.tire_pressure_data = summary;
      } else {
        combinedReport.set(label, {
          label,
          driving_data: null,
          fuel_data: null,
          battery_data: null,
          fuel_chart_data: null,
          tire_pressure_data: summary,
          engine_health_data: null, 
        });
      }
    }

    for (const [label, summary] of engineHealthMap.entries()) {
      const existingEntry = combinedReport.get(label);
      if (existingEntry) {
        existingEntry.engine_health_data = summary;
      } else {
        combinedReport.set(label, {
          label,
          driving_data: null,
          fuel_data: null,
          battery_data: null,
          fuel_chart_data: null,
          tire_pressure_data: null,
          engine_health_data: summary,
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


  private async _getEngineHealthData(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType
  ): Promise<Map<string, EngineHealthData>> {
    
    const tsKey = `state.reported.ts`;
    const ignitionKey = `state.reported.${AVL_ID_MAP.IGNITION}`;
    const rpmKey = `state.reported.${AVL_ID_MAP.ENGINE_RPM}`;
    const tempKey = `state.reported.${AVL_ID_MAP.COOLANT_TEMPERATURE}`;
    const speedKey = `state.reported.${AVL_ID_MAP.SPEED}`;
    const dtcKey = `state.reported.${AVL_ID_MAP.DTC_COUNT}`;
  
    // First, get the latest telemetry record to determine current status
    const latestTelemetry = await Telemetry.findOne({ imei })
      .sort({ [tsKey]: -1 })
      .select({
        [tsKey]: 1,
        [rpmKey]: 1,
        [speedKey]: 1,
        [tempKey]: 1,
        [dtcKey]: 1,
        [ignitionKey]: 1
      });
    
    // Determine current ignition status based on latest data
    let currentIgnitionStatus = "OFF";
    if (latestTelemetry) {
      const reported = latestTelemetry.state?.reported;
      const currentRpm = reported?.[AVL_ID_MAP.ENGINE_RPM];
      const currentSpeed = reported?.[AVL_ID_MAP.SPEED];
      const currentIgnition = reported?.[AVL_ID_MAP.IGNITION];
      
      if (currentIgnition === 1 || (currentRpm && currentRpm > 0) || (currentSpeed && currentSpeed > 0)) {
        currentIgnitionStatus = "ON";
      }
    }
  
    // Now get historical data for analytics
    const pipeline: any[] = [
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [rpmKey]: { $exists: true },
          [tempKey]: { $exists: true },
          [speedKey]: { $exists: true },
          [dtcKey]: { $exists: true }
        }
      },
      
      {
        $group: {
          _id: null, // Single group for today
          currentSpeed: { $first: `$${speedKey}` },
          currentTemp: { $first: `$${tempKey}` },
          activeFaults: { $first: `$${dtcKey}` },
          avgRpm: { $avg: `$${rpmKey}` },
          readingCount: { $sum: 1 }
        }
      },
      
      {
        $project: {
          _id: 0,
          avgRpm: { $round: ["$avgRpm", 0] },
          temperature: "$currentTemp",
          speed: "$currentSpeed",
          activeFaults: "$activeFaults",
          oilLevel: {
            $cond: {
              if: { $gt: ["$activeFaults", 0] },
              then: "CHECK_REQUIRED",
              else: "NORMAL"
            }
          },
          hasData: { $gt: ["$readingCount", 0] }
        }
      }
    ];
  
    const results = await Telemetry.aggregate(pipeline);
    
    const reportMap = new Map<string, EngineHealthData>();
    const today = new Date().toISOString().split('T')[0]!;
    
    if (results.length > 0) {
      const data = results[0];
      reportMap.set(today, {
        date: today,
        ignitionStatus: currentIgnitionStatus, // Use the current status we determined
        engineStatus: currentIgnitionStatus, // Use the same current status for engine status
        avgRpm: data.avgRpm,
        temperature: data.temperature,
        oilLevel: data.oilLevel,
        speed: data.speed,
        activeFaults: data.activeFaults,
        dtcFaults: [],
        hasData: data.hasData
      });
    }
  
    return reportMap;
  }

  private async _getActiveDTCs(
    imei: string,
    startDate: Date,
    endDate: Date
  ): Promise<DTCFaultData[]> {
    
    const tsKey = `state.reported.ts`;
    const dtcCountKey = `state.reported.${AVL_ID_MAP.DTC_COUNT}`;
    const milKey = `state.reported.${AVL_ID_MAP.DISTANCE_TRAVELED_MIL_ON}`;
    const engineLoadKey = `state.reported.${AVL_ID_MAP.ENGINE_LOAD}`;
    const coolantTempKey = `state.reported.${AVL_ID_MAP.COOLANT_TEMPERATURE}`;
    const fuelTrimKey = `state.reported.${AVL_ID_MAP.SHORT_FUEL_TRIM}`;
    const locationKey = `state.reported.latlng`;
  
    const pipeline: any[] = [
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [dtcCountKey]: { $gt: 0 }, // Only records with active DTCs
        }
      },
      
      { $sort: { [tsKey]: -1 } },
      
      {
        $project: {
          _id: 0,
          timestamp: `$${tsKey}`,
          dtcCount: `$${dtcCountKey}`,
          milDistance: `$${milKey}`,
          engineLoad: `$${engineLoadKey}`,
          coolantTemp: `$${coolantTempKey}`,
          fuelTrim: `$${fuelTrimKey}`,
          location: `$${locationKey}`,
          
          // Analyze symptoms to guess fault type
          suspectedFault: {
            $switch: {
              branches: [
                {
                  case: { $gt: [`$${coolantTempKey}`, 105] },
                  then: "COOLING_SYSTEM"
                },
                {
                  case: { $gt: [{ $abs: `$${fuelTrimKey}` }, 15] },
                  then: "FUEL_SYSTEM"
                },
                {
                  case: { $gt: [`$${engineLoadKey}`, 85] },
                  then: "ENGINE_PERFORMANCE"
                }
              ],
              default: "UNKNOWN"
            }
          }
        }
      }
    ];
  
    const results = await Telemetry.aggregate(pipeline);
    
    return results.map((fault, index) => ({
      faultId: `DTC_${Date.now()}_${index}`,
      timestamp: new Date(fault.timestamp).toISOString(),
      dtcCount: fault.dtcCount,
      suspectedCode: this._generateSuspectedCode(fault.suspectedFault),
      description: this._getFaultDescription(fault.suspectedFault),
      severity: this._getSeverityLevel(fault),
      location: fault.location,
      symptoms: this._analyzeSymptoms(fault),
      milDistance: fault.milDistance,
      isActive: true
    }));
  }

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


  private async _getDailyTirePressureData(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType
  ): Promise<Map<string, DailyTirePressureData>> {
    
    const tsKey = `state.reported.ts`;
    const pressureKey = `state.reported.${AVL_ID_MAP.TYRE_PRESSURE}`;
    const ignitionKey = `state.reported.${AVL_ID_MAP.IGNITION}`;
    const odometerKey = `state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`;
    const locationKey = `state.reported.latlng`;
  
    let groupByFormat: string;
    switch (type) {
      case "weekly": groupByFormat = "%Y-%U"; break;
      case "monthly": groupByFormat = "%Y-%m"; break;
      case "daily":
      default: groupByFormat = "%Y-%m-%d"; break;
    }
  
    const pipeline: any[] = [
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [pressureKey]: { $exists: true, $type: "number" },
          [ignitionKey]: { $exists: true },
          [odometerKey]: { $exists: true },
          [locationKey]: { $exists: true }
        },
      },
  
      { $sort: { [tsKey]: 1 } },
  
      // Add trip detection using ignition and movement
      {
        $setWindowFields: {
          partitionBy: "$imei",
          sortBy: { [tsKey]: 1 },
          output: {
            previousIgnition: {
              $shift: { output: `$${ignitionKey}`, by: -1, default: null }
            },
            previousOdometer: {
              $shift: { output: `$${odometerKey}`, by: -1, default: null }
            }
          }
        }
      },
  
      // Identify trip starts and ends
      {
        $addFields: {
          isTripStart: {
            $and: [
              { $eq: [`$${ignitionKey}`, 1] },
              { $or: [
                { $eq: ["$previousIgnition", null] },
                { $eq: ["$previousIgnition", 0] }
              ]}
            ]
          },
          isTripEnd: {
            $and: [
              { $eq: [`$${ignitionKey}`, 0] },
              { $eq: ["$previousIgnition", 1] }
            ]
          }
        }
      },
  
      // Group by day and collect trip data
      {
        $group: {
          _id: {
            day: {
              $dateToString: {
                format: groupByFormat,
                date: { $toDate: `$${tsKey}` },
                timezone: "UTC"
              }
            },
            dayOfWeek: {
              $dayOfWeek: { $toDate: `$${tsKey}` }
            }
          },
          
          // Pressure statistics
          avgPressure: { $avg: `$${pressureKey}` },
          minPressure: { $min: `$${pressureKey}` },
          maxPressure: { $max: `$${pressureKey}` },
          
          // Trip data
          tripStarts: {
            $push: {
              $cond: [
                "$isTripStart",
                {
                  time: `$${tsKey}`,
                  pressure: `$${pressureKey}`,
                  location: `$${locationKey}`,
                  odometer: `$${odometerKey}`
                },
                "$$REMOVE"
              ]
            }
          },
          
          tripEnds: {
            $push: {
              $cond: [
                "$isTripEnd",
                {
                  time: `$${tsKey}`,
                  pressure: `$${pressureKey}`,
                  location: `$${locationKey}`,
                  odometer: `$${odometerKey}`
                },
                "$$REMOVE"
              ]
            }
          },
          
          // All pressure readings for variations
          allReadings: {
            $push: {
              time: `$${tsKey}`,
              pressure: `$${pressureKey}`,
              location: `$${locationKey}`,
              odometer: `$${odometerKey}`,
              ignition: `$${ignitionKey}`
            }
          }
        }
      },
  
      // Process trips and calculate metrics
      {
        $addFields: {
          dayName: {
            $switch: {
              branches: [
                { case: { $eq: ["$_id.dayOfWeek", 1] }, then: "Sunday" },
                { case: { $eq: ["$_id.dayOfWeek", 2] }, then: "Monday" },
                { case: { $eq: ["$_id.dayOfWeek", 3] }, then: "Tuesday" },
                { case: { $eq: ["$_id.dayOfWeek", 4] }, then: "Wednesday" },
                { case: { $eq: ["$_id.dayOfWeek", 5] }, then: "Thursday" },
                { case: { $eq: ["$_id.dayOfWeek", 6] }, then: "Friday" },
                { case: { $eq: ["$_id.dayOfWeek", 7] }, then: "Saturday" }
              ],
              default: "Unknown"
            }
          },
          
          // Count pressure drops (pressure decrease > 2)
          pressureDrops: {
            $size: {
              $filter: {
                input: "$allReadings",
                cond: {
                  $and: [
                    { $gt: ["$$this.pressure", 0] },
                    { $lt: ["$$this.pressure", { $subtract: ["$maxPressure", 2] }] }
                  ]
                }
              }
            }
          }
        }
      },
  
      {
        $project: {
          _id: 0,
          date: "$_id.day",
          dayName: 1,
          dayOfWeek: "$_id.dayOfWeek",
          allReadings: 1,
          hasData: { $gt: [{ $size: "$allReadings" }, 0] }
        }
      },
  
      { $sort: { date: 1 } }
    ];
  
    const results = await Telemetry.aggregate(pipeline);
  
    // Process results and create trip data
    const reportMap = new Map<string, DailyTirePressureData>();
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  
    // Generate all 7 days
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      
      const dateString = date.toISOString().split('T')[0]!;
      const dayOfWeek = date.getDay();
      const dayName = dayNames[dayOfWeek]!;
      
      // Find data for this day
      const dayData = results.find(r => r.date === dateString);
      
      if (dayData) {
        const { distanceCovered, mainPressure, startLocation, endLocation } = this._processTripsFromReadings(dayData);
        
        reportMap.set(dateString, {
          date: dateString,
          dayName: dayName,
          dayOfWeek: dayOfWeek + 1,
          chartLabel: dayName,
          distanceCovered: distanceCovered,
          mainPressure: mainPressure,
          startLocation: startLocation,
          endLocation: endLocation,
          hasData: dayData.hasData
        });
      } else {
        reportMap.set(dateString, {
          date: dateString,
          dayName: dayName,
          dayOfWeek: dayOfWeek + 1,
          chartLabel: dayName,
          distanceCovered: 0,
          mainPressure: 0,
          startLocation: "",
          endLocation: "",
          hasData: false
        });
      }
    }
  
    return reportMap;
  }


  private _generateSuspectedCode(faultType: string): string {
    const codes: { [key: string]: string } = { // Add type annotation
      'COOLING_SYSTEM': 'P0217',
      'FUEL_SYSTEM': 'P0171',
      'ENGINE_PERFORMANCE': 'P0300',
      'UNKNOWN': 'P0000'
    };
    return codes[faultType] || 'P0000';
  }
  
  private _getFaultDescription(faultType: string): string {
    const descriptions: { [key: string]: string } = { // Add type annotation
      'COOLING_SYSTEM': 'Engine Overheating Condition',
      'FUEL_SYSTEM': 'Fuel System Too Lean',
      'ENGINE_PERFORMANCE': 'Engine Performance Issue',
      'UNKNOWN': 'Unknown Engine Fault'
    };
    return descriptions[faultType] || 'Unknown Engine Fault';
  }
  
  private _getSeverityLevel(fault: any): string {
    if (fault.coolantTemp > 110) return 'CRITICAL';
    if (fault.dtcCount > 3) return 'HIGH';
    if (fault.milDistance > 0) return 'MEDIUM';
    return 'LOW';
  }
  
  private _analyzeSymptoms(fault: any): string[] {
    const symptoms = [];
    if (fault.coolantTemp > 105) symptoms.push('High coolant temperature');
    if (Math.abs(fault.fuelTrim) > 15) symptoms.push('Fuel trim out of range');
    if (fault.engineLoad > 85) symptoms.push('High engine load');
    if (fault.milDistance > 0) symptoms.push('MIL lamp activated');
    return symptoms;
  }


  private _processTripsFromReadings(dayData: any): { distanceCovered: number; mainPressure: number; startLocation: string; endLocation: string } {
    const readings = dayData.allReadings || [];
    
    if (readings.length === 0) {
      return { distanceCovered: 0, mainPressure: 0, startLocation: "", endLocation: "" };
    }
  
    // Get first and last readings
    const firstReading = readings[0];
    const lastReading = readings[readings.length - 1];
    
    // Calculate distance covered
    const distanceCovered = Math.round(
      (lastReading.odometer - firstReading.odometer) / 1000 * 100
    ) / 100;
  
    // Get pressure, start and end locations
    const mainPressure = lastReading.pressure || 0;
    const startLocation = firstReading.location || "";
    const endLocation = lastReading.location || "";
  
    return { distanceCovered, mainPressure, startLocation, endLocation };
  }


  private async _getDailyFuelBarChartData(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType
  ): Promise<Map<string, DailyFuelBarChartData>> {
    
    console.log(`=== FUEL ANALYTICS DEBUG ===`);
    console.log(`IMEI: ${imei}`);
    console.log(`Date Range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    const resultMap = new Map<string, DailyFuelBarChartData>();
    
    // Generate expected date labels
    const dateLabels = this.generateDateLabels(startDate, endDate, type);
    console.log(`Generated date labels:`, dateLabels);
    
    // Process each date individually for better debugging
    for (const dateLabel of dateLabels) {
      const dayStart = new Date(dateLabel);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dateLabel);
      dayEnd.setHours(23, 59, 59, 999);
      
      console.log(`\nProcessing ${dateLabel}: ${dayStart.toISOString()} to ${dayEnd.toISOString()}`);
      
      try {
        const fuelData = await this.calculateDailyFuelData(imei, dayStart, dayEnd, dateLabel);
        resultMap.set(dateLabel, fuelData);
        
        console.log(`${dateLabel} result:`, {
          consumed: fuelData.totalFuelConsumedLiters,
          refueled: fuelData.totalFuelRefueledLiters,
          hasData: fuelData.hasData
        });
        
      } catch (error) {
        console.error(`Error processing ${dateLabel}:`, error);
        resultMap.set(dateLabel, this.createEmptyFuelChartData(dateLabel));
      }
    }
    
    console.log(`=== END FUEL ANALYTICS ===`);
    return resultMap;
  }

  

  private async calculateDailyFuelData(
    imei: string, 
    dayStart: Date, 
    dayEnd: Date, 
    dateLabel: string
  ): Promise<DailyFuelBarChartData> {
    
    // Build aggregation pipeline with proper timestamp handling
    const pipeline = [
      {
        $match: {
          imei: imei,
          // Use multiple timestamp matching strategies
          $or: [
            {
              "state.reported.ts": {
                $gte: dayStart,
                $lte: dayEnd
              }
            },
            {
              // Handle case where ts might be stored as Unix timestamp
              "state.reported.ts": {
                $gte: dayStart.getTime(),
                $lte: dayEnd.getTime()
              }
            }
          ],
          // Ensure we have the necessary fields
          [`state.reported.${AVL_ID_MAP.FUEL_LEVEL}`]: { $exists: true },
          [`state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`]: { $exists: true }
        }
      },
      {
        $addFields: {
          // Robust timestamp conversion that handles multiple formats
          normalizedTimestamp: {
            $switch: {
              branches: [
                {
                  // MongoDB Date object
                  case: { $eq: [{ $type: "$state.reported.ts" }, "date"] },
                  then: { $toLong: "$state.reported.ts" }
                },
                {
                  // Unix timestamp in seconds (convert to milliseconds)
                  case: { 
                    $and: [
                      { $eq: [{ $type: "$state.reported.ts" }, "long"] },
                      { $lt: ["$state.reported.ts", 2000000000000] } // Less than year 2033 in ms
                    ]
                  },
                  then: { $multiply: ["$state.reported.ts", 1000] }
                },
                {
                  // Unix timestamp in milliseconds
                  case: { $eq: [{ $type: "$state.reported.ts" }, "long"] },
                  then: "$state.reported.ts"
                },
                {
                  // String date
                  case: { $eq: [{ $type: "$state.reported.ts" }, "string"] },
                  then: { $toLong: { $dateFromString: { dateString: "$state.reported.ts" } } }
                },
                {
                  // Object with $date property (common in MongoDB exports)
                  case: { $ne: ["$state.reported.ts.$date", null] },
                  then: { $toLong: { $dateFromString: { dateString: "$state.reported.ts.$date" } } }
                }
              ],
              default: { $toLong: new Date() }
            }
          },
          // Convert all field values to proper numbers
          fuelLevel: {
            $toDouble: { $ifNull: [`$state.reported.${AVL_ID_MAP.FUEL_LEVEL}`, 0] }
          },
          odometer: {
            $toDouble: { $ifNull: [`$state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`, 0] }
          },
          speed: {
            $toDouble: { $ifNull: [`$state.reported.${AVL_ID_MAP.SPEED}`, 0] }
          },
          rpm: {
            $toDouble: { $ifNull: [`$state.reported.${AVL_ID_MAP.ENGINE_RPM}`, 0] }
          },
          ignition: {
            $toDouble: { $ifNull: [`$state.reported.${AVL_ID_MAP.IGNITION}`, 0] }
          },
          movement: {
            $toDouble: { $ifNull: [`$state.reported.${AVL_ID_MAP.MOVEMENT}`, 0] }
          },
          location: {
            $ifNull: ["$state.reported.latlng", ""]
          }
        }
      },
      {
        // Filter out invalid timestamps and ensure they're within our date range
        $match: {
          normalizedTimestamp: {
            $gte: dayStart.getTime(),
            $lte: dayEnd.getTime()
          },
          fuelLevel: { $gte: 0, $lte: 100 }, // Valid fuel percentage
          odometer: { $gt: 0 } // Valid odometer reading
        }
      },
      {
        $sort: { normalizedTimestamp: 1 as const }
      },
      {
        $group: {
          _id: null,
          readings: {
            $push: {
              timestamp: "$normalizedTimestamp",
              fuelLevel: "$fuelLevel",
              odometer: "$odometer",
              speed: "$speed",
              rpm: "$rpm",
              ignition: "$ignition",
              movement: "$movement",
              location: "$location"
            }
          },
          count: { $sum: 1 },
          firstTimestamp: { $first: "$normalizedTimestamp" },
          lastTimestamp: { $last: "$normalizedTimestamp" }
        }
      }
    ];
    
    console.log(`Running aggregation for ${dateLabel}...`);
    const results = await Telemetry.aggregate(pipeline);
    
    if (results.length === 0 || !results[0].readings || results[0].readings.length === 0) {
      console.log(`No data found for ${dateLabel}`);
      return this.createEmptyFuelChartData(dateLabel);
    }
    
    const data = results[0];
    const readings: EnhancedFuelReading[] = data.readings.map((reading: any) => ({
      ...reading,
      date: new Date(reading.timestamp),
      fuelLiters: this.convertFuelPercentageToLiters(reading.fuelLevel),
      isEngineActive: reading.ignition === 1 || reading.movement === 1 || reading.speed > 0 || reading.rpm > 0
    }));
    
    console.log(`Found ${readings.length} valid readings for ${dateLabel}`);
    console.log(`Time span: ${new Date(data.firstTimestamp).toISOString()} to ${new Date(data.lastTimestamp).toISOString()}`);
    
    // Calculate fuel metrics
    const fuelMetrics = this.calculateFuelConsumptionAndRefueling(readings);
    
    return {
      date: dateLabel,
      dayName: new Date(dateLabel).toLocaleDateString('en-US', { weekday: 'long' }),
      dayOfWeek: new Date(dateLabel).getDay(),
      chartLabel: new Date(dateLabel).toLocaleDateString('en-US', { weekday: 'long' }),
      totalFuelConsumedLiters: parseFloat(fuelMetrics.consumed.toFixed(2)),
      totalFuelRefueledLiters: parseFloat(fuelMetrics.refueled.toFixed(2)),
      hasData: readings.length > 0
    };
  }


  private calculateFuelConsumptionAndRefueling(readings: EnhancedFuelReading[]): {
    consumed: number;
    refueled: number;
    efficiency: number;
  } {
    if (readings.length < 2) {
      return { consumed: 0, refueled: 0, efficiency: 0 };
    }
    
    let totalConsumed = 0;
    let totalRefueled = 0;
    let totalDistance = 0;
    
    // Constants for fuel analysis
    const REFUEL_THRESHOLD = 5; // % increase indicates refueling
    const CONSUMPTION_MIN = 0.1; // Minimum consumption to count (prevent noise)
    const MAX_TIME_GAP_HOURS = 4; // Maximum gap between readings to consider continuous
    
    console.log(`Analyzing ${readings.length} readings for fuel changes...`);
    
    for (let i = 1; i < readings.length; i++) {
      const prev = readings[i - 1];
      const curr = readings[i];

      if (!prev || !curr) {
        console.log(`Skipping invalid reading at index ${i}`);
        continue;
      }
      
      // Calculate time difference
      const timeDiffHours = (curr.timestamp - prev.timestamp) / (1000 * 60 * 60);
      
      // Skip if time gap is too large (data might be unreliable)
      if (timeDiffHours > MAX_TIME_GAP_HOURS) {
        console.log(`Skipping large time gap: ${timeDiffHours.toFixed(1)} hours`);
        continue;
      }
      
      // Calculate fuel level change
      const fuelChange = curr.fuelLevel - prev.fuelLevel;
      const fuelChangeLiters = curr.fuelLiters - prev.fuelLiters;
      
      // Calculate distance for this segment
      const distanceMeters = Math.max(0, curr.odometer - prev.odometer);
      const distanceKm = distanceMeters / 1000;
      totalDistance += distanceKm;
      
      console.log(`Reading ${i}: Time diff: ${timeDiffHours.toFixed(1)}h, Fuel change: ${fuelChange.toFixed(1)}% (${fuelChangeLiters.toFixed(2)}L), Distance: ${distanceKm.toFixed(1)}km`);
      
      if (fuelChange > REFUEL_THRESHOLD) {
        // Refueling detected
        totalRefueled += Math.abs(fuelChangeLiters);
        console.log(`  → Refueling detected: +${Math.abs(fuelChangeLiters).toFixed(2)}L`);
        
      } else if (fuelChange < -CONSUMPTION_MIN && (prev.isEngineActive || curr.isEngineActive)) {
        // Fuel consumption detected (only when engine was active)
        totalConsumed += Math.abs(fuelChangeLiters);
        console.log(`  → Consumption detected: -${Math.abs(fuelChangeLiters).toFixed(2)}L`);
        
      } else if (Math.abs(fuelChange) <= CONSUMPTION_MIN) {
        console.log(`  → No significant fuel change`);
      } else {
        console.log(`  → Ignoring fuel change (engine inactive or anomaly)`);
      }
    }
    
    // If no direct fuel consumption detected, estimate based on distance and engine activity
    if (totalConsumed === 0 && totalDistance > 0) {
      console.log(`No direct fuel consumption detected. Estimating from distance: ${totalDistance.toFixed(1)}km`);
      totalConsumed = this.estimateFuelConsumptionFromDistance(readings, totalDistance);
      console.log(`Estimated consumption: ${totalConsumed.toFixed(2)}L`);
    }
    
    const efficiency = totalConsumed > 0 ? totalDistance / totalConsumed : 0;
    
    console.log(`Final results: Consumed: ${totalConsumed.toFixed(2)}L, Refueled: ${totalRefueled.toFixed(2)}L, Efficiency: ${efficiency.toFixed(1)}km/L`);
    
    return {
      consumed: totalConsumed,
      refueled: totalRefueled,
      efficiency: efficiency
    };
  }


  private estimateFuelConsumptionFromDistance(readings: EnhancedFuelReading[], distanceKm: number): number {
    if (distanceKm === 0) return 0;
    
    // Calculate average engine conditions
    const activeReadings = readings.filter(r => r.isEngineActive);
    if (activeReadings.length === 0) return 0;
    
    const avgRpm = activeReadings.reduce((sum, r) => sum + r.rpm, 0) / activeReadings.length;
    const avgSpeed = activeReadings.reduce((sum, r) => sum + r.speed, 0) / activeReadings.length;
    
    // Estimate fuel efficiency based on driving conditions
    let estimatedEfficiencyKmL = 12; // Base efficiency for average car
    
    // Adjust based on RPM
    if (avgRpm > 2500) {
      estimatedEfficiencyKmL *= 0.8; // High RPM = lower efficiency
    } else if (avgRpm < 1500) {
      estimatedEfficiencyKmL *= 1.1; // Low RPM = higher efficiency
    }
    
    // Adjust based on speed
    if (avgSpeed < 20) {
      estimatedEfficiencyKmL *= 0.7; // City driving
    } else if (avgSpeed > 80) {
      estimatedEfficiencyKmL *= 0.85; // High speed
    }
    
    // Calculate engine running time for idling consumption
    const engineRunningMinutes = this.calculateEngineRunningTime(readings);
    const idlingConsumptionLiters = (engineRunningMinutes / 60) * 0.8; // 0.8L/hour idling
    
    const drivingConsumption = distanceKm / estimatedEfficiencyKmL;
    const totalEstimated = drivingConsumption + idlingConsumptionLiters;
    
    console.log(`Estimation details: Distance: ${distanceKm}km, Avg RPM: ${avgRpm}, Avg Speed: ${avgSpeed}km/h, Efficiency: ${estimatedEfficiencyKmL}km/L, Engine time: ${engineRunningMinutes}min`);
    
    return Math.max(0, totalEstimated);
  }


  private calculateEngineRunningTime(readings: EnhancedFuelReading[]): number {
    if (readings.length < 2) return 0;
    
    let runningTimeMinutes = 0;
    
    for (let i = 1; i < readings.length; i++) {
      const prev = readings[i - 1];
      const curr = readings[i];

      if (!prev || !curr) {
        continue;
      }
      
      if (prev.isEngineActive) {
        const timeDiffMinutes = (curr.timestamp - prev.timestamp) / (1000 * 60);
        runningTimeMinutes += Math.min(timeDiffMinutes, 60); // Cap at 60 minutes per segment
      }
    }
    
    return runningTimeMinutes;
  }


  private convertFuelPercentageToLiters(percentage: number): number {
    const TANK_CAPACITY_LITERS = 50; // Adjust based on vehicle type
    return (percentage / 100) * TANK_CAPACITY_LITERS;
  }


  private createEmptyFuelChartData(dateLabel: string): DailyFuelBarChartData {
    const date = new Date(dateLabel);
    
    return {
      date: dateLabel,
      dayName: date.toLocaleDateString('en-US', { weekday: 'long' }),
      dayOfWeek: date.getDay(),
      chartLabel: date.toLocaleDateString('en-US', { weekday: 'long' }),
      totalFuelConsumedLiters: 0,
      totalFuelRefueledLiters: 0,
      hasData: false
    };
  }


  private generateDateLabels(startDate: Date, endDate: Date, type: ChartGroupingType): string[] {
    const labels: string[] = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
      const dateString = current.toISOString().split('T')[0];
      if (dateString) { // Fix: Check for undefined
        labels.push(dateString);
      }
      
      if (type === 'weekly') {
        current.setDate(current.getDate() + 7);
      } else {
        current.setDate(current.getDate() + 1);
      }
    }
    
    return labels;
  }


  public async debugTimestampHandling(imei: string, sampleSize: number = 5): Promise<void> {
    console.log(`=== TIMESTAMP DEBUG FOR ${imei} ===`);
    
    const pipeline = [
      { $match: { imei: imei } },
      { $sort: { "state.reported.ts": -1 as const } },
      { $limit: sampleSize },
      {
        $project: {
          originalTs: "$state.reported.ts",
          tsType: { $type: "$state.reported.ts" },
          fuelLevel: `$state.reported.${AVL_ID_MAP.FUEL_LEVEL}`,
          odometer: `$state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`,
          ignition: `$state.reported.${AVL_ID_MAP.IGNITION}`
        }
      }
    ];
    
    const samples = await Telemetry.aggregate(pipeline);
    
    console.log(`Found ${samples.length} sample records:`);
    samples.forEach((sample, index) => {
      console.log(`\nSample ${index + 1}:`);
      console.log(`  Original TS: ${JSON.stringify(sample.originalTs)}`);
      console.log(`  TS Type: ${sample.tsType}`);
      console.log(`  Fuel Level: ${sample.fuelLevel}`);
      console.log(`  Odometer: ${sample.odometer}`);
      console.log(`  Ignition: ${sample.ignition}`);
      
      // Test conversion
      try {
        let convertedTimestamp: number;
        const ts = sample.originalTs;
        
        if (ts && typeof ts === 'object' && ts.$date) {
          convertedTimestamp = new Date(ts.$date).getTime();
        } else if (ts instanceof Date) {
          convertedTimestamp = ts.getTime();
        } else if (typeof ts === 'number') {
          convertedTimestamp = ts < 2000000000000 ? ts * 1000 : ts;
        } else {
          convertedTimestamp = new Date(ts).getTime();
        }
        
        console.log(`  Converted: ${convertedTimestamp} (${new Date(convertedTimestamp).toISOString()})`);
      } catch (error: any) { // Fix: Explicitly type error as any
        console.log(`  Conversion Error: ${error?.message || 'Unknown error'}`);
      }
    });
    
    console.log(`=== END TIMESTAMP DEBUG ===`);
  }

 
  // Assume Telemetry model and AVL_ID_MAP are defined elsewhere
  // e.g., import { Telemetry } from './telemetry.model';
  // e.g., import { AVL_ID_MAP, ChartGroupingType } from './constants';

  private async _getFuelAnalyticsReport(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType
  ): Promise<Map<string, FuelSummary>> {
    
    const tsKey = `state.reported.ts`;
    const fuelKey = `state.reported.${AVL_ID_MAP.FUEL_LEVEL}`;
    const odometerKey = `state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`;
    const ignitionKey = `state.reported.${AVL_ID_MAP.IGNITION}`;
    
    const FUEL_TANK_CAPACITY_LITERS = 60;
  
    let groupByFormat: string;
    switch (type) {
      case "weekly": groupByFormat = "%Y-%U"; break;
      case "monthly": groupByFormat = "%Y-%m"; break;
      case "daily":
      default: groupByFormat = "%Y-%m-%d"; break;
    }
  
    const pipeline: any[] = [
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [fuelKey]: { $exists: true, $type: "number", $gte: 0, $lte: 100 },
          [odometerKey]: { $exists: true, $type: "number" },
        },
      },
  
      { $sort: { [tsKey]: 1 } },
  
      {
        $group: {
          _id: {
            day: {
              $dateToString: {
                format: groupByFormat,
                date: { $toDate: `$${tsKey}` },
                timezone: "UTC"
              }
            }
          },
          
          // Daily start/end values
          dayStartFuelPercent: { $first: `$${fuelKey}` },
          dayEndFuelPercent: { $last: `$${fuelKey}` },
          dayStartOdometer: { $first: `$${odometerKey}` },
          dayEndOdometer: { $last: `$${odometerKey}` },
          
          // Current status (from latest reading)
          currentFuelLevel: { $last: `$${fuelKey}` },
          currentIgnitionStatus: { $last: `$${ignitionKey}` },
          lastUpdateTime: { $last: `$${tsKey}` },
          
          // Min/max for refuel detection
          minFuelPercent: { $min: `$${fuelKey}` },
          maxFuelPercent: { $max: `$${fuelKey}` },
          
          readingCount: { $sum: 1 }
        }
      },
  
      {
        $addFields: {
          // Convert percentages to liters
          dayStartFuelLiters: {
            $multiply: ["$dayStartFuelPercent", { $divide: [FUEL_TANK_CAPACITY_LITERS, 100] }]
          },
          dayEndFuelLiters: {
            $multiply: ["$dayEndFuelPercent", { $divide: [FUEL_TANK_CAPACITY_LITERS, 100] }]
          },
          currentFuelLiters: {
            $multiply: ["$currentFuelLevel", { $divide: [FUEL_TANK_CAPACITY_LITERS, 100] }]
          },
          
          // Distance traveled
          dailyDistanceKm: {
            $divide: [
              { $subtract: ["$dayEndOdometer", "$dayStartOdometer"] },
              1000
            ]
          },
          
          // Refuel detection
          refuelAmount: {
            $cond: {
              if: {
                $gt: [
                  { $subtract: ["$maxFuelPercent", "$minFuelPercent"] },
                  8 // 8% increase suggests refueling
                ]
              },
              then: {
                $multiply: [
                  { $subtract: ["$maxFuelPercent", "$minFuelPercent"] },
                  { $divide: [FUEL_TANK_CAPACITY_LITERS, 100] }
                ]
              },
              else: 0
            }
          }
        }
      },
  
      {
        $addFields: {
          // Calculate actual fuel consumed
          actualFuelConsumed: {
            $cond: {
              if: { $gt: ["$refuelAmount", 0] },
              then: {
                // If refueling occurred: consumption = fuel drop + refuel amount
                $add: [
                  { $subtract: ["$dayStartFuelLiters", "$dayEndFuelLiters"] },
                  "$refuelAmount"
                ]
              },
              else: {
                // No refueling: consumption = fuel drop (if positive)
                $max: [0, { $subtract: ["$dayStartFuelLiters", "$dayEndFuelLiters"] }]
              }
            }
          },
          
          // Estimated fuel consumption based on distance (alternative calculation)
          estimatedFuelUsed: {
            $cond: {
              if: { $gt: ["$dailyDistanceKm", 0] },
              then: {
                // Assume average consumption of 10L/100km
                $multiply: ["$dailyDistanceKm", 0.10]
              },
              else: 0
            }
          },
          
          // Calculate fuel efficiency
          fuelEfficiencyKmL: {
            $cond: {
              if: {
                $and: [
                  { $gt: ["$dailyDistanceKm", 1] }, // At least 1km traveled
                  { $gt: ["$actualFuelConsumed", 0] }
                ]
              },
              then: { $divide: ["$dailyDistanceKm", "$actualFuelConsumed"] },
              else: 0
            }
          },
          
          fuelEfficiencyL100km: {
            $cond: {
              if: {
                $and: [
                  { $gt: ["$dailyDistanceKm", 1] },
                  { $gt: ["$actualFuelConsumed", 0] }
                ]
              },
              then: {
                $multiply: [
                  { $divide: ["$actualFuelConsumed", "$dailyDistanceKm"] },
                  100
                ]
              },
              else: 0
            }
          }
        }
      },
  
      {
        $project: {
          _id: 0,
          date: "$_id.day",
          
          // Fuel levels
          startingFuelPercent: { $round: ["$dayStartFuelPercent", 1] },
          endingFuelPercent: { $round: ["$dayEndFuelPercent", 1] },
          currentFuelLevel: { $round: ["$currentFuelLevel", 1] }, // Current fuel level
          startingFuelLiters: { $round: ["$dayStartFuelLiters", 1] },
          endingFuelLiters: { $round: ["$dayEndFuelLiters", 1] },
          currentFuelLiters: { $round: ["$currentFuelLiters", 1] },
          
          // Consumption
          totalFuelConsumedLiters: { $round: ["$actualFuelConsumed", 2] },
          estimatedFuelUsed: { $round: ["$estimatedFuelUsed", 2] }, // For UI display
          totalFuelRefueledLiters: { $round: ["$refuelAmount", 2] },
          
          // Distance and efficiency
          totalDistanceKm: { $round: ["$dailyDistanceKm", 2] },
          mileageKmL: { $round: ["$fuelEfficiencyKmL", 2] },
          fuelEfficiencyL100km: { $round: ["$fuelEfficiencyL100km", 2] },
          
          // Status
          currentIgnitionStatus: "$currentIgnitionStatus", // Current ignition status
          ignitionStatusText: {
            $cond: {
              if: { $eq: ["$currentIgnitionStatus", 1] },
              then: "ON",
              else: "OFF"
            }
          },
          refuelOccurred: { $gt: ["$refuelAmount", 0] },
          lastUpdateTime: "$lastUpdateTime",
          dataQuality: "$readingCount"
        }
      },
  
      { $sort: { date: 1 } }
    ];
  
    const results = await Telemetry.aggregate(pipeline);
  
    const reportMap = new Map<string, FuelSummary>();
    results.forEach((point) => {
      reportMap.set(point.date, {
        startingFuelPercent: point.startingFuelPercent || 0,
        endingFuelPercent: point.endingFuelPercent || 0,
        currentFuelLevel: point.currentFuelLevel || 0,
        currentFuelLiters: point.currentFuelLiters || 0,
        startingFuelLiters: point.startingFuelLiters || 0,
        endingFuelLiters: point.endingFuelLiters || 0,
        totalFuelConsumedLiters: point.totalFuelConsumedLiters || 0,
        estimatedFuelUsed: point.estimatedFuelUsed || 0,
        totalFuelRefueledLiters: point.totalFuelRefueledLiters || 0,
        totalDistanceKm: point.totalDistanceKm || 0,
        mileageKmL: point.mileageKmL || 0,
        fuelEfficiencyL100km: point.fuelEfficiencyL100km || 0,
        currentIgnitionStatus: point.currentIgnitionStatus || 0,
        ignitionStatusText: point.ignitionStatusText || "OFF",
        refuelOccurred: point.refuelOccurred || false,
        lastUpdateTime: point.lastUpdateTime,
        dataQuality: point.dataQuality
      });
    });
  
    return reportMap;
  }

  private async _getBatteryAnalyticsReport(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType
  ): Promise<Map<string, BatterySummary>> {
    // --- ASSUMPTIONS ---
    // 1. Using AVL ID for external power voltage. Change if you use internal battery voltage.
    // 2. The device reports voltage in Millivolts (mV), so we will convert to Volts (V).
    const voltageKey = `state.reported.${AVL_ID_MAP.EXTERNAL_VOLTAGE}`; // e.g., 'state.reported.66'
    const tsKey = `state.reported.${AVL_ID_MAP.TIMESTAMP}`;

    // Determine the date format string for the grouping stage
    let groupByFormat: string;
    switch (type) {
      case "weekly":
        groupByFormat = "%Y-%U"; // Year-WeekNumber
        break;
      case "monthly":
        groupByFormat = "%Y-%m"; // Year-Month
        break;
      case "daily":
      default:
        groupByFormat = "%Y-%m-%d"; // Year-Month-Day
        break;
    }

    const pipeline: any[] = [
      // STAGE 1: Filter for the device, time range, and ensure voltage data exists.
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [voltageKey]: { $exists: true, $type: "number" },
        },
      },

      // STAGE 2: Sort documents by timestamp. ESSENTIAL for $first and $last to work correctly.
      { $sort: { [tsKey]: 1 } },

      // STAGE 3: Group data into time buckets and calculate aggregates.
      // All calculations here are performed on the raw Millivolt values.
      {
        $group: {
          _id: {
            $dateToString: {
              format: groupByFormat,
              date: { $toDate: `$${tsKey}` },
              timezone: "UTC",
            },
          },
          // Get the voltage from the first and last documents in the sorted group
          startingVoltageRaw: { $first: `$${voltageKey}` },
          endingVoltageRaw: { $last: `$${voltageKey}` },
          // Calculate min, max, and average for the entire group
          minVoltageRaw: { $min: `$${voltageKey}` },
          maxVoltageRaw: { $max: `$${voltageKey}` },
          averageVoltageRaw: { $avg: `$${voltageKey}` },
        },
      },

      // STAGE 4: Project the final format and CONVERT from Millivolts to Volts.
      {
        $project: {
          _id: 0,
          label: "$_id",
          // Divide all raw voltage fields by 1000 to get Volts
          startingVoltage: { $divide: ["$startingVoltageRaw", 1000] },
          endingVoltage: { $divide: ["$endingVoltageRaw", 1000] },
          minVoltage: { $divide: ["$minVoltageRaw", 1000] },
          maxVoltage: { $divide: ["$maxVoltageRaw", 1000] },
          averageVoltage: { $divide: ["$averageVoltageRaw", 1000] },
        },
      },

      // STAGE 5: Sort the final report by the label (date/week/month).
      { $sort: { label: 1 } },
    ];

    const results = await Telemetry.aggregate(pipeline);

    // Map the results to the final Map<string, BatterySummary> structure.
    const reportMap = new Map<string, BatterySummary>();

    results.forEach((point) => {
      reportMap.set(point.label, {
        startingVoltage: parseFloat(point.startingVoltage?.toFixed(2) ?? 0),
        endingVoltage: parseFloat(point.endingVoltage?.toFixed(2) ?? 0),
        minVoltage: parseFloat(point.minVoltage?.toFixed(2) ?? 0),
        maxVoltage: parseFloat(point.maxVoltage?.toFixed(2) ?? 0),
        averageVoltage: parseFloat(point.averageVoltage?.toFixed(2) ?? 0),
      });
    });

    return reportMap;
  }
}
