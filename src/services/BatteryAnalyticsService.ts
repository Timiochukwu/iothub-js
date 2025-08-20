import { Telemetry } from "../models/Telemetry";
import { AVL_ID_MAP } from "../utils/avlIdMap";
import {
  BatterySummary,
  ChartGroupingType,
  EnhancedBatteryStatus,
} from "../types";

export class BatteryAnalyticsService {
  /**
   * Generates a battery analytics report for a given IMEI over a specified date range,
   * grouped by day, week, or month.
   *
   * @param imei The IMEI of the device.
   * @param startDate The start date for the report.
   * @param endDate The end date for the report.
   * @param type The grouping type for the chart (daily, weekly, monthly).
   * @returns A Map where keys are date labels (e.g., "YYYY-MM-DD") and values are BatterySummary objects.
   */
  async getBatteryAnalyticsReport(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType
  ): Promise<Map<string, BatterySummary>> {
    try {
      console.log("=== DEBUG: Starting getBatteryAnalyticsReport ===");
      console.log("IMEI:", imei);
      console.log("Date range:", startDate, "to", endDate);
      console.log("Grouping type:", type);
  
      // First, let's get the actual data structure
      const sampleData = await Telemetry.findOne({ imei });
      
      if (!sampleData) {
        console.log("No telemetry data found for IMEI:", imei);
        return new Map();
      }

      console.log("=== COMPLETE DATA STRUCTURE ANALYSIS ===");
      const dataObj = sampleData.toObject?.() || sampleData;
      
      // Recursive function to explore the entire structure
      const exploreStructure = (obj: any, path: string = '', depth: number = 0, maxDepth: number = 4): void => {
        if (depth > maxDepth || !obj || typeof obj !== 'object') return;
        
        const indent = '  '.repeat(depth);
        
        if (Array.isArray(obj)) {
          console.log(`${indent}${path}: Array[${obj.length}]`);
          if (obj.length > 0) {
            exploreStructure(obj[0], `${path}[0]`, depth + 1, maxDepth);
          }
        } else {
          Object.keys(obj).forEach(key => {
            const value = obj[key];
            const currentPath = path ? `${path}.${key}` : key;
            
            if (value === null) {
              console.log(`${indent}${currentPath}: null`);
            } else if (value === undefined) {
              console.log(`${indent}${currentPath}: undefined`);
            } else if (typeof value === 'object') {
              if (value.constructor && value.constructor.name !== 'Object') {
                // Special object type (Date, ObjectId, etc.)
                console.log(`${indent}${currentPath}: ${value.constructor.name} = ${value}`);
              } else {
                console.log(`${indent}${currentPath}: Object {${Object.keys(value).join(', ')}}`);
                exploreStructure(value, currentPath, depth + 1, maxDepth);
              }
            } else {
              console.log(`${indent}${currentPath}: ${typeof value} = ${value}`);
            }
          });
        }
      };

      exploreStructure(dataObj);

      console.log("\n=== SEARCHING FOR TELEMETRY PATTERNS ===");
      
      // Search for timestamp patterns
      const findTimestamps = (obj: any, path: string = ''): Array<{path: string, value: any, type: string}> => {
        const timestamps: Array<{path: string, value: any, type: string}> = [];
        
        if (!obj || typeof obj !== 'object') return timestamps;
        
        Object.keys(obj).forEach(key => {
          const value = obj[key];
          const currentPath = path ? `${path}.${key}` : key;
          
          // Check if this looks like a timestamp
          if (typeof value === 'number' && value > 1000000000000) { // Unix timestamp in milliseconds
            timestamps.push({path: currentPath, value, type: 'unix_ms'});
          } else if (typeof value === 'number' && value > 1000000000) { // Unix timestamp in seconds
            timestamps.push({path: currentPath, value, type: 'unix_s'});
          } else if (value instanceof Date) {
            timestamps.push({path: currentPath, value, type: 'date'});
          } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
            timestamps.push({path: currentPath, value, type: 'iso_string'});
          } else if (value && typeof value === 'object' && value.$numberLong) {
            timestamps.push({path: currentPath, value: value.$numberLong, type: 'bson_long'});
          } else if (key.toLowerCase().includes('time') || key.toLowerCase().includes('date') || key === 'ts') {
            timestamps.push({path: currentPath, value, type: 'name_based'});
          }
          
          // Recurse into objects
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            timestamps.push(...findTimestamps(value, currentPath));
          }
        });
        
        return timestamps;
      };

      const timestampCandidates = findTimestamps(dataObj);
      console.log("Timestamp candidates found:", timestampCandidates);

      // Search for voltage patterns
      const findVoltages = (obj: any, path: string = ''): Array<{path: string, value: any, type: string}> => {
        const voltages: Array<{path: string, value: any, type: string}> = [];
        
        if (!obj || typeof obj !== 'object') return voltages;
        
        Object.keys(obj).forEach(key => {
          const value = obj[key];
          const currentPath = path ? `${path}.${key}` : key;
          
          // Check if this looks like voltage
          if (typeof value === 'number') {
            if (value >= 3000 && value <= 50000) { // millivolts range
              voltages.push({path: currentPath, value, type: 'millivolts'});
            } else if (value >= 3 && value <= 50) { // volts range
              voltages.push({path: currentPath, value, type: 'volts'});
            }
          }
          
          // Name-based detection
          if (key.toLowerCase().includes('volt') || key.toLowerCase().includes('batt') || 
              key === '66' || key === '67' || key === '68') {
            voltages.push({path: currentPath, value, type: 'name_based'});
          }
          
          // Recurse into objects
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            voltages.push(...findVoltages(value, currentPath));
          }
        });
        
        return voltages;
      };

      const voltageCandidates = findVoltages(dataObj);
      console.log("Voltage candidates found:", voltageCandidates);

      // Search for any numeric fields that might be useful
      const findNumericFields = (obj: any, path: string = ''): Array<{path: string, value: any}> => {
        const numerics: Array<{path: string, value: any}> = [];
        
        if (!obj || typeof obj !== 'object') return numerics;
        
        Object.keys(obj).forEach(key => {
          const value = obj[key];
          const currentPath = path ? `${path}.${key}` : key;
          
          if (typeof value === 'number') {
            numerics.push({path: currentPath, value});
          }
          
          // Recurse into objects
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            numerics.push(...findNumericFields(value, currentPath));
          }
        });
        
        return numerics;
      };

      const numericFields = findNumericFields(dataObj);
      console.log("All numeric fields found:", numericFields);

      // Let's also check a few more documents to see if structure is consistent
      console.log("\n=== CHECKING MULTIPLE DOCUMENTS FOR CONSISTENCY ===");
      const multipleDocs = await Telemetry.find({ imei }).limit(3);
      
      multipleDocs.forEach((doc, index) => {
        console.log(`\nDocument ${index + 1} structure:`);
        const docObj = doc.toObject?.() || doc;
        console.log(`Keys: ${Object.keys(docObj)}`);
        
        // Check for different possible data locations
        const possibleDataPaths = [
          'data',
          'payload', 
          'telemetry',
          'readings',
          'values',
          'state',
          'reported'
        ];
        
       
      });

      // For now, return empty map since we need to understand the structure first
      console.log("\n=== ANALYSIS COMPLETE ===");
      console.log("Please review the structure above and update the field mappings accordingly.");
      
      return new Map();

    } catch (error) {
      console.error("Error in getBatteryAnalyticsReport:", error);
      throw error;
    }
  }

  // // Helper method for alternative field
  // private async getBatteryAnalyticsWithAlternativeField(
  //   imei: string,
  //   startDate: Date,
  //   endDate: Date,
  //   type: ChartGroupingType,
  //   voltageKey: string
  // ): Promise<Map<string, BatterySummary>> {
  //   // This is a simplified version using the alternative voltage field
  //   // You can copy the main pipeline logic here but with the alternative field
  //   console.log(`Using alternative voltage field: ${voltageKey}`);
    
  //   // For now, return empty map - implement the full pipeline if needed
  //   return new Map();
  // }

  // // Helper method for alternative field
  // private async getBatteryAnalyticsWithAlternativeField(
  //   imei: string,
  //   startDate: Date,
  //   endDate: Date,
  //   type: ChartGroupingType,
  //   voltageKey: string
  // ): Promise<Map<string, BatterySummary>> {
  //   // This is a simplified version using the alternative voltage field
  //   // You can copy the main pipeline logic here but with the alternative field
  //   console.log(`Using alternative voltage field: ${voltageKey}`);
    
  //   // For now, return empty map - implement the full pipeline if needed
  //   return new Map();
  // }
  
  // Alternative method to try different voltage fields
  private async getBatteryAnalyticsWithField(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType,
    voltageField: string
  ): Promise<Map<string, BatterySummary>> {
    console.log(`Trying battery analytics with voltage field: ${voltageField}`);
    
    const voltageKey = `state.reported.${voltageField}`;
    const tsKey = `state.reported.ts`;
    
    let groupByFormat: string;
    switch (type) {
      case "weekly":
        groupByFormat = "%Y-%U";
        break;
      case "monthly":
        groupByFormat = "%Y-%m";
        break;
      case "daily":
      default:
        groupByFormat = "%Y-%m-%d";
        break;
    }
  
    const pipeline: any[] = [
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [voltageKey]: { $exists: true, $type: "number", $gt: 0 },
        },
      },
      {
        $sort: { [tsKey]: 1 },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: groupByFormat,
              date: { $toDate: `$${tsKey}` },
              timezone: "UTC",
            },
          },
          voltageRaw: { $avg: `$${voltageKey}` },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          label: "$_id",
          voltage: { $divide: ["$voltageRaw", 1000] }, // Convert mV to V
          count: "$count",
        },
      },
      {
        $sort: { label: 1 },
      },
    ];
  
    const results = await Telemetry.aggregate(pipeline);
    console.log(`Alternative approach returned ${results.length} results`);
  
    const reportMap = new Map<string, BatterySummary>();
  
    results.forEach((point) => {
      const voltage = parseFloat(point.voltage?.toFixed(2) ?? "0");
  
      reportMap.set(point.label, {
        startingVoltage: voltage,
        endingVoltage: voltage,
        minVoltage: voltage,
        maxVoltage: voltage,
        averageVoltage: voltage,
        overallVoltage: voltage,
        normalRangeMin: 12.4,
        normalRangeMax: 13.6,
        temperature: 25,
        temperatureStatus: "NORMAL",
        soh: this.calculateStateOfHealth(voltage),
        sohStatus: this.getSohStatus(voltage),
        estimatedLife: 100,
        estimatedLifeUnit: "hrs",
        current: 0,
        currentStatus: "IDLE",
        isCharging: false,
        batteryHealth: this.getBatteryHealth(voltage),
      });
    });
  
    return reportMap;
  }

  /**
   * Fetches the current battery status for a given IMEI.
   * Retrieves the latest telemetry data and calculates various battery health metrics.
   *
   * @param imei The IMEI of the device.
   * @returns An EnhancedBatteryStatus object if data is found, otherwise null.
   */
  async getCurrentBatteryStatus(
    imei: string
  ): Promise<EnhancedBatteryStatus | null> {
    const tsKey = `state.reported.ts`;
    const voltageKey = `state.reported.${AVL_ID_MAP.EXTERNAL_VOLTAGE}`;
    const currentKey = `state.reported.${AVL_ID_MAP.BATTERY_CURRENT}`;
    const temperatureKey = `state.reported.${AVL_ID_MAP.AMBIENT_AIR_TEMPERATURE}`;

    // Find the latest telemetry record for the given IMEI that has voltage data.
    const latest = await Telemetry.findOne({
      imei,
      [voltageKey]: { $exists: true },
    })
      .sort({ [tsKey]: -1 }) // Sort by timestamp in descending order to get the latest
      .select({
        // Select only the necessary fields
        [tsKey]: 1,
        [voltageKey]: 1,
        [currentKey]: 1,
        [temperatureKey]: 1,
      })
      .lean()
      .exec();

    console.log(`Battery Latest telemetry for IMEI ${imei}:`, latest);
    console.log("Battery Latest telemetry state:", latest?.state?.reported);

    // If no telemetry data or reported state is found, return null.
    if (!latest || !latest.state?.reported) {
      return null;
    }

    const reported = latest.state.reported;
    // Extract raw values, defaulting to 0 if not present.
    const voltageRaw = reported[AVL_ID_MAP.EXTERNAL_VOLTAGE] || 0;
    const currentRaw = reported[AVL_ID_MAP.BATTERY_CURRENT] || 0;
    const temperature = reported[AVL_ID_MAP.AMBIENT_AIR_TEMPERATURE] || 25; // Default to 25C if no temp data

    // Convert raw millivolt/milliampere values to Volts/Amperes.
    const voltage = voltageRaw / 1000;
    const current = currentRaw / 1000;

    // Return the calculated enhanced battery status.
    const data = {
      overallVoltage: parseFloat(voltage.toFixed(2)),
      normalRangeMin: 12.4,
      normalRangeMax: 13.6,
      temperature: temperature,
      temperatureStatus: this.getTemperatureStatus(temperature),
      soh: this.calculateStateOfHealth(voltage),
      sohStatus: this.getSohStatus(voltage),
      estimatedLife: this.calculateEstimatedLife(voltage, current),
      estimatedLifeUnit: "hrs",
      current: parseFloat(Math.abs(current).toFixed(1)), // Display absolute current for magnitude
      currentStatus: this.getCurrentStatus(current),
      isCharging: current > 0.1, // Consider current > 0.1A as charging
      batteryHealth: this.getBatteryHealth(voltage),
      timestamp: reported.ts || Date.now(), // Use reported timestamp or current time as fallback
    };

    console.log("Battery Data: ", data);
    return data;
  }

  /**
   * Determines the temperature status based on the given temperature value.
   * @param temp The temperature in Celsius.
   * @returns A string indicating the temperature status.
   */
  private getTemperatureStatus(temp: number): string {
    if (temp > 50) return "High Temperature";
    if (temp < -10) return "Low Temperature";
    return "Operating Normally";
  }

  /**
   * Calculates the State of Health (SOH) of the battery based on its voltage.
   * This is a simplified estimation for a 12V lead-acid battery.
   * @param voltage The battery voltage in Volts.
   * @returns A number representing the State of Health percentage (0-100).
   */
  private calculateStateOfHealth(voltage: number): number {
    // These values are typical for a 12V lead-acid battery at rest (no load/charge)
    // 12.6V+ is ~100%
    // 12.4V is ~75%
    // 12.2V is ~50%
    // 12.0V is ~25%
    // This mapping provides a rough SOH percentage.
    if (voltage >= 13.5) return 95; // Fully charged, possibly charging
    if (voltage >= 13.0) return 85;
    if (voltage >= 12.6) return 75;
    if (voltage >= 12.4) return 65;
    if (voltage >= 12.0) return 50;
    return 30; // Very low
  }

  /**
   * Provides a descriptive status for the State of Health (SOH).
   * @param voltage The battery voltage in Volts.
   * @returns A string describing the SOH status.
   */
  private getSohStatus(voltage: number): string {
    const soh = this.calculateStateOfHealth(voltage);
    if (soh >= 85) return "still performing well";
    if (soh >= 70) return "showing signs of aging";
    if (soh >= 50) return "needs attention";
    return "requires replacement";
  }

  /**
   * Estimates the remaining life of the battery in hours.
   * This is a simplified calculation and assumes a 50Ah battery capacity.
   * If charging, it estimates time to full charge; if discharging, time until low battery.
   * @param voltage The current battery voltage in Volts.
   * @param current The current flowing in/out of the battery in Amperes (positive for charging, negative for discharging).
   * @returns The estimated remaining life in hours, rounded to one decimal place.
   */
  private calculateEstimatedLife(voltage: number, current: number): number {
    const batteryCapacity = 50; // Ah (Ampere-hours), assumed capacity for a typical vehicle battery

    // Default current draw if no data or very low current, to prevent division by zero
    const minimumCurrentDraw = 0.5; // Amperes
    const currentAbsolute = Math.abs(current);
    const actualCurrentDraw =
      currentAbsolute > 0.05 ? currentAbsolute : minimumCurrentDraw;

    if (current > 0.1) {
      // Battery is charging
      // Rough estimation: assume it needs to reach 13.6V (full charge)
      // and each 0.1V increase might correlate to a certain Ah
      // This is a very rough model, a more accurate one requires understanding charge curves.
      const targetVoltage = 13.6;
      const voltageDifference = targetVoltage - voltage;
      // Assume 1V difference corresponds to 'X' Ah for simplicity.
      // E.g., if 1.2V difference means 20% of 50Ah, then 0.1V means 0.83Ah
      const estimatedAhNeeded = Math.max(
        0,
        voltageDifference * (batteryCapacity / 1.2)
      ); // Rough scaling
      return parseFloat((estimatedAhNeeded / actualCurrentDraw).toFixed(1));
    } else {
      // Battery is discharging or idle (current <= 0.1A)
      // Estimate remaining usable capacity down to a 'low' voltage (e.g., 12.0V)
      const lowVoltageThreshold = 12.0;
      if (voltage <= lowVoltageThreshold) return 0; // Already low
      const voltageRangeForCapacity = 12.6 - lowVoltageThreshold; // Voltage range from 100% to 25% for calculation
      const currentVoltageAboveThreshold = voltage - lowVoltageThreshold;

      // Calculate the proportion of remaining capacity based on voltage,
      // and then convert to actual Ah.
      const remainingCapacityRatio = Math.max(
        0,
        currentVoltageAboveThreshold / voltageRangeForCapacity
      );
      const remainingAh = remainingCapacityRatio * (batteryCapacity * 0.75); // Assume 75% of capacity is usable in this range

      return parseFloat((remainingAh / actualCurrentDraw).toFixed(1));
    }
  }

  /**
   * Determines the current flow status (charging, discharging, idle).
   * @param current The current in Amperes.
   * @returns A string indicating the current status.
   */
  private getCurrentStatus(current: number): string {
    if (current > 0.1) return "charging currently"; // Positive current indicates charging
    if (current < -0.1) return "discharging"; // Negative current indicates discharging
    return "idle"; // Very low or no current
  }

  /**
   * Provides a general battery health assessment based on voltage.
   * @param voltage The battery voltage in Volts.
   * @returns A string indicating the general battery health.
   */
  private getBatteryHealth(voltage: number): string {
    if (voltage >= 13.5) return "Excellent";
    if (voltage >= 13.0) return "Good";
    if (voltage >= 12.4) return "Fair";
    return "Poor";
  }
}
