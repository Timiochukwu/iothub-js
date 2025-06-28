export interface User {
  id?: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Device {
  id?: string;
  imei: string;
  userId: string;
  deviceType?: string;
  vin?: string;
  make?: string;
  modelYear?: string;
  plateNumber?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: Omit<User, "password">;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface ChangePasswordRequest {
  email: string;
  currentPassword: string;
  newPassword: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface JwtPayload {
  userId: string;
  email: string;
  roles?: string[];
  iat?: number;
  exp?: number;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtRefreshExpiresIn: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

export interface DeviceDto {
  imei: string;
  deviceType?: string;
  vin?: string;
  make?: string;
  modelYear?: string;
  plateNumber?: string;
}

export interface DeviceTypeDto {
  name: string;
  description?: string;
}

export interface DeviceSwitchRequest {
  userId: string;
  imei: string;
}

// Telemetry Types (matching Java implementation)
export interface TelemetryData {
  id?: string;
  imei: string;
  timestamp: number;
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
}

export interface TelemetryPayload {
  imei: string;
  payload: {
    state: {
      reported: {
        [key: string]: any;
        ts?: number;
        latlng?: string;
        alt?: number;
        ang?: number;
        sat?: number;
        evt?: number;
        pr?: number;
        sp?: number;
        "16"?: number; // Total mileage
        "24"?: number; // Speed
        "30"?: number; // DTC
        "31"?: number; // Engine load
        "36"?: number; // Engine RPM
        "48"?: number; // Fuel level
        "58"?: number; // Engine oil temp
        "66"?: number; // External voltage
        "67"?: number; // Battery voltage
        "247"?: number; // Crash detection
        "256"?: string; // VIN
      };
    };
  };
}

export interface CreateGeofenceRequest {
  name: string;
  description?: string;
  coordinates: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

// Telemetry DTOs (matching Java implementation)
export interface TirePressureDTO {
  id: string;
  tirePressure: number | null;
  timestamp: number;
  message: string;
  formattedTimestamp: string;
}

export interface PositionDTO {
  id: string;
  latlng: string | null;
  altitude: number | null;
  angle: number | null;
  satellites: number | null;
  timestamp: number;
  message: string;
  formattedTimestamp: string;
}

export interface SpeedDTO {
  id: string;
  speed: number | null;
  timestamp: number;
  message: string;
}

export interface BatteryDTO {
  id: string;
  battery: number | null;
  timestamp: number;
  message: string;
  formattedTimestamp: string;
}

export interface FuelLevelDTO {
  id: string;
  fuelLevel: number | null;
  timestamp: number;
  message: string;
  formattedTimestamp: string;
}

export interface EngineRpmDTO {
  id: string;
  engineRpm: number | null;
  timestamp: number;
  message: string;
  formattedTimestamp: string;
}

export interface EngineOilTempDTO {
  id: string;
  engineOilTemp: number | null;
  timestamp: number;
  message: string;
  formattedTimestamp: string;
}

export interface CrashDetectionDTO {
  id: string;
  crashDetection: number | null;
  timestamp: number;
  message: string;
  formattedTimestamp: string;
}

export interface EngineLoadDTO {
  id: string;
  engineLoad: number | null;
  timestamp: number;
  message: string;
  formattedTimestamp: string;
}

export interface DtcDTO {
  id: string;
  dtc: number | null;
  timestamp: number;
  message: string;
  formattedTimestamp: string;
}

export interface PowerStatsDTO {
  id: string;
  externalVoltage: number | null;
  batteryVoltage: number | null;
  timestamp: number;
  message: string;
  batteryHealth: string;
  formattedTimestamp: string;
}

export interface TotalMileageDTO {
  id: string;
  totalMileage: number | null;
  timestamp: number;
  message: string;
  formattedTimestamp: string;
}

export interface VehicleHealthDTO {
  dtc: string;
  mileage: number | null;
  batteryVoltage: number | null;
  batteryHealth: string;
  engineRPM: number | null;
  engineHealth: string;
}

// Real-time Telemetry Types
export interface RealTimeTelemetryEvent {
  type:
    | "telemetry_update"
    | "vehicle_alert"
    | "crash_detected"
    | "health_warning";
  imei: string;
  timestamp: number;
  data: TelemetryData;
  alert?: {
    level: "info" | "warning" | "critical";
    message: string;
    code: string;
  };
}

export interface WebSocketMessage {
  event: string;
  data: any;
  timestamp: number;
}

export interface DeviceConnection {
  imei: string;
  socketId: string;
  connectedAt: number;
  lastHeartbeat: number;
  userEmail?: string;
}
