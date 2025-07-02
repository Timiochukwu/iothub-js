// export interface TelemetryDTO {
//   id?: string;
//   imei?: string;
//   timestamp?: number;
//   tirePressure?: number;
//   speed?: number;
//   latlng?: string;
//   altitude?: number;
//   angle?: number;
//   satellites?: number;
//   event?: number;
//   battery?: number;
//   fuelLevel?: number;
//   engineRpm?: number;
//   engineOilTemp?: number;
//   crashDetection?: number;
//   engineLoad?: number;
//   dtc?: number;
//   externalVoltage?: number;
//   totalMileage?: number;
//   vin?: string;
// }

// src/types/TelemetryDTO.ts

export interface TelemetryDTO {
  id: string;
  imei: string;
  timestamp: number | null;
  latitude: number | null;
  longitude: number | null;

  // Key vehicle stats
  ignition: any | null;
  speed: number | null; // From 'sp'
  totalOdometer: number | null; // From '16'
  engineRpm: number | null; // From '36'
  fuelLevel: number | null; // From '48'

  // Health and environment
  batteryVoltage: number | null; // From '67', raw value in millivolts
  batteryPercentage: number | null; // Calculated from batteryVoltage
  externalVoltage: number | null; // From '66', raw value in millivolts
  coolantTemperature: number | null; // From '32'
  ambientAirTemperature: number | null; // From '53'

  // GPS/GNSS Info
  altitude: number | null; // From 'alt'
  angle: number | null; // From 'ang'
  satellites: number | null; // From 'sat'
  gnssStatus: number | null; // From '69'

  // Other useful info
  vin: string | null; // From '256'
  activeGsmOperator: number | null; // From '241'
  gsmSignal: number | null; // From '21'

  // Include the full raw object for debugging or other purposes if needed
  raw?: any;
}
