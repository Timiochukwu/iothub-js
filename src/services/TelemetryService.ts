import { Telemetry, ITelemetry } from "../models/Telemetry";
import { Device } from "../models/Device";
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
import { CustomError } from "../middleware/errorHandler";

export class TelemetryService {
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

      return {
        success: true,
        message: "Telemetry data ingested successfully",
        data: { id: telemetry._id!.toString() },
      };
    } catch (error) {
      throw new CustomError("Failed to ingest telemetry data", 500);
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

  async getLatestCrashDetection(): Promise<CrashDetectionDTO | null> {
    try {
      const latest = await this.getLatestTelemetry();
      if (!latest) return null;

      const message = this.getCrashDetectionMessage(latest.crashDetection);

      return {
        id: latest.id!,
        crashDetection: latest.crashDetection || null,
        timestamp: latest.timestamp,
        message,
        formattedTimestamp: this.formatTimestamp(latest.timestamp),
      };
    } catch (error) {
      throw new CustomError("Failed to fetch crash detection data", 500);
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

  private mapToTelemetryData(telemetry: ITelemetry): TelemetryData {
    return {
      id: telemetry._id!.toString(),
      imei: telemetry.imei,
      timestamp: telemetry.timestamp,
      tirePressure: telemetry.tirePressure,
      speed: telemetry.speed,
      latlng: telemetry.latlng,
      altitude: telemetry.altitude,
      angle: telemetry.angle,
      satellites: telemetry.satellites,
      event: telemetry.event,
      battery: telemetry.battery,
      fuelLevel: telemetry.fuelLevel,
      engineRpm: telemetry.engineRpm,
      engineOilTemp: telemetry.engineOilTemp,
      crashDetection: telemetry.crashDetection,
      engineLoad: telemetry.engineLoad,
      dtc: telemetry.dtc,
      externalVoltage: telemetry.externalVoltage,
      totalMileage: telemetry.totalMileage,
    };
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

  private getCrashDetectionMessage(crashDetection: number | undefined): string {
    if (!crashDetection || crashDetection === 0) return "No crash detected";

    switch (crashDetection) {
      case 1:
        return "Real crash detected (device is calibrated)";
      case 2:
        return "Limited crash trace (device not calibrated)";
      case 3:
        return "Limited crash trace (device is calibrated)";
      case 4:
        return "Full crash trace (device not calibrated)";
      case 5:
        return "Full crash trace (device is calibrated)";
      case 6:
        return "Real crash detected (device not calibrated)";
      default:
        return "Unknown crash detection value";
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
