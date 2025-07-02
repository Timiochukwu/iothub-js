// src/utils/telemetryMapper.ts

import { TelemetryDTO } from "../types/TelemetryDTO";

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
  sp: "speed",

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
  "37": "vehicleSpeedObd", // Note: 'sp' is likely the primary GPS speed
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
  if (mapped.ignition === 1 || mapped.ignition === 0) {
    mapped.ignition = mapped.ignition === 1;
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
