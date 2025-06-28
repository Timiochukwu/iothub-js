import { telemetryCodeMap } from "./telemetryCodeMap";
import { TelemetryDTO } from "../types/TelemetryDTO";

export function mapTelemetry(raw: any): TelemetryDTO {
  // --- FIX: CONVERT MONGOOSE DOCUMENT TO A PLAIN JAVASCRIPT OBJECT ---
  const plainRaw = raw.toObject ? raw.toObject() : raw;

  const reported = plainRaw.state?.reported || {};
  const mapped: any = {};
  console.log("Mapping telemetry data (plain object):", plainRaw); // Updated log for clarity
  console.log("Reported telemetry data:", reported); // This will now show the correct data

  for (const [key, value] of Object.entries(reported)) {
    // This loop will now work as expected
    const field = telemetryCodeMap[key];
    if (field) {
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
