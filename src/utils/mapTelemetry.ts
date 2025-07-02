// src/utils/telemetryMapper.ts

import { TelemetryDTO } from "../types/TelemetryDTO";

const AVL_ID_MAP = {
  FUEL_LEVEL: "66",
  TOTAL_ODOMETER: "241",
  EVENT_IO_ID: "evt",
  // Add other useful IDs here from your device manual
  IGNITION: "239",
  EXTERNAL_VOLTAGE: "67",
  SPEED: "37",
};

/**
 * Maps specific Event IO ID values to their meaning.
 * Again, VERIFY these with your device documentation.
 */
const EVENT_CODE_MAP = {
  NO_EVENT: 0,
  IGNITION_ON: 1,
  IGNITION_OFF: 2,
  HARSH_BRAKING: 247,
  HARSH_ACCELERATION: 248,
  HARSH_CORNERING: 249,
  CRASH_DETECTION: 253, // This is the one we'll use for collision
};

// src/utils/telemetryCodeMap.ts

/**
 * Maps cryptic telemetry codes from the raw data to human-readable field names.
 */
const telemetryCodeMap: { [key: string]: keyof TelemetryDTO | string } = {
  // Key Vehicle Stats
  "16": "totalOdometer",
  "36": "engineRpm",
  "48": "fuelLevel",
  "239": "ignition", // Will be converted to boolean
  // sp: "speed",

  // Health and Environment
  "32": "coolantTemperature",
  "53": "ambientAirTemperature",
  "66": "externalVoltage", // Raw value, likely millivolts
  "67": "batteryVoltage", // Raw value, likely millivolts

  // GPS/GNSS
  alt: "altitude",
  ang: "angle",
  sat: "satellites",
  "69": "gnssStatus",
  "181": "gnssPdop",
  "182": "gnssHdop",

  // Identifiers & Network
  "256": "vin",
  "241": "activeGsmOperator",
  "21": "gsmSignal",

  // Other OBD Data
  "30": "dtcCount",
  "31": "engineLoad",
  "33": "shortFuelTrim",
  "37": "speed", // Note: 'sp' is likely the primary GPS speed
  "38": "timingAdvance",
  "39": "intakeAirTemperature",
  "42": "runtimeSinceEngineStart",
  "43": "distanceTraveledMilOn",
  "45": "directFuelRailPressure",
  "49": "distanceSinceCodesClear",
  "50": "barometricPressure",
  "51": "controlModuleVoltage",
  "52": "absoluteLoadValue",
  "200": "sleepMode",
  "240": "movement",
  "389": "obdOemTotalMileage",
  "541": "commandedEquivalenceRatio",
  "759": "fuelType",
  pr: "tyrePressure", // This might be an object, handle carefully
  evt: "eventCode",
};

/**
 * Calculates battery percentage from voltage.
 * Common lithium-ion batteries range from ~3.0V (empty) to ~4.2V (full).
 * @param voltage The battery voltage in Volts.
 */
function getBatteryPercentage(
  voltage: number,
  minVoltage = 3.0,
  maxVoltage = 4.2
): number {
  if (maxVoltage <= minVoltage) return 0;
  const percentage = ((voltage - minVoltage) / (maxVoltage - minVoltage)) * 100;
  return Math.round(Math.max(0, Math.min(100, percentage)));
}

/**
 * Parses values that might be simple numbers or BSON number objects.
 * @param value The value to parse.
 */
function parseValue(value: any): number | string | any {
  if (typeof value === "object" && value !== null) {
    if ("$numberLong" in value) return Number(value["$numberLong"]);
    if ("$numberInt" in value) return Number(value["$numberInt"]);
  }
  return value;
}

/**
 * Transforms raw, nested telemetry data from MongoDB into a clean, flat DTO.
 * @param raw The raw document from MongoDB Change Stream or a Mongoose query.
 * @returns A formatted TelemetryDTO object.
 */

export function mapTelemetry(raw: any): TelemetryDTO {
  // Ensure we are working with a plain JavaScript object
  const plainRaw = raw.toObject ? raw.toObject() : raw;
  const reported = plainRaw.state?.reported || {};

  // Initialize a partial DTO to build upon
  const mapped: Partial<TelemetryDTO> = {
    // Set default null values
    latitude: null,
    longitude: null,
    timestamp: null,
    ignition: null,
    speed: null,
    totalOdometer: null,
    engineRpm: null,
    fuelLevel: null,
    batteryVoltage: null,
    batteryPercentage: null,
    externalVoltage: null,
    coolantTemperature: null,
    ambientAirTemperature: null,
    altitude: null,
    angle: null,
    satellites: null,
    gnssStatus: null,
    vin: null,
    activeGsmOperator: null,
    gsmSignal: null,
  };

  // --- 1. Map top-level and special fields ---
  mapped.id = plainRaw._id?.toString();
  mapped.imei = plainRaw.imei;

  const rawFuelLevel = reported[AVL_ID_MAP.FUEL_LEVEL];
  if (rawFuelLevel !== undefined && rawFuelLevel !== null) {
    // Assumption: The value is in milliliters. We convert to liters.
    // YOU MUST CONFIRM THIS UNIT. It could also be a percentage (0-100) or voltage.
    mapped.fuel = {
      level: rawFuelLevel / 1000, // e.g., 12940 -> 12.94
      unit: "liters",
    };
  }

  const rawOdometer = reported[AVL_ID_MAP.TOTAL_ODOMETER];
  if (rawOdometer !== undefined) {
    mapped.odometer = {
      value: rawOdometer,
      unit: "meters",
    };
  }

  const eventCode = reported[AVL_ID_MAP.EVENT_IO_ID];
  if (eventCode === EVENT_CODE_MAP.CRASH_DETECTION) {
    // A crash event was specifically reported in this packet!
    mapped.collision = {
      detected: true,
      timestamp: mapped.timestamp,
      severity: "High", // You could have different severities for different event codes
    };
  }
  // Handle timestamp (ts)
  if (reported.ts?.$numberLong) {
    mapped.timestamp = Number(reported.ts.$numberLong);
    // mapped.timestamp = new Date(Number(reported.ts.$numberLong));
  }

  // Handle latitude and longitude (latlng)
  if (typeof reported.latlng === "string" && reported.latlng.includes(",")) {
    const [lat, lng] = reported.latlng.split(",").map(Number);
    if (!isNaN(lat) && !isNaN(lng)) {
      mapped.latitude = lat;
      mapped.longitude = lng;
    }
  }

  // --- 2. Loop through all other reported properties ---
  for (const [key, rawValue] of Object.entries(reported)) {
    const fieldName = telemetryCodeMap[key];
    if (fieldName) {
      const parsed = parseValue(rawValue);
      (mapped as any)[fieldName] = parsed;
    }
  }

  // --- 3. Perform final transformations and calculations ---

  // Convert ignition (1/0) to boolean
  const ignitionStatus = reported[AVL_ID_MAP.IGNITION];
  if (ignitionStatus !== undefined) {
    mapped.ignition = ignitionStatus === 1;
  }

  // Calculate battery percentage from voltage
  // NOTE: Assuming '67' (batteryVoltage) is in millivolts, a common practice.
  if (typeof mapped.batteryVoltage === "number") {
    const voltageInVolts = mapped.batteryVoltage / 1000.0;
    mapped.batteryPercentage = getBatteryPercentage(voltageInVolts);
  }

  // Also convert external voltage from millivolts to volts for consistency if needed
  if (typeof mapped.externalVoltage === "number") {
    mapped.externalVoltage = mapped.externalVoltage / 1000.0;
  }

  // Optional: Add the raw data for debugging
  // mapped.raw = plainRaw;

  return mapped as TelemetryDTO;
}
