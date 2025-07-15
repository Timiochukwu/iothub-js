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
    const voltageKey = `state.reported.${AVL_ID_MAP.EXTERNAL_VOLTAGE}`; // AVL ID 66: Vehicle battery voltage in Millivolts (mV)
    const currentKey = `state.reported.${AVL_ID_MAP.BATTERY_CURRENT}`; // AVL ID 68: Battery Current (mA, assumed)
    const temperatureKey = `state.reported.${AVL_ID_MAP.AMBIENT_AIR_TEMPERATURE}`; // AVL ID 53: Ambient Air Temperature (Celsius)
    const tsKey = `state.reported.ts`; // Timestamp in milliseconds

    let groupByFormat: string;
    switch (type) {
      case "weekly":
        groupByFormat = "%Y-%U"; // Year and week number
        break;
      case "monthly":
        groupByFormat = "%Y-%m"; // Year and month
        break;
      case "daily":
      default:
        groupByFormat = "%Y-%m-%d"; // Year, month, and day
        break;
    }

    const pipeline: any[] = [
      {
        // Stage 1: Filter telemetry data by IMEI and timestamp range.
        // Ensure voltage data exists and is a number.
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [voltageKey]: { $exists: true, $type: "number" },
        },
      },
      {
        // Stage 2: Sort by timestamp to correctly get $first and $last values in the group.
        $sort: { [tsKey]: 1 },
      },
      {
        // Stage 3: Group data based on the specified chart grouping type (daily, weekly, monthly).
        // Calculate min, max, average, first, and last voltage and current readings.
        $group: {
          _id: {
            // Convert timestamp to Date object and format it for grouping
            $dateToString: {
              format: groupByFormat,
              date: { $toDate: `$${tsKey}` },
              timezone: "UTC", // Use UTC to avoid timezone issues with grouping
            },
          },
          startingVoltageRaw: { $first: `$${voltageKey}` }, // First voltage reading in the group
          endingVoltageRaw: { $last: `$${voltageKey}` }, // Last voltage reading in the group
          minVoltageRaw: { $min: `$${voltageKey}` }, // Minimum voltage in the group
          maxVoltageRaw: { $max: `$${voltageKey}` }, // Maximum voltage in the group
          averageVoltageRaw: { $avg: `$${voltageKey}` }, // Average voltage in the group

          currentRaw: { $last: `$${currentKey}` }, // Last current reading in the group
          temperature: { $last: `$${temperatureKey}` }, // Last temperature reading in the group
          avgCurrent: { $avg: { $ifNull: [`$${currentKey}`, 0] } }, // Average current, handling missing values
          count: { $sum: 1 }, // Count of documents in each group
        },
      },
      {
        // Stage 4: Project the grouped results into the desired BatterySummary format.
        // Convert raw millivolt/milliampere values to Volts/Amperes.
        // Handle potential nulls for current and temperature.
        $project: {
          _id: 0, // Exclude the default _id field
          label: "$_id", // Rename _id to label for the report map key
          startingVoltage: { $divide: ["$startingVoltageRaw", 1000] },
          endingVoltage: { $divide: ["$endingVoltageRaw", 1000] },
          minVoltage: { $divide: ["$minVoltageRaw", 1000] },
          maxVoltage: { $divide: ["$maxVoltageRaw", 1000] },
          averageVoltage: { $divide: ["$averageVoltageRaw", 1000] },

          // For overallVoltage, we'll use the endingVoltage for consistency with current status
          overallVoltage: { $divide: ["$endingVoltageRaw", 1000] },
          current: { $divide: [{ $ifNull: ["$currentRaw", 0] }, 1000] }, // Convert mA to A, default to 0 if null
          temperature: { $ifNull: ["$temperature", 25] }, // Default temperature to 25 if null
          hasData: { $gt: ["$count", 0] }, // Indicate if the group has any data
        },
      },
      {
        // Stage 5: Sort the final results by label (date) for chronological order.
        $sort: { label: 1 },
      },
    ];

    const results = await Telemetry.aggregate(pipeline);
    const reportMap = new Map<string, BatterySummary>();

    results.forEach((point) => {
      // Ensure numeric conversion and handle potential undefined values
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
        normalRangeMin: 12.4, // Standard normal range for 12V lead-acid battery (float voltage)
        normalRangeMax: 13.6, // Standard normal range for 12V lead-acid battery (charging voltage)
        temperature: temperature,
        temperatureStatus: this.getTemperatureStatus(temperature),
        soh: this.calculateStateOfHealth(voltage),
        sohStatus: this.getSohStatus(voltage),
        estimatedLife: this.calculateEstimatedLife(voltage, current),
        estimatedLifeUnit: "hrs",
        current: Math.abs(current), // Display absolute current for magnitude
        currentStatus: this.getCurrentStatus(current),
        isCharging: current > 0.1, // Consider current > 0.1A as charging
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
