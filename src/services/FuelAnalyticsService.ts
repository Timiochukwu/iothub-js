import { Telemetry } from "../models/Telemetry";
import { AVL_ID_MAP } from "../utils/avlIdMap";
import { ChartGroupingType } from "../types";

export class FuelAnalyticsService {
  private readonly REFUEL_THRESHOLD = 15; // Increased to reduce false positives
  private readonly CONSUMPTION_THRESHOLD = 2; // Minimum consumption to count
  private readonly NOISE_FILTER = 5; // Filter readings within 5% of each other
  private readonly MIN_REFUEL_TIME = 30; // Minutes - refueling takes time
  private readonly MIN_READINGS_PER_DAY = 3; // Need enough data points

  async getFuelConsumptionChart(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType = "daily"
  ): Promise<Array<{
    date: string;
    refueled: number;
    consumed: number;
    dayLabel: string;
    confidence: 'high' | 'medium' | 'low';
    dataPoints: number;
  }>> {
    const fuelLevelKey = `state.reported.${AVL_ID_MAP.FUEL_LEVEL}`;
    const tsKey = `state.reported.ts`;
    const odometerKey = `state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`;

    const queryStartDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const queryEndDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1);

    // Get telemetry with odometer for validation
    const telemetryData = await Telemetry.find({
      imei,
      [tsKey]: { $gte: queryStartDate, $lt: queryEndDate },
      [fuelLevelKey]: { $exists: true, $type: "number" }
    })
      .sort({ [tsKey]: 1 })
      .select({
        [tsKey]: 1,
        [fuelLevelKey]: 1,
        [odometerKey]: 1,
      })
      .lean()
      .exec();

    function getDateRangeArray(startDate: Date, endDate: Date): string[] {
      const arr = [];
      const current = new Date(startDate);
      while (current <= endDate) {
        arr.push(current.toISOString().slice(0, 10)); // YYYY-MM-DD
        current.setDate(current.getDate() + 1);
      }
      return arr;
    }

    const dayMap = this.groupDataByDay(telemetryData);
    const result = [];

    for (const date of getDateRangeArray(startDate, endDate)) {
      const readings = dayMap.get(date) || [];
      const analysis = this.analyzeDayFuelData(readings);
      result.push({
        date,
        ...analysis,
        dayLabel: this.generateDayLabel(new Date(date), type),
      });
    }

    return result;
  }

  private groupDataByDay(telemetryData: any[]): Map<string, Array<{
    timestamp: Date;
    fuelLevel: number;
    odometer?: number;
  }>> {
    const dayMap = new Map();

    for (const dataPoint of telemetryData) {
      const reported = dataPoint.state?.reported;
      if (!reported) continue;

      const fuelLevel = reported[AVL_ID_MAP.FUEL_LEVEL];
      if (fuelLevel === undefined) continue;

      const timestamp = new Date(reported.ts);
      const dateKey = timestamp.toISOString().slice(0, 10);

      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, []);
      }

      dayMap.get(dateKey).push({
        timestamp,
        fuelLevel,
        odometer: reported[AVL_ID_MAP.TOTAL_ODOMETER]
      });
    }

    return dayMap;
  }

  private analyzeDayFuelData(readings: Array<{
    timestamp: Date;
    fuelLevel: number;
    odometer?: number;
  }>): {
    refueled: number;
    consumed: number;
    confidence: 'high' | 'medium' | 'low';
    dataPoints: number;
  } {
    if (readings.length < 2) {
      return { refueled: 0, consumed: 0, confidence: 'low', dataPoints: readings.length };
    }

    // Sort by timestamp
    readings.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Apply noise filtering
    const smoothedReadings = this.applyNoiseFilter(readings);
    
    // Detect refueling events
    const refuelEvents = this.detectRefuelEvents(smoothedReadings);
    const totalRefueled = refuelEvents.reduce((sum, event) => sum + event.amount, 0);

    // Calculate net consumption (accounting for refuels)
    const startFuel = smoothedReadings[0]?.fuelLevel || 0;
    const endFuel = smoothedReadings[smoothedReadings.length - 1]?.fuelLevel || 0;
    const netChange = endFuel - startFuel;
    const actualConsumption = Math.max(0, totalRefueled - netChange);

    // Validate with odometer data if available
    const confidence = this.calculateConfidence(readings, refuelEvents, actualConsumption);

    return {
      refueled: Math.round(totalRefueled * 100) / 100,
      consumed: Math.round(actualConsumption * 100) / 100,
      confidence,
      dataPoints: readings.length
    };
  }

  private applyNoiseFilter(readings: Array<{
    timestamp: Date;
    fuelLevel: number;
    odometer?: number;
  }>): Array<{ timestamp: Date; fuelLevel: number; odometer?: number; }> {
    if (readings.length <= 2) return readings;

    const filtered: Array<{ timestamp: Date; fuelLevel: number; odometer?: number; }> = [readings[0]!]; // Always keep first reading

    for (let i = 1; i < readings.length - 1; i++) {
      const prev = readings[i - 1]!;
      const current = readings[i]!;
      const next = readings[i + 1]!;

      // If current reading is significantly different from trend, it might be noise
      const prevDiff = Math.abs(current.fuelLevel - prev.fuelLevel);
      const nextDiff = Math.abs(next.fuelLevel - current.fuelLevel);
      const directDiff = Math.abs(next.fuelLevel - prev.fuelLevel);

      // If removing current point creates a smoother trend, it's likely noise
      if (directDiff < Math.max(prevDiff, nextDiff) && prevDiff < this.NOISE_FILTER) {
        continue; // Skip this reading as noise
      }

      filtered.push(current);
    }

    filtered.push(readings[readings.length - 1]!); // Always keep last reading
    return filtered;
  }

  private detectRefuelEvents(readings: Array<{
    timestamp: Date;
    fuelLevel: number;
    odometer?: number;
  }>): Array<{ timestamp: Date; amount: number; }> {
    const refuelEvents = [];

    for (let i = 1; i < readings.length; i++) {
      const prev = readings[i - 1]!;
      const current = readings[i]!;
      const increase = current.fuelLevel - prev.fuelLevel;

      // Check if this looks like a refuel
      if (increase >= this.REFUEL_THRESHOLD) {
        // Additional validation: refueling should take some time
        const timeDiff = (current.timestamp.getTime() - prev.timestamp.getTime()) / (1000 * 60);
        
        if (timeDiff >= this.MIN_REFUEL_TIME || increase >= 30) { // Large increases always count
          refuelEvents.push({
            timestamp: current.timestamp,
            amount: increase
          });
        }
      }
    }

    return refuelEvents;
  }

  private calculateConfidence(
    readings: Array<{ timestamp: Date; fuelLevel: number; odometer?: number; }>,
    refuelEvents: Array<{ timestamp: Date; amount: number; }>,
    consumption: number
  ): 'high' | 'medium' | 'low' {
    let score = 0;

    // Data quantity score
    if (readings.length >= this.MIN_READINGS_PER_DAY * 8) score += 3; // Excellent data
    else if (readings.length >= this.MIN_READINGS_PER_DAY) score += 2; // Good data
    else score += 1; // Minimal data

    // Odometer validation
    const hasOdometerData = readings.some(r => r.odometer !== undefined);
    if (hasOdometerData) {
      const odometerReadings = readings.filter(r => r.odometer !== undefined);
      if (odometerReadings.length >= 2) {
        const firstOdometer = odometerReadings[0]?.odometer;
        const lastOdometer = odometerReadings[odometerReadings.length - 1]?.odometer;
        
        if (firstOdometer !== undefined && lastOdometer !== undefined) {
          const distanceTraveled = Math.max(0, lastOdometer - firstOdometer);
          
          // If no distance traveled but fuel consumed, suspicious
          if (distanceTraveled === 0 && consumption > this.CONSUMPTION_THRESHOLD) {
            score -= 1;
          } else if (distanceTraveled > 0 && consumption === 0) {
            score -= 1; // Traveled but no fuel consumed
          } else {
            score += 1; // Odometer and fuel data align
          }
        }
      }
    }

    // Refuel pattern validation
    if (refuelEvents.length === 0 && consumption === 0) {
      score += 1; // Consistent no-activity day
    } else if (refuelEvents.length > 3) {
      score -= 1; // Too many refuels in one day seems suspicious
    }

    // Convert score to confidence level
    if (score >= 5) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
  }

  async getCurrentFuelSummary(imei: string): Promise<{
    vehicleId: string;
    status: string;
    startingFuel: number;
    endingFuel: number;
    distanceDriven: number;
    estimatedUsed: number;
    actualConsumption: number;
    fuelEfficiency: number; // km per liter
    fuelLevelStatus: string;
    currentFuelLevel: number;
    totalOdometer: number;
    fuelType: string;
    timestamp: number;
    dataQuality: 'high' | 'medium' | 'low';
  } | null> {

    const fuelLevelKey = `state.reported.${AVL_ID_MAP.FUEL_LEVEL}`;
    const odometerKey = `state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`;
    const vinKey = `state.reported.256`;
    const fuelTypeKey = `state.reported.${AVL_ID_MAP.FUEL_TYPE}`;
    const tsKey = `state.reported.ts`;

    const latest = await Telemetry.findOne({
      imei,
      [fuelLevelKey]: { $exists: true, $type: "number" },
    })
      .sort({ [tsKey]: -1 })
      .lean()
      .exec();

    if (!latest?.state?.reported) return null;

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const todayData = await Telemetry.find({
      imei,
      [tsKey]: { $gte: startOfDay, $lt: endOfDay },
      [fuelLevelKey]: { $exists: true, $type: "number" },
    })
      .sort({ [tsKey]: 1 })
      .select({
        [tsKey]: 1,
        [fuelLevelKey]: 1,
        [odometerKey]: 1,
      })
      .lean()
      .exec();

    const reported = latest.state.reported;
    const currentFuelLevel = reported[AVL_ID_MAP.FUEL_LEVEL] || 0;
    const currentOdometer = reported[AVL_ID_MAP.TOTAL_ODOMETER] || 0;
    const vehicleId = reported['256'] || 'Unknown';
    const fuelType = this.mapFuelType(reported[AVL_ID_MAP.FUEL_TYPE]);

    let startingFuel = currentFuelLevel;
    let endingFuel = currentFuelLevel;
    let distanceDriven = 0;
    let actualConsumption = 0;
    let dataQuality: 'high' | 'medium' | 'low' = 'low';

    if (todayData.length > 0) {
      const firstReading = todayData[0]?.state?.reported;
      const lastReading = todayData[todayData.length - 1]?.state?.reported;
      if (firstReading && lastReading) {
        startingFuel = firstReading[AVL_ID_MAP.FUEL_LEVEL] || 0;
        endingFuel = lastReading[AVL_ID_MAP.FUEL_LEVEL] || 0;
        const startOdometer = firstReading[AVL_ID_MAP.TOTAL_ODOMETER] || 0;
        const endOdometer = lastReading[AVL_ID_MAP.TOTAL_ODOMETER] || 0;
        distanceDriven = Math.max(0, endOdometer - startOdometer);

        // Use the enhanced analysis for today's data
        const todayReadings = todayData.map(d => ({
          timestamp: new Date(d.state?.reported?.ts || 0),
          fuelLevel: d.state?.reported?.[AVL_ID_MAP.FUEL_LEVEL] || 0,
          odometer: d.state?.reported?.[AVL_ID_MAP.TOTAL_ODOMETER]
        }));

        const analysis = this.analyzeDayFuelData(todayReadings);
        actualConsumption = analysis.consumed;
        dataQuality = analysis.confidence;
      }
    }

    const fuelEfficiency = distanceDriven > 0 && actualConsumption > 0 
      ? Math.round((distanceDriven / actualConsumption) * 100) / 100 
      : 0;

    const estimatedUsed = startingFuel > endingFuel ? startingFuel - endingFuel
      : (distanceDriven > 0 ? (distanceDriven / 100) * 10 : 0);

    return {
      vehicleId: vehicleId.toString(),
      status: this.getVehicleStatus(currentFuelLevel),
      startingFuel: parseFloat(startingFuel.toFixed(1)),
      endingFuel: parseFloat(endingFuel.toFixed(1)),
      distanceDriven: parseFloat(distanceDriven.toFixed(1)),
      estimatedUsed: parseFloat(estimatedUsed.toFixed(2)),
      actualConsumption: parseFloat(actualConsumption.toFixed(2)),
      fuelEfficiency,
      fuelLevelStatus: this.getFuelLevelStatus(currentFuelLevel),
      currentFuelLevel: parseFloat(currentFuelLevel.toFixed(1)),
      totalOdometer: currentOdometer,
      fuelType,
      timestamp: new Date(reported.ts).getTime(),
      dataQuality,
    };
  }

  private generateDayLabel(date: Date, type: ChartGroupingType): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    switch (type) {
      case "weekly":
        return `Week ${this.getWeekNumber(date)} ${date.getFullYear()}`;
      case "monthly":
        return `${months[date.getMonth()]}/${date.getFullYear()}`;
      case "daily":
      default:
        return days[date.getDay()] ?? '';
    }
  }

  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  private getVehicleStatus(fuelLevel: number): string {
    if (fuelLevel >= 75) return "Active";
    if (fuelLevel >= 30) return "Active";
    if (fuelLevel >= 10) return "Low Fuel";
    return "Critical";
  }

  private getFuelLevelStatus(fuelLevel: number): string {
    if (fuelLevel >= 75) return "Full";
    if (fuelLevel >= 30) return "Good";
    if (fuelLevel >= 10) return "Low";
    return "Critical";
  }

  private mapFuelType(fuelTypeRaw: number | undefined): string {
    switch (fuelTypeRaw) {
      case 0: return "Petrol";
      case 1: return "Diesel";
      case 2: return "LPG";
      case 3: return "CNG";
      case 4: return "Electric";
      default: return "Unknown";
    }
  }
}