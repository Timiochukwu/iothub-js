import { Telemetry } from "../models/Telemetry";
import { AVL_ID_MAP } from "../utils/avlIdMap";
import { DailyTirePressureData, ChartGroupingType } from "../types";

export class TirePressureService {
  /**
   * Generates a daily (or weekly/monthly) tire pressure report for a given IMEI.
   * This report includes average pressure, distance covered, and start/end locations for each period.
   *
   * @param imei The IMEI of the device.
   * @param startDate The start date for the report.
   * @param endDate The end date for the report.
   * @param type The grouping type for the chart (daily, weekly, monthly).
   * @returns A Map where keys are date labels (e.g., "YYYY-MM-DD") and values are DailyTirePressureData objects.
   */
  async getDailyTirePressureData(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType
  ): Promise<Map<string, DailyTirePressureData>> {
    const tsKey = `state.reported.ts`; // Timestamp in milliseconds
    const pressureKey = `state.reported.${AVL_ID_MAP.TYRE_PRESSURE}`; // AVL ID for tire pressure
    const ignitionKey = `state.reported.${AVL_ID_MAP.IGNITION}`; // AVL ID for ignition status (0 or 1)
    const odometerKey = `state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`; // AVL ID for total odometer (km or meters, check your device spec)
    const locationKey = `state.reported.latlng`; // Location string or object (e.g., "lat,lng" or { lat: N, lng: M })

    // Determine the date format for grouping based on the chart type.
    let groupByFormat: string;
    switch (type) {
      case "weekly":
        groupByFormat = "%Y-%U"; // Year and week number (e.g., "2025-28")
        break;
      case "monthly":
        groupByFormat = "%Y-%m"; // Year and month (e.g., "2025-07")
        break;
      case "daily":
      default:
        groupByFormat = "%Y-%m-%d"; // Year, month, and day (e.g., "2025-07-18")
        break;
    }

    const pipeline: any[] = [
      {
        // Stage 1: Filter telemetry data by IMEI and timestamp range.
        // Ensure pressure, ignition, odometer, and location data exist.
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [pressureKey]: { $exists: true, $type: "number", $ne: null }, // Ensure pressure exists and is a number
          [ignitionKey]: { $exists: true, $ne: null }, // Ensure ignition exists
          [odometerKey]: { $exists: true, $type: "number", $ne: null }, // Ensure odometer exists and is a number
          // [locationKey]: { $exists: true, $ne: null } // Removed for now, check after aggregation how to handle missing locations
        },
      },
      {
        // Stage 2: Sort all matched documents by timestamp for correct trip detection and first/last values.
        $sort: { [tsKey]: 1 },
      },
      {
        // Stage 3: Group data based on the specified chart grouping type (daily, weekly, monthly).
        // Collect all relevant readings for further processing in the service layer.
        $group: {
          _id: {
            // Group key will be the formatted date string
            day: {
              $dateToString: {
                format: groupByFormat,
                date: { $toDate: `$${tsKey}` },
                timezone: "UTC", // Use UTC to ensure consistent grouping across timezones
              },
            },
            // Also get day of week for chart labeling convenience
            dayOfWeek: {
              $dayOfWeek: { $toDate: `$${tsKey}` }, // 1 (Sunday) to 7 (Saturday)
            },
          },
          // Push all necessary fields into an array for client-side processing
          allReadings: {
            $push: {
              time: `$${tsKey}`,
              pressure: `$${pressureKey}`,
              location: `$${locationKey}`, // Still push, will handle null/empty strings in post-processing
              odometer: `$${odometerKey}`,
              ignition: `$${ignitionKey}`,
            },
          },
        },
      },
      {
        // Stage 4: Add a field for the day name based on dayOfWeek (for chart labels).
        $addFields: {
          dayName: {
            $switch: {
              branches: [
                { case: { $eq: ["$_id.dayOfWeek", 1] }, then: "Sunday" },
                { case: { $eq: ["$_id.dayOfWeek", 2] }, then: "Monday" },
                { case: { $eq: ["$_id.dayOfWeek", 3] }, then: "Tuesday" },
                { case: { $eq: ["$_id.dayOfWeek", 4] }, then: "Wednesday" },
                { case: { $eq: ["$_id.dayOfWeek", 5] }, then: "Thursday" },
                { case: { $eq: ["$_id.dayOfWeek", 6] }, then: "Friday" },
                { case: { $eq: ["$_id.dayOfWeek", 7] }, then: "Saturday" },
              ],
              default: "Unknown", // Fallback for unexpected values
            },
          },
        },
      },
      {
        // Stage 5: Project the final fields for the service layer.
        $project: {
          _id: 0, // Exclude the default _id field
          date: "$_id.day", // The formatted date string (e.g., "2025-07-18")
          dayName: 1, // "Monday", "Tuesday", etc.
          dayOfWeek: "$_id.dayOfWeek", // 1 (Sunday) to 7 (Saturday)
          allReadings: 1, // The array of all telemetry readings for the period
          hasData: { $gt: [{ $size: "$allReadings" }, 0] }, // True if there are any readings for this period
        },
      },
      {
        // Stage 6: Sort the final results by date for chronological order.
        $sort: { date: 1 },
      },
    ];

    const results = await Telemetry.aggregate(pipeline);

    const reportMap = new Map<string, DailyTirePressureData>();
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    // Populate the report map ensuring all days in the range are present, even if no data.
    let currentIterDate = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate()
    ); // Start from the beginning of the start day
    const endDateOnly = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate()
    ); // End at the beginning of the end day

    while (currentIterDate <= endDateOnly) {
      const dateString = currentIterDate.toISOString().split("T")[0]!;
      const dayOfWeek = currentIterDate.getDay(); // 0 for Sunday, 6 for Saturday
      const dayName = dayNames[dayOfWeek]!;

      // Find data for this specific day/period in the aggregation results
      const dayData = results.find((r) => r.date === dateString);

      if (dayData) {
        // Process the collected raw readings to calculate metrics
        const { distanceCovered, mainPressure, startLocation, endLocation } =
          this.processDailyReadings(dayData.allReadings);

        reportMap.set(dateString, {
          date: dateString,
          dayName: dayName,
          dayOfWeek: dayOfWeek + 1, // Convert to 1-7 for consistency if needed by frontend
          chartLabel: dayName, // Label for charts
          distanceCovered: distanceCovered,
          mainPressure: mainPressure,
          startLocation: startLocation,
          endLocation: endLocation,
          hasData: dayData.hasData,
        });
      } else {
        // No data for this day/period, add default empty values
        reportMap.set(dateString, {
          date: dateString,
          dayName: dayName,
          dayOfWeek: dayOfWeek + 1,
          chartLabel: dayName,
          distanceCovered: 0,
          mainPressure: 0,
          startLocation: "",
          endLocation: "",
          hasData: false,
        });
      }
      currentIterDate.setDate(currentIterDate.getDate() + 1); // Move to the next day
    }

    return reportMap;
  }

  /**
   * Retrieves the current tire pressure, location, timestamp, and status for a given IMEI.
   *
   * @param imei The IMEI of the device.
   * @returns An object containing current pressure details, or null if no data is found.
   */
  async getCurrentTirePressure(imei: string): Promise<{
    pressure: number;
    location: string;
    timestamp: number;
    status: string;
  } | null> {
    const tsKey = `state.reported.ts`;
    const pressureKey = `state.reported.${AVL_ID_MAP.TYRE_PRESSURE}`;
    const locationKey = `state.reported.latlng`;

    // Find the single latest telemetry record for the given IMEI that has tire pressure data.
    const latest = await Telemetry.findOne({
      imei,
      [pressureKey]: { $exists: true, $ne: null }, // Ensure pressure field exists and is not null
    })
      .sort({ [tsKey]: -1 }) // Sort by timestamp in descending order to get the very latest
      .select({
        // Select only the necessary fields
        [tsKey]: 1,
        [pressureKey]: 1,
        [locationKey]: 1,
      });

    // If no telemetry data or reported state is found, return null.
    if (!latest || !latest.state?.reported) {
      return null;
    }

    const reported = latest.state.reported;
    // Default to 0 if pressure is null/undefined
    const pressure = reported[AVL_ID_MAP.TYRE_PRESSURE] || 0;
    // Default to empty string if latlng is null/undefined
    const location = reported.latlng || "";

    // Determine the status based on pressure readings (example thresholds)
    let status = "NORMAL";
    if (pressure === 0) {
      status = "NO_DATA"; // Or "INVALID_READING"
    } else if (pressure < 25) {
      // Assuming pressure is in PSI or Bar, adjust thresholds as needed
      status = "LOW"; // Significantly low pressure
    } else if (pressure < 30) {
      status = "WARNING"; // Slightly low pressure, needs attention
    } else if (pressure > 40) {
      status = "HIGH"; // Potentially overinflated
    }

    return {
      pressure,
      location,
      timestamp: reported.ts || Date.now(), // Fallback to current time if timestamp is missing
      status,
    };
  }

  /**
   * Retrieves a history of tire pressure readings for a given IMEI over a specified number of hours.
   *
   * @param imei The IMEI of the device.
   * @param hours The number of hours back from now to fetch history (default: 24 hours).
   * @returns An array of objects, each containing pressure, location, and timestamp, in chronological order.
   */
  async getTirePressureHistory(
    imei: string,
    hours: number = 24
  ): Promise<
    Array<{
      pressure: number;
      location: string;
      timestamp: number;
    }>
  > {
    const tsKey = `state.reported.ts`;
    const pressureKey = `state.reported.${AVL_ID_MAP.TYRE_PRESSURE}`;
    const locationKey = `state.reported.latlng`;

    // Calculate the cutoff timestamp for the history
    const cutoffTime = Date.now() - hours * 60 * 60 * 1000;

    // Query for telemetry data within the time range, ensuring pressure exists and is greater than 0.
    const results = await Telemetry.find({
      imei,
      [tsKey]: { $gte: cutoffTime },
      [pressureKey]: { $exists: true, $gt: 0, $ne: null }, // Filter out 0 or null pressure readings
    })
      .sort({ [tsKey]: -1 }) // Sort by timestamp descending (most recent first)
      .limit(100) // Limit the number of results to prevent overwhelming responses
      .select({
        // Select only the necessary fields
        [tsKey]: 1,
        [pressureKey]: 1,
        [locationKey]: 1,
      });

    // Map the Mongoose documents to the desired plain object format.
    // Ensure `location` and `timestamp` have proper fallbacks.
    return results
      .map((doc) => {
        const reported = doc.state?.reported;
        return {
          pressure: reported?.[AVL_ID_MAP.TYRE_PRESSURE] || 0, // Default to 0 if not found
          location: reported?.latlng || "", // Default to empty string if not found
          timestamp: reported?.ts || 0, // Default to 0 if not found
        };
      })
      .reverse(); // Reverse to return in chronological order (oldest first)
  }

  /**
   * Processes a day's worth of raw telemetry readings to extract daily metrics.
   * Calculates distance covered, the main pressure (last recorded), and start/end locations.
   * This is where the 'location is empty' issue for `DailyTirePressureData` is addressed by ensuring fallbacks.
   *
   * @param readings An array of raw telemetry reading objects for a given day.
   * @returns An object containing calculated daily metrics.
   */
  private processDailyReadings(readings: Array<any>): {
    distanceCovered: number;
    mainPressure: number;
    startLocation: string;
    endLocation: string;
  } {
    if (!readings || readings.length === 0) {
      // Return default values if no readings are available
      return {
        distanceCovered: 0,
        mainPressure: 0,
        startLocation: "",
        endLocation: "",
      };
    }

    // Ensure readings are sorted by time (already done by the aggregation pipeline, but good to be defensive)
    readings.sort((a, b) => a.time - b.time);

    const firstReading = readings[0];
    const lastReading = readings[readings.length - 1];

    // Calculate distance covered: Ensure odometer values are present before subtracting.
    // Assuming odometer is in meters, convert to km. Adjust / 1000 if your AVL_ID_MAP.TOTAL_ODOMETER is in meters.
    // If odometer is already in KM, remove / 1000.
    const distanceCoveredRaw =
      (lastReading.odometer || 0) - (firstReading.odometer || 0);
    const distanceCovered =
      Math.round((Math.max(0, distanceCoveredRaw) / 1000) * 100) / 100; // Ensure non-negative, convert to km, round to 2 decimal places

    // Get the last recorded pressure as the "main pressure" for the day
    const mainPressure = lastReading.pressure || 0; // Default to 0 if null/undefined

    // Get start and end locations. Provide empty string fallback if location is missing.
    const startLocation = firstReading.location || "";
    const endLocation = lastReading.location || "";

    return { distanceCovered, mainPressure, startLocation, endLocation };
  }
}
