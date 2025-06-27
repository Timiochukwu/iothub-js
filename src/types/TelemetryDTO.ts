export interface TelemetryDTO {
  id?: string;
  imei?: string;
  timestamp?: number;
  tirePressure?: number;
  speed?: number;
  latlng?: string;
  altitude?: number;
  angle?: number;
  satellites?: number;
  event?: number;
  battery?: number;
  fuelLevel?: number;
  engineRpm?: number;
  engineOilTemp?: number;
  crashDetection?: number;
  engineLoad?: number;
  dtc?: number;
  externalVoltage?: number;
  totalMileage?: number;
  vin?: string;
} 