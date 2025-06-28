// src/utils/telemetryParser.ts

import { ValidationUtils } from "./ValidationUtils";
export const telemetryCodeMap: Record<string, string> = {
  "16": "totalMileage",
  "24": "speed",
  sp: "speed",
  "31": "engineLoad",
  "30": "dtc",
  "36": "engineRpm",
  "48": "fuelLevel",
  "58": "engineOilTemp",
  "66": "externalVoltage",
  "67": "battery",
  "247": "crashDetection",
  pr: "tirePressure",
  latlng: "latlng",
  alt: "altitude",
  ang: "angle",
  sat: "satellites",
  evt: "event",
  ts: "timestamp",
  "256": "vin",
};

export interface ParsedTelemetryData {
  timestamp: Date;
  imei?: string;
  position?: {
    latitude: number;
    longitude: number;
    altitude?: number;
    angle?: number;
    satellites?: number;
  };
  vehicle?: {
    speed?: number;
    totalMileage?: number;
    engineRpm?: number;
    engineLoad?: number;
    engineOilTemp?: number;
    fuelLevel?: number;
    battery?: number;
    externalVoltage?: number;
    vin?: string;
  };
  diagnostics?: {
    dtc?: string[];
    crashDetection?: boolean;
    tirePressure?: {
      frontLeft?: number;
      frontRight?: number;
      rearLeft?: number;
      rearRight?: number;
    };
  };
  raw?: Record<string, any>;
}

export class TelemetryParser {
  static parseRawData(rawData: Record<string, any>): ParsedTelemetryData {
    const parsed: ParsedTelemetryData = {
      timestamp: new Date(),
      raw: rawData,
    };

    // Parse position data
    if (rawData.latlng || (rawData.lat && rawData.lng)) {
      const [lat, lng] = rawData.latlng
        ? rawData.latlng.split(",").map(Number)
        : [parseFloat(rawData.lat), parseFloat(rawData.lng)];

      parsed.position = {
        latitude: lat,
        longitude: lng,
        altitude: rawData.alt ? parseFloat(rawData.alt) : undefined,
        angle: rawData.ang ? parseFloat(rawData.ang) : undefined,
        satellites: rawData.sat ? parseInt(rawData.sat) : undefined,
      };
    }

    // Parse vehicle data
    parsed.vehicle = {
      speed: this.parseNumericValue(rawData, ["24", "sp"]),
      totalMileage: this.parseNumericValue(rawData, ["16"]),
      engineRpm: this.parseNumericValue(rawData, ["36"]),
      engineLoad: this.parseNumericValue(rawData, ["31"]),
      engineOilTemp: this.parseNumericValue(rawData, ["58"]),
      fuelLevel: this.parseNumericValue(rawData, ["48"]),
      battery: this.parseNumericValue(rawData, ["67"]),
      externalVoltage: this.parseNumericValue(rawData, ["66"]),
      vin: rawData["256"] || undefined,
    };

    // Parse diagnostics
    parsed.diagnostics = {
      dtc: rawData["30"] ? this.parseDtcCodes(rawData["30"]) : undefined,
      crashDetection: rawData["247"] ? Boolean(rawData["247"]) : undefined,
      tirePressure: rawData.pr ? this.parseTirePressure(rawData.pr) : undefined,
    };

    // Parse timestamp
    if (rawData.ts) {
      parsed.timestamp = new Date(parseInt(rawData.ts) * 1000);
    }

    return parsed;
  }

  private static parseNumericValue(
    data: Record<string, any>,
    keys: string[]
  ): number | undefined {
    for (const key of keys) {
      if (data[key] !== undefined) {
        const value = parseFloat(data[key]);
        return isNaN(value) ? undefined : value;
      }
    }
    return undefined;
  }

  private static parseDtcCodes(dtcData: any): string[] {
    if (typeof dtcData === "string") {
      return dtcData.split(",").filter((code) => code.trim().length > 0);
    }
    if (Array.isArray(dtcData)) {
      return dtcData.map(String);
    }
    return [];
  }

  private static parseTirePressure(pressureData: any): any {
    if (typeof pressureData === "string") {
      const pressures = pressureData.split(",").map(Number);
      return {
        frontLeft: pressures[0] || undefined,
        frontRight: pressures[1] || undefined,
        rearLeft: pressures[2] || undefined,
        rearRight: pressures[3] || undefined,
      };
    }
    return pressureData;
  }

  static validateTelemetryData(data: ParsedTelemetryData): string[] {
    const errors: string[] = [];

    // Validate position data
    if (data.position) {
      if (
        !ValidationUtils.isValidCoordinates(
          data.position.latitude,
          data.position.longitude
        )
      ) {
        errors.push("Invalid GPS coordinates");
      }
    }

    // Validate vehicle data ranges
    if (data.vehicle) {
      if (
        data.vehicle.speed &&
        (data.vehicle.speed < 0 || data.vehicle.speed > 300)
      ) {
        errors.push("Speed value out of valid range (0-300 km/h)");
      }

      if (
        data.vehicle.engineRpm &&
        (data.vehicle.engineRpm < 0 || data.vehicle.engineRpm > 10000)
      ) {
        errors.push("Engine RPM out of valid range (0-10000)");
      }

      if (
        data.vehicle.fuelLevel &&
        (data.vehicle.fuelLevel < 0 || data.vehicle.fuelLevel > 100)
      ) {
        errors.push("Fuel level out of valid range (0-100%)");
      }
    }

    return errors;
  }
}
