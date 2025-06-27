import { telemetryCodeMap } from './telemetryCodeMap';
import { TelemetryDTO } from '../types/TelemetryDTO';

export function mapTelemetry(raw: any): TelemetryDTO {
  const reported = raw.state?.reported || {};
  const mapped: any = {};

  for (const [key, value] of Object.entries(reported)) {
    const field = telemetryCodeMap[key];
    if (field) {
      mapped[field] = typeof value === 'object' && value !== null && '$numberInt' in value
        ? Number(value['$numberInt'])
        : typeof value === 'object' && value !== null && '$numberLong' in value
        ? Number(value['$numberLong'])
        : value;
    }
  }

  // Add id and imei if present
  if (raw._id && raw._id.$oid) mapped.id = raw._id.$oid;
  if (raw.imei) mapped.imei = raw.imei;

  return mapped as TelemetryDTO;
} 