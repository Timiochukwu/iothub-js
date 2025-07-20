// src/services/SpeedAnalyticsService.ts
import { Telemetry } from "../models/Telemetry";
import { AVL_ID_MAP } from "../utils/avlIdMap";
import {
  ChartGroupingType,
  CurrentSpeedData,
  SpeedReportEntry,
} from "../types"; // Make sure these are properly exported in your types file

// Define internal types for clarity and strictness
interface TelemetryReadingForDrivingTime {
  ts: number;
  ignition: number;
  speed: number;
}

interface TelemetryReadingForMileage {
  ts: number; // Include for consistency, though not strictly used in mileage calculation logic
  fuelLevel: number;
  odometer: number;
}

interface TelemetryReadingForTripMileage
  extends TelemetryReadingForDrivingTime,
    TelemetryReadingForMileage {
  // Combines all fields needed for trip mileage
}

export class SpeedAnalyticsService {
  /**
   * Retrieves current speed-related data including estimated mileage and daily driving details.
   * This function fetches the latest telemetry data and aggregates data for the current day.
   *
   * @param imei The IMEI of the device.
   * @returns A CurrentSpeedData object or null if no data is found.
   */
  async getCurrentSpeedData(imei: string): Promise<CurrentSpeedData | null> {
    const tsKey = `state.reported.ts`;
    const speedKey = `state.reported.${AVL_ID_MAP.SPEED}`;
    const odometerKey = `state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`;
    const fuelLevelKey = `state.reported.${AVL_ID_MAP.FUEL_LEVEL}`;
    const rpmKey = `state.reported.${AVL_ID_MAP.ENGINE_RPM}`;
    const ignitionKey = `state.reported.${AVL_ID_MAP.IGNITION}`;
    const movementKey = `state.reported.${AVL_ID_MAP.MOVEMENT}`;

    // Get the latest telemetry for current status
    const latestTelemetry = await Telemetry.findOne({ imei })
      .sort({ [tsKey]: -1 })
      .select({
        [tsKey]: 1,
        [speedKey]: 1,
        [odometerKey]: 1,
        [fuelLevelKey]: 1,
        [rpmKey]: 1,
        [ignitionKey]: 1,
        [movementKey]: 1,
      })
      .lean()
      .exec();

    console.log("Latest telemetry data:", latestTelemetry);

    if (!latestTelemetry || !latestTelemetry.state?.reported) {
      return null;
    }

    const reported = latestTelemetry.state.reported;
    const currentTimestamp = reported.ts || Date.now();
    const currentSpeed = reported[AVL_ID_MAP.SPEED] || 0;
    const currentOdometer = reported[AVL_ID_MAP.TOTAL_ODOMETER] || 0;
    const currentFuelLevel = reported[AVL_ID_MAP.FUEL_LEVEL] || 0;
    const currentRpm = reported[AVL_ID_MAP.ENGINE_RPM] || 0;
    const currentIgnition = reported[AVL_ID_MAP.IGNITION] || 0;
    const currentMovement = reported[AVL_ID_MAP.MOVEMENT] || 0;

    // Determine device status
    const deviceStatus =
      currentIgnition === 1 || currentMovement === 1 ? "Active" : "Inactive";

    // --- Aggregate data for "Today" (from midnight to now) ---
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const dailyPipeline: any[] = [
      {
        $match: {
          imei,
          [tsKey]: { $gte: startOfToday.getTime(), $lte: Date.now() },
          [odometerKey]: { $exists: true, $type: "number", $ne: null },
          [speedKey]: { $exists: true, $type: "number", $ne: null },
          [ignitionKey]: { $exists: true, $type: "number", $ne: null },
          [fuelLevelKey]: { $exists: true, $type: "number", $ne: null }, // Ensure fuel level is included for mileage calc
          [rpmKey]: { $exists: true, $type: "number", $ne: null }, // Ensure RPM is included for avgRpmToday
        },
      },
      { $sort: { [tsKey]: 1 } }, // Ensure chronological order for distance and time calculations
      {
        $group: {
          _id: null, // Group all documents for the day
          firstOdometer: { $first: `$${odometerKey}` },
          lastOdometer: { $last: `$${odometerKey}` },
          maxSpeed: { $max: `$${speedKey}` },
          avgSpeed: { $avg: `$${speedKey}` },
          avgRpm: { $avg: `$${rpmKey}` },
          // Push all relevant fields into an array
          readings: {
            $push: {
              ts: `$${tsKey}`,
              ignition: `$${ignitionKey}`,
              speed: `$${speedKey}`,
              fuelLevel: `$${fuelLevelKey}`,
              odometer: `$${odometerKey}`,
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          firstOdometer: 1,
          lastOdometer: 1,
          maxSpeed: 1,
          avgSpeed: 1,
          avgRpm: 1,
          readings: 1,
        },
      },
    ];

    const dailyResults = await Telemetry.aggregate(dailyPipeline);
    console.log(`Daily results for ${imei}:`, dailyResults);

    let distanceToday = 0;
    let drivingTimeToday = 0; // in minutes
    let avgSpeedToday = 0;
    let maxSpeedToday = 0;
    let avgRpmToday = 0;
    let avgMileageToday = 0;
    let lastTripMileage = 0;

    if (dailyResults.length > 0) {
      const data = dailyResults[0];

      // Explicitly type the raw readings array
      const rawReadings: Array<{
        ts: number;
        ignition: number;
        speed: number;
        fuelLevel: number;
        odometer: number;
      }> = data.readings || []; // Ensure it's an array, default to empty

      distanceToday = Math.max(
        0,
        ((data.lastOdometer || 0) - (data.firstOdometer || 0)) / 1000
      ); // in km
      maxSpeedToday = data.maxSpeed || 0;
      avgSpeedToday = parseFloat((data.avgSpeed || 0).toFixed(1));
      avgRpmToday = parseFloat((data.avgRpm || 0).toFixed(0));

      // Map to specific types before passing to helper functions
      const typedReadingsForDrivingTime: TelemetryReadingForDrivingTime[] =
        rawReadings.map((r) => ({
          ts: r.ts,
          ignition: r.ignition,
          speed: r.speed,
        }));
      drivingTimeToday = this.calculateDrivingTime(typedReadingsForDrivingTime);

      const typedReadingsForMileage: TelemetryReadingForMileage[] =
        rawReadings.map((r) => ({
          ts: r.ts,
          fuelLevel: r.fuelLevel,
          odometer: r.odometer,
        }));
      avgMileageToday = this.calculateMileage(typedReadingsForMileage);

      const typedReadingsForTripMileage: TelemetryReadingForTripMileage[] =
        rawReadings.map((r) => ({
          ts: r.ts,
          ignition: r.ignition,
          speed: r.speed,
          fuelLevel: r.fuelLevel,
          odometer: r.odometer,
        }));
      lastTripMileage = this.calculateLastTripMileage(
        typedReadingsForTripMileage
      );
    }

    // Placeholder for speeding, rapid acc/decel (requires event detection logic)
    const speedingIncidentsToday = 0;
    const speedingDistanceToday = 0;
    const rapidAccelerationIncidentsToday = 0;
    const rapidDecelerationIncidentsToday = 0;

    return {
      imei,
      lastUpdateTimestamp: currentTimestamp,
      avgMileage: parseFloat(avgMileageToday.toFixed(1)),
      lastTripMileage: parseFloat(lastTripMileage.toFixed(1)),
      distanceToday: parseFloat(distanceToday.toFixed(1)),
      drivingTimeToday: parseFloat(drivingTimeToday.toFixed(0)),
      avgSpeedToday,
      maxSpeedToday,
      avgRpmToday,
      speedingIncidentsToday,
      speedingDistanceToday,
      rapidAccelerationIncidentsToday,
      rapidDecelerationIncidentsToday,
      deviceStatus,
    };
  }

  /**
   * Calculates driving time from a sequence of telemetry readings.
   * Driving time is considered when ignition is ON and/or speed > 0.
   *
   * @param readings An array of telemetry readings with 'ts' and 'ignition' fields.
   * @returns Total driving time in minutes.
   */
  private calculateDrivingTime(
    readings: TelemetryReadingForDrivingTime[]
  ): number {
    if (readings.length < 2) return 0;

    let totalDrivingTimeMs = 0;
    for (let i = 0; i < readings.length - 1; i++) {
      // Use non-null assertion (!) because we've checked readings.length
      const current = readings[i]!;
      const next = readings[i + 1]!;

      const isDriving = current.ignition === 1 || current.speed > 0;

      if (isDriving) {
        totalDrivingTimeMs += next.ts - current.ts;
      }
    }
    return totalDrivingTimeMs / (1000 * 60); // Convert milliseconds to minutes
  }

  /**
   * Estimates fuel mileage (km/L) based on fuel level percentage change and distance.
   * This is a simplified model and may not be highly accurate.
   * Assumes a full tank capacity (e.g., 50 Liters) and fuel level is 0-100%.
   *
   * @param readings An array of telemetry readings with 'fuelLevel' and 'odometer' fields.
   * @returns Estimated mileage in km/L.
   */
  private calculateMileage(readings: TelemetryReadingForMileage[]): number {
    if (readings.length < 2) return 0;

    const fullTankCapacityLiters = 50; // Example: Assuming a 50-liter tank capacity

    let totalDistanceKm = 0;
    let totalFuelConsumedLiters = 0;

    for (let i = 0; i < readings.length - 1; i++) {
      // Use non-null assertion (!)
      const current = readings[i]!;
      const next = readings[i + 1]!;

      const distanceChangeKm = Math.max(
        0,
        (next.odometer - current.odometer) / 1000
      );

      // Only consider fuel consumption if distance was covered and fuel level dropped
      if (distanceChangeKm > 0 && next.fuelLevel < current.fuelLevel) {
        const fuelDropPercentage = current.fuelLevel - next.fuelLevel;
        const fuelConsumedLiters =
          (fuelDropPercentage / 100) * fullTankCapacityLiters;
        totalFuelConsumedLiters += fuelConsumedLiters;
        totalDistanceKm += distanceChangeKm;
      }
    }

    if (totalFuelConsumedLiters > 0) {
      return totalDistanceKm / totalFuelConsumedLiters;
    }
    return 0;
  }

  /**
   * Calculates mileage for the last detected "trip".
   * A trip is defined as a period where ignition is ON (or speed > 0),
   * followed by ignition OFF (or speed = 0).
   *
   * @param readings An array of telemetry readings.
   * @returns Mileage for the last trip in km/L.
   */
  private calculateLastTripMileage(
    readings: TelemetryReadingForTripMileage[]
  ): number {
    if (readings.length < 2) return 0;

    // Find the last trip segment
    let lastTripStartIndex = -1;
    // Iterate backwards to find the start of the last trip
    for (let i = readings.length - 1; i > 0; i--) {
      const current = readings[i]!; // Use non-null assertion
      const previous = readings[i - 1]!; // Use non-null assertion

      // A "trip" is active if ignition is on or speed is detected
      const currentDriving = current.ignition === 1 || current.speed > 0;
      const previousDriving = previous.ignition === 1 || previous.speed > 0;

      if (currentDriving && !previousDriving) {
        // Found the point where driving started after a period of not driving
        lastTripStartIndex = i;
        break;
      } else if (i === 1 && currentDriving && !previousDriving) {
        // Edge case: if the very first record is the start of a trip
        lastTripStartIndex = 0;
        break;
      }
    }

    // If no clear trip start found (e.g., vehicle was driving since the start of data)
    // assume the whole period is one continuous "trip"
    if (lastTripStartIndex === -1) {
      lastTripStartIndex = 0;
    }

    const lastTripReadings = readings.slice(lastTripStartIndex); // Slice from start of trip to end of array

    if (lastTripReadings.length < 2) return 0; // Not enough data points in the trip for mileage calculation

    // Calculate mileage specifically for this last trip segment
    // Create an array with only the necessary fields for calculateMileage for better type safety
    const mileageReadings: TelemetryReadingForMileage[] = lastTripReadings.map(
      (r) => ({
        ts: r.ts, // ts is not directly used by calculateMileage, but required for the interface
        fuelLevel: r.fuelLevel,
        odometer: r.odometer,
      })
    );

    return this.calculateMileage(mileageReadings);
  }

  /**
   * Generates a speed report grouped by daily, weekly, or monthly intervals.
   * Includes total distance, driving time, average speed, and max speed for each period.
   *
   * @param imei The IMEI of the device.
   * @param startDate The start date for the report.
   * @param endDate The end date for the report.
   * @param type The grouping type for the chart (daily, weekly, monthly).
   * @returns A Map where keys are date labels and values are SpeedReportEntry objects.
   */
  async getSpeedReportData(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType
  ): Promise<Map<string, SpeedReportEntry>> {
    const tsKey = `state.reported.ts`;
    const speedKey = `state.reported.${AVL_ID_MAP.SPEED}`;
    const odometerKey = `state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`;
    const ignitionKey = `state.reported.${AVL_ID_MAP.IGNITION}`;

    let groupByFormat: string;
    switch (type) {
      case "weekly":
        groupByFormat = "%Y-%m-%d"; // Year, month, and day
        // groupByFormat = "%Y-%U"; // Year and week number
        break;
      case "monthly":
        groupByFormat = "%Y-%m"; // Year and month
        break;
      case "daily":
      default:
        groupByFormat = "%Y-%m-%d"; // Year, month, and day
        break;
    }

    console.log("groupByFormat", groupByFormat);

    const pipeline: any[] = [
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [odometerKey]: { $exists: true, $type: "number", $ne: null },
          [speedKey]: { $exists: true, $type: "number", $ne: null },
          [ignitionKey]: { $exists: true, $type: "number", $ne: null },
        },
      },
      { $sort: { [tsKey]: 1 } }, // Sort by timestamp for correct first/last odometer and time calculations
      {
        $group: {
          _id: {
            dateLabel: {
              $dateToString: {
                format: groupByFormat,
                date: { $toDate: `$${tsKey}` },
                timezone: "UTC",
              },
            },
          },
          firstOdometer: { $first: `$${odometerKey}` },
          lastOdometer: { $last: `$${odometerKey}` },
          avgSpeed: { $avg: `$${speedKey}` },
          maxSpeed: { $max: `$${speedKey}` },
          // Collect all readings for driving time calculation in service layer
          readings: {
            $push: {
              ts: `$${tsKey}`,
              ignition: `$${ignitionKey}`,
              speed: `$${speedKey}`,
            },
          },
          count: { $sum: 1 }, // Count of documents in the group
        },
      },
      {
        $project: {
          _id: 0,
          dateLabel: "$_id.dateLabel",
          totalDistanceRaw: {
            $max: [0, { $subtract: ["$lastOdometer", "$firstOdometer"] }],
          }, // Ensure non-negative distance
          averageSpeed: { $round: ["$avgSpeed", 1] },
          maxSpeed: { $round: ["$maxSpeed", 1] },
          readings: 1, // Pass readings to service for driving time calculation
          hasData: { $gt: ["$count", 0] },
        },
      },
      { $sort: { dateLabel: 1 } }, // Sort by date label for chronological order
    ];

    const results = await Telemetry.aggregate(pipeline);
    const reportMap = new Map<string, SpeedReportEntry>();

    // Populate the report map, ensuring all periods in the range are present
    let currentIterDate = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate()
    );
    // Adjust end date to ensure the loop includes the final day's data if grouping daily
    const loopEndDate = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate()
    );
    // For weekly/monthly, make sure the loop extends far enough to cover the last partial week/month
    if (type === "weekly") {
      loopEndDate.setDate(loopEndDate.getDate() + 6); // Cover rest of the week
    } else if (type === "monthly") {
      loopEndDate.setMonth(loopEndDate.getMonth() + 1); // Go to next month to ensure current month is fully covered
      loopEndDate.setDate(0); // Set to last day of current month
    }

    while (currentIterDate <= loopEndDate) {
      let dateLabel: string;
      if (type === "daily") {
        dateLabel = currentIterDate.toISOString().split("T")[0]!;
      } else if (type === "weekly") {
        // ISO week date system (more complex, but common)
        // For simplicity and consistency with MongoDB %U, let's stick to %Y-%U definition.
        // %U is week number of the year (00-53) as the first Sunday as the first day of week 01.
        // If your MongoDB $dateToString matches the client-side week calculation, use that.
        // For now, let's derive it similarly to MongoDB's %Y-%U to ensure matching labels.
        // This is a rough conversion for client-side to match DB.
        const year = currentIterDate.getFullYear();
        const dateForWeek = new Date(currentIterDate.getTime());
        dateForWeek.setHours(0, 0, 0, 0);
        // Sunday is 0, Monday is 1... Saturday is 6
        dateForWeek.setDate(
          dateForWeek.getDate() + 4 - (dateForWeek.getDay() || 7)
        ); // adjust to Thursday in current week
        const yearStart = new Date(dateForWeek.getFullYear(), 0, 1);
        const weekNumber = Math.ceil(
          ((dateForWeek.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
        );
        // dateLabel = `${year}-${String(weekNumber).padStart(2, "0")}`;
        dateLabel = currentIterDate.toISOString().split("T")[0]!;
      } else {
        // monthly
        dateLabel = currentIterDate.toISOString().substring(0, 7); // YYYY-MM
      }

      const periodData = results.find((r) => r.dateLabel === dateLabel);

      let totalDistance = 0;
      let totalDrivingTime = 0;
      let averageSpeed = 0;
      let maxSpeed = 0;
      let hasData = false;

      if (periodData) {
        totalDistance = parseFloat(
          (periodData.totalDistanceRaw / 1000).toFixed(1)
        ); // Convert to KM
        // Explicitly type the raw readings array
        const typedReadings: TelemetryReadingForDrivingTime[] =
          periodData.readings.map((r: any) => ({
            ts: r.ts,
            ignition: r.ignition,
            speed: r.speed,
          }));
        totalDrivingTime = this.calculateDrivingTime(typedReadings);
        averageSpeed = periodData.averageSpeed;
        maxSpeed = periodData.maxSpeed;
        hasData = periodData.hasData;
      }

      reportMap.set(dateLabel, {
        dateLabel: dateLabel,
        totalDistance: totalDistance,
        totalDrivingTime: parseFloat(totalDrivingTime.toFixed(0)),
        totalDrivingTimeUnit: "minutes",
        averageSpeed: averageSpeed,
        maxSpeed: maxSpeed,
        speedingIncidents: 0, // Placeholder, requires event detection
        rapidAccelerationIncidents: 0, // Placeholder
        rapidDecelerationIncidents: 0, // Placeholder
        hasData: hasData,
      });

      // Increment date based on grouping type
      if (type === "monthly") {
        currentIterDate.setMonth(currentIterDate.getMonth() + 1);
        currentIterDate.setDate(1); // Set to 1st of next month to avoid issues with month-end days
      } else if (type === "weekly") {
        currentIterDate.setDate(currentIterDate.getDate() + 7);
      } else {
        // daily
        currentIterDate.setDate(currentIterDate.getDate() + 1);
      }
    }

    return reportMap;
  }
}
