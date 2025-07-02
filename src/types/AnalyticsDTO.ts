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
