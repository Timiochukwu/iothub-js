import { telemetryCodeMap } from "./telemetryCodeMap";
import { TelemetryDTO } from "../types/TelemetryDTO";

function getBatteryPercentage(
  voltage: number,
  minVoltage = 3.0,
  maxVoltage = 4.2
): number {
  // Ensure we don't divide by zero
  if (maxVoltage <= minVoltage) {
    return 0;
  }

  // Calculate the percentage
  const percentage = ((voltage - minVoltage) / (maxVoltage - minVoltage)) * 100;

  // Clamp the value between 0 and 100 to handle edge cases
  // (e.g., if voltage is slightly above 4.2V or below 3.0V)
  return Math.round(Math.max(0, Math.min(100, percentage)));
}

export function mapTelemetry(raw: any): TelemetryDTO {
  // --- FIX: CONVERT MONGOOSE DOCUMENT TO A PLAIN JAVASCRIPT OBJECT ---
  const plainRaw = raw.toObject ? raw.toObject() : raw;

  const reported = plainRaw.state?.reported || {};
  const mapped: any = {};

  for (const [key, value] of Object.entries(reported)) {
    // This loop will now work as expected
    const field = telemetryCodeMap[key];
    if (field) {
      // Handle special case for battery percentage
      if (field === "battery" && typeof value === "number") {
        mapped[field] = getBatteryPercentage(value);
        continue; // Skip to the next iteration
      }

      // change ignition message to boolean
      if (field === "ignition" && typeof value === "number") {
        mapped[field] = value === 1;
        continue; // Skip to the next iteration
      }
      mapped[field] =
        typeof value === "object" && value !== null && "$numberInt" in value
          ? Number(value["$numberInt"])
          : typeof value === "object" &&
              value !== null &&
              "$numberLong" in value
            ? Number(value["$numberLong"])
            : value;
    }
  }

  // Use the plain object for these checks as well
  if (plainRaw._id) mapped.id = plainRaw._id.toString(); // Use .toString() for ObjectIds
  if (plainRaw.imei) mapped.imei = plainRaw.imei;

  return mapped as TelemetryDTO;
}
