export interface FuelLevelHistoryPoint {
  timestamp: number;
  fuelLevel: number; // in Liters
}

export interface DailyConsumptionPoint {
  date: string; // e.g., "2023-10-27"
  litersPer100Km: number | null; // Null if no travel or data
  distanceTraveledKm: number;
  fuelConsumedLiters: number;
}

export interface SpeedHistoryPoint {
  timestamp: number;
  speed: number; // in km/h
}

export interface DailySpeedReportPoint {
  date: string; // e.g., "2023-10-27"
  maxSpeed: number;
  averageMovingSpeed: number | null; // Null if the vehicle didn't move
  speedingEventCount: number;
}
