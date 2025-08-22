import { Telemetry } from "../models/Telemetry";
import { AVL_ID_MAP } from "../utils/avlIdMap";
import { ChartGroupingType } from "../types"; // Assuming this exists for grouping
// import { FuelSummary, CurrentFuelStatus } from "../types"; // Define these types as needed

export class FuelAnalyticsService {
  /**
   * Generates a fuel analytics report for a given IMEI over a specified date range,
   * grouped by day, week, or month.
   *
   * @param imei The IMEI of the device.
   * @param startDate The start date for the report.
   * @param endDate The end date for the report.
   * @param type The grouping type for the chart (daily, weekly, monthly).
   * @returns A Map where keys are date labels (e.g., "YYYY-MM-DD") and values are FuelSummary objects.
   */
  async getFuelAnalyticsReport(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType
  ): Promise<Map<string, any>> {
    // console.log(imei, startDate, endDate, type);
    const modifiedStartData = new Date(startDate);
    modifiedStartData.setHours(0, 0, 0, 0);

    const modifiedEndData = new Date(endDate);
    // till end of day
    modifiedEndData.setHours(23, 59, 59, 999);

    const fuelLevelKey = `state.reported.${AVL_ID_MAP.FUEL_LEVEL}`; // AVL ID 48: Fuel Level (percentage or raw value)
    const totalOdometerKey = `state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`; // AVL ID 16: Total Odometer (km)
    const distanceSinceCodesClearKey = `state.reported.${AVL_ID_MAP.DISTANCE_SINCE_CODES_CLEAR}`; // AVL ID 49
    const fuelTypeKey = `state.reported.${AVL_ID_MAP.FUEL_TYPE}`; // AVL ID 759
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
        // Ensure fuel level data exists and is a number.
        $match: {
          imei,
          // [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [tsKey]: { $gte: modifiedStartData, $lte: modifiedEndData },
          [fuelLevelKey]: { $exists: true, $type: "number" },
        },
      },
      {
        // Stage 2: Sort by timestamp to correctly get $first and $last values in the group.
        $sort: { [tsKey]: 1 },
      },
      {
        // Stage 3: Group data based on the specified chart grouping type.
        // Calculate min, max, average, first, and last fuel levels, and total distance.
        $group: {
          _id: {
            $dateToString: {
              format: groupByFormat,
              date: { $toDate: `$${tsKey}` },
              timezone: "UTC", // Use UTC to avoid timezone issues with grouping
            },
          },
          firstFuelLevel: { $first: `$${fuelLevelKey}` }, // First fuel level reading in the group
          lastFuelLevel: { $last: `$${fuelLevelKey}` }, // Last fuel level reading in the group
          minFuelLevel: { $min: `$${fuelLevelKey}` }, // Minimum fuel level in the group
          maxFuelLevel: { $max: `$${fuelLevelKey}` }, // Maximum fuel level in the group
          averageFuelLevel: { $avg: `$${fuelLevelKey}` }, // Average fuel level in the group
          // For consumption, we need the first and last odometer readings within the group.
          // Note: This is a simplified approach. A more robust solution might need to track
          // fuel level changes more granularly against distance travelled for true consumption.
          firstOdometer: { $first: `$${totalOdometerKey}` },
          lastOdometer: { $last: `$${totalOdometerKey}` },
          fuelType: { $last: `$${fuelTypeKey}` }, // Assuming fuel type doesn't change frequently within a group
          count: { $sum: 1 }, // Count of documents in each group
        },
      },
      {
        // Stage 4: Project the grouped results into the desired FuelSummary format.
        // Calculate fuel consumption and related metrics.
        $project: {
          _id: 0, // Exclude the default _id field
          label: "$_id", // Rename _id to label for the report map key
          firstFuelLevel: "$firstFuelLevel",
          lastFuelLevel: "$lastFuelLevel",
          minFuelLevel: "$minFuelLevel",
          maxFuelLevel: "$maxFuelLevel",
          averageFuelLevel: { $round: ["$averageFuelLevel", 2] }, // Round average fuel level

          // Calculate distance traveled within the period
          distanceTraveled: {
            $max: [0, { $subtract: ["$lastOdometer", "$firstOdometer"] }],
          },
          fuelType: {
            $switch: {
              branches: [
                { case: { $eq: ["$fuelType", 0] }, then: "Petrol" },
                { case: { $eq: ["$fuelType", 1] }, then: "Diesel" },
                { case: { $eq: ["$fuelType", 2] }, then: "LPG" },
                { case: { $eq: ["$fuelType", 3] }, then: "CNG" },
                { case: { $eq: ["$fuelType", 4] }, then: "Electric" },
              ],
              default: "Unknown",
            },
          },
          hasData: { $gt: ["$count", 0] }, // Indicate if the group has any data
        },
      },
      {
        // Stage 5: Sort the final results by label (date) for chronological order.
        $sort: { label: 1 },
      },
    ];

    const results = await Telemetry.aggregate(pipeline);
    const reportMap = new Map<string, any>();

    // console.log(results);

    results.forEach((point) => {
      // Calculate fuel consumption (very rough, as actual consumption requires more data points like fill-ups)
      // For simplicity, we can assume change in percentage / distance.
      // A more accurate calculation needs actual fuel dispensed or fuel flow rate.
      const fuelLevelChange = point.firstFuelLevel - point.lastFuelLevel; // Negative means consumed
      const distance = point.distanceTraveled;
      let fuelConsumptionRate = 0; // Units: % per km
      if (distance > 0 && fuelLevelChange > 0) {
        fuelConsumptionRate = fuelLevelChange / distance;
      }

      reportMap.set(point.label, {
        date: point.label,
        firstFuelLevel: parseFloat(point.firstFuelLevel?.toFixed(1) ?? "0"),
        lastFuelLevel: parseFloat(point.lastFuelLevel?.toFixed(1) ?? "0"),
        minFuelLevel: parseFloat(point.minFuelLevel?.toFixed(1) ?? "0"),
        maxFuelLevel: parseFloat(point.maxFuelLevel?.toFixed(1) ?? "0"),
        averageFuelLevel: parseFloat(point.averageFuelLevel?.toFixed(1) ?? "0"),
        distanceTraveled: parseFloat(distance?.toFixed(1) ?? "0"),
        fuelConsumptionRate: parseFloat(fuelConsumptionRate?.toFixed(3) ?? "0"), // %/km
        fuelType: point.fuelType,
        fuelLevelStatus: this.getFuelLevelStatus(point.lastFuelLevel),
        hasData: point.hasData,
      });
    });

    return reportMap;
  }

  /**
   * Fetches the current fuel status for a given IMEI.
   * Retrieves the latest telemetry data and calculates fuel-related metrics.
   *
   * @param imei The IMEI of the device.
   * @returns A CurrentFuelStatus object if data is found, otherwise null.
   */
  async getCurrentFuelStatus(imei: string): Promise<any | null> {
    const tsKey = `state.reported.ts`;
    const fuelLevelKey = `state.reported.${AVL_ID_MAP.FUEL_LEVEL}`;
    const totalOdometerKey = `state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`;
    const fuelTypeKey = `state.reported.${AVL_ID_MAP.FUEL_TYPE}`;

    // Find the latest telemetry record for the given IMEI that has fuel level data.
    const latest = await Telemetry.findOne({
      imei,
      [fuelLevelKey]: { $exists: true },
    })
      .sort({ [tsKey]: -1 }) // Sort by timestamp in descending order to get the latest
      .select({
        // Select only the necessary fields
        [tsKey]: 1,
        [fuelLevelKey]: 1,
        [totalOdometerKey]: 1,
        [fuelTypeKey]: 1,
      })
      .lean()
      .exec();

    // If no telemetry data or reported state is found, return null.
    if (!latest || !latest.state?.reported) {
      return null;
    }

    const reported = latest.state.reported;
    const currentFuelLevel = reported[AVL_ID_MAP.FUEL_LEVEL] || 0; // Assuming this is a percentage (0-100)
    const currentOdometer = reported[AVL_ID_MAP.TOTAL_ODOMETER] || 0;
    const fuelTypeRaw = reported[AVL_ID_MAP.FUEL_TYPE];

    const fuelType = this.mapFuelType(fuelTypeRaw);
    const fuelLevelStatus = this.getFuelLevelStatus(currentFuelLevel);
    const estimatedRange = this.estimateRange(currentFuelLevel); // This will be a simple estimate

    // Return the calculated current fuel status.
    return {
      timestamp: reported.ts || Date.now(),
      currentFuelLevel: parseFloat(currentFuelLevel.toFixed(1)),
      fuelLevelUnit: "%", // Assuming percentage
      fuelLevelStatus: fuelLevelStatus,
      totalOdometer: currentOdometer,
      totalOdometerUnit: "km",
      fuelType: fuelType,
      estimatedRange: parseFloat(estimatedRange.toFixed(1)),
      estimatedRangeUnit: "km",
    };
  }

  /**
   * Determines the status of the fuel level (e.g., "Good", "Low", "Critical").
   * @param fuelLevel The current fuel level, assumed to be a percentage (0-100).
   * @returns A string indicating the fuel level status.
   */
  private getFuelLevelStatus(fuelLevel: number): string {
    if (fuelLevel >= 75) return "Full";
    if (fuelLevel >= 30) return "Good";
    if (fuelLevel >= 10) return "Low";
    return "Critical";
  }

  /**
   * Estimates the remaining driving range based on the current fuel level.
   * This is a very generalized estimate and would need vehicle-specific
   * fuel efficiency (e.g., L/100km or MPG) for accuracy.
   * Assuming a full tank gives roughly 500km range for a typical car.
   * @param fuelLevel The current fuel level as a percentage (0-100).
   * @returns The estimated remaining range in kilometers.
   */
  private estimateRange(fuelLevel: number): number {
    const fullTankRange = 500; // km, a generalized assumption
    return (fuelLevel / 100) * fullTankRange;
  }

  /**
   * Maps the numerical fuel type AVL ID to a human-readable string.
   * @param fuelTypeRaw The raw fuel type ID from AVL_ID_MAP.FUEL_TYPE.
   * @returns A string representing the fuel type.
   */
  private mapFuelType(fuelTypeRaw: number | undefined): string {
    switch (fuelTypeRaw) {
      case 0:
        return "Petrol";
      case 1:
        return "Diesel";
      case 2:
        return "LPG";
      case 3:
        return "CNG";
      case 4:
        return "Electric";
      default:
        return "Unknown";
    }
  }
}
