import { Telemetry } from "../models/Telemetry";
import { AVL_ID_MAP } from "../utils/avlIdMap";
import { BatterySummary, ChartGroupingType, EnhancedBatteryStatus } from "../types";

export class BatteryAnalyticsService {

  async getBatteryAnalyticsReport(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType
  ): Promise<Map<string, BatterySummary>> {
    
    const voltageKey = `state.reported.${AVL_ID_MAP.EXTERNAL_VOLTAGE}`;     // ID 66
    const currentKey = `state.reported.${AVL_ID_MAP.BATTERY_CURRENT}`;       // ID 68
    const temperatureKey = `state.reported.${AVL_ID_MAP.AMBIENT_AIR_TEMPERATURE}`; // ID 53
    const tsKey = `state.reported.ts`;

    let groupByFormat: string;
    switch (type) {
      case "weekly": groupByFormat = "%Y-%U"; break;
      case "monthly": groupByFormat = "%Y-%m"; break;
      case "daily":
      default: groupByFormat = "%Y-%m-%d"; break;
    }

    const pipeline: any[] = [
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [voltageKey]: { $exists: true, $type: "number" },
        },
      },

      { $sort: { [tsKey]: 1 } },

      {
        $group: {
          _id: {
            $dateToString: {
              format: groupByFormat,
              date: { $toDate: `$${tsKey}` },
              timezone: "UTC",
            },
          },
          startingVoltageRaw: { $first: `$${voltageKey}` },
          endingVoltageRaw: { $last: `$${voltageKey}` },
          minVoltageRaw: { $min: `$${voltageKey}` },
          maxVoltageRaw: { $max: `$${voltageKey}` },
          averageVoltageRaw: { $avg: `$${voltageKey}` },
          
          // Enhanced data
          currentRaw: { $last: `$${currentKey}` },
          temperature: { $last: `$${temperatureKey}` },
          avgCurrent: { $avg: `$${currentKey}` },
        },
      },

      {
        $project: {
          _id: 0,
          label: "$_id",
          startingVoltage: { $divide: ["$startingVoltageRaw", 1000] },
          endingVoltage: { $divide: ["$endingVoltageRaw", 1000] },
          minVoltage: { $divide: ["$minVoltageRaw", 1000] },
          maxVoltage: { $divide: ["$maxVoltageRaw", 1000] },
          averageVoltage: { $divide: ["$averageVoltageRaw", 1000] },
          
          // Enhanced calculations
          overallVoltage: { $divide: ["$endingVoltageRaw", 1000] },
          current: { $divide: [{ $ifNull: ["$currentRaw", 0] }, 1000] }, // Convert mA to A
          temperature: { $ifNull: ["$temperature", 25] },
        },
      },

      { $sort: { label: 1 } },
    ];

    const results = await Telemetry.aggregate(pipeline);

    const reportMap = new Map<string, BatterySummary>();

    results.forEach((point) => {
      const voltage = parseFloat(point.overallVoltage?.toFixed(2) ?? "0");
      const current = parseFloat(point.current?.toFixed(1) ?? "0");
      const temperature = point.temperature || 25;
      
      reportMap.set(point.label, {
        // Basic voltage data
        startingVoltage: parseFloat(point.startingVoltage?.toFixed(2) ?? "0"),
        endingVoltage: parseFloat(point.endingVoltage?.toFixed(2) ?? "0"),
        minVoltage: parseFloat(point.minVoltage?.toFixed(2) ?? "0"),
        maxVoltage: parseFloat(point.maxVoltage?.toFixed(2) ?? "0"),
        averageVoltage: parseFloat(point.averageVoltage?.toFixed(2) ?? "0"),
        
        // Enhanced data for UI
        overallVoltage: voltage,
        normalRangeMin: 12.4,
        normalRangeMax: 13.6,
        temperature: temperature,
        temperatureStatus: this.getTemperatureStatus(temperature),
        soh: this.calculateStateOfHealth(voltage, point.minVoltage, point.maxVoltage),
        sohStatus: this.getSohStatus(voltage),
        estimatedLife: this.calculateEstimatedLife(voltage, current),
        estimatedLifeUnit: "hrs",
        current: Math.abs(current),
        currentStatus: this.getCurrentStatus(current),
        isCharging: current > 0.1,
        batteryHealth: this.getBatteryHealth(voltage)
      });
    });

    return reportMap;
  }

  async getCurrentBatteryStatus(imei: string): Promise<EnhancedBatteryStatus | null> {
    
    const tsKey = `state.reported.ts`;
    const voltageKey = `state.reported.${AVL_ID_MAP.EXTERNAL_VOLTAGE}`;
    const currentKey = `state.reported.${AVL_ID_MAP.BATTERY_CURRENT}`;
    const temperatureKey = `state.reported.${AVL_ID_MAP.AMBIENT_AIR_TEMPERATURE}`;

    const latest = await Telemetry.findOne({ 
      imei,
      [voltageKey]: { $exists: true }
    })
    .sort({ [tsKey]: -1 })
    .select({
      [tsKey]: 1,
      [voltageKey]: 1,
      [currentKey]: 1,
      [temperatureKey]: 1
    });

    if (!latest || !latest.state?.reported) {
      return null;
    }

    const reported = latest.state.reported;
    const voltageRaw = reported[AVL_ID_MAP.EXTERNAL_VOLTAGE] || 0;
    const currentRaw = reported[AVL_ID_MAP.BATTERY_CURRENT] || 0;
    const temperature = reported[AVL_ID_MAP.AMBIENT_AIR_TEMPERATURE] || 25;
    
    const voltage = voltageRaw / 1000; // Convert to volts
    const current = currentRaw / 1000; // Convert mA to A

    return {
      overallVoltage: parseFloat(voltage.toFixed(2)),
      normalRangeMin: 12.4,
      normalRangeMax: 13.6,
      temperature: temperature,
      temperatureStatus: this.getTemperatureStatus(temperature),
      soh: this.calculateStateOfHealth(voltage),
      sohStatus: this.getSohStatus(voltage),
      estimatedLife: this.calculateEstimatedLife(voltage, current),
      estimatedLifeUnit: "hrs",
      current: parseFloat(Math.abs(current).toFixed(1)),
      currentStatus: this.getCurrentStatus(current),
      isCharging: current > 0.1,
      batteryHealth: this.getBatteryHealth(voltage),
      timestamp: reported.ts || Date.now()
    };
  }

  // Helper methods
  private getTemperatureStatus(temp: number): string {
    if (temp > 50) return "High Temperature";
    if (temp < -10) return "Low Temperature";
    return "Operating Normally";
  }

  private calculateStateOfHealth(voltage: number, minVoltage?: number, maxVoltage?: number): number {
    // SOH calculation based on voltage
    if (voltage >= 13.5) return 95;
    if (voltage >= 13.0) return 85;
    if (voltage >= 12.6) return 75;
    if (voltage >= 12.4) return 65;
    if (voltage >= 12.0) return 50;
    return 30;
  }

  private getSohStatus(voltage: number): string {
    const soh = this.calculateStateOfHealth(voltage);
    if (soh >= 85) return "still performing well";
    if (soh >= 70) return "showing signs of aging";
    if (soh >= 50) return "needs attention";
    return "requires replacement";
  }

  private calculateEstimatedLife(voltage: number, current: number): number {
    // Simple estimation based on voltage and current
    // Assume 50Ah battery capacity
    const batteryCapacity = 50; // Ah
    const currentDraw = Math.abs(current) || 0.5; // Default 0.5A if no current data
    
    if (current > 0.1) {
      // Charging - estimate time to full
      const chargeNeeded = (13.6 - voltage) * 10; // Rough estimation
      return parseFloat((chargeNeeded / current).toFixed(1));
    } else {
      // Discharging - estimate time until low battery
      const remainingCapacity = ((voltage - 12.0) / 1.6) * batteryCapacity;
      return parseFloat((remainingCapacity / currentDraw).toFixed(1));
    }
  }

  private getCurrentStatus(current: number): string {
    if (current > 0.1) return "charging currently";
    if (current < -0.1) return "discharging";
    return "idle";
  }

  private getBatteryHealth(voltage: number): string {
    if (voltage >= 13.5) return "Excellent";
    if (voltage >= 13.0) return "Good";
    if (voltage >= 12.4) return "Fair";
    return "Poor";
  }
}