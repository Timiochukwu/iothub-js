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
 // Add this method to your SpeedAnalyticsService class

// Add this method to your SpeedAnalyticsService class

async getSpeedReportData(
  imei: string,
  startDate: Date,
  endDate: Date,
  chartGroupingType: ChartGroupingType
): Promise<Map<string, SpeedReportEntry>> {
  
  // Updated field paths based on your actual data structure
  const tsKey = `state.reported.ts`;
  const speedKey = `state.reported.66`; // Speed field (likely in mm/s or cm/s)
  const odometerKey = `state.reported.241`; // Total odometer field
  const ignitionKey = `state.reported.69`; // Ignition field

  console.log('=== DEBUG SPEED REPORT ===');
  console.log('IMEI:', imei);
  console.log('Start Date:', startDate.toISOString());
  console.log('End Date:', endDate.toISOString());
  console.log('Chart Type:', chartGroupingType);

  // First, check if raw data exists - using Date objects for timestamp
  const rawDataCount = await Telemetry.countDocuments({
    imei: imei,
    [tsKey]: {
      $gte: startDate,
      $lte: endDate
    }
  });
  console.log('Raw telemetry count:', rawDataCount);

  let aggregationPipeline: any[];
  
  if (chartGroupingType === 'weekly') {
    aggregationPipeline = [
      {
        $match: {
          imei: imei,
          [tsKey]: {
            $gte: startDate,
            $lte: endDate
          },
          [speedKey]: { $exists: true },
          [odometerKey]: { $exists: true },
          [ignitionKey]: { $exists: true }
        }
      },
      {
        $addFields: {
          // ts is already a Date object, no conversion needed
          dateTs: `$${tsKey}`,
          // Convert speed from mm/s to km/h (assuming it's in mm/s)
          // 1 mm/s = 0.0036 km/h
          speed: { 
            $multiply: [
              { $toDouble: `$${speedKey}` },
              0.0036
            ]
          },
          // Convert odometer to meters (assuming it's in mm or similar)
          odometer: { $toDouble: `$${odometerKey}` },
          ignition: { $toDouble: `$${ignitionKey}` }
        }
      },
      {
        $addFields: {
          // Calculate week start (Monday) using $dateTrunc if MongoDB 5.0+
          weekStart: {
            $dateTrunc: {
              date: "$dateTs",
              unit: "week",
              startOfWeek: "monday"
            }
          }
          // For older MongoDB versions, use this instead:
          /*
          weekStart: {
            $dateFromString: {
              dateString: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: {
                    $subtract: [
                      "$dateTs",
                      {
                        $multiply: [
                          {
                            $mod: [
                              { $subtract: [{ $dayOfWeek: "$dateTs" }, 2] },
                              7
                            ]
                          },
                          86400000
                        ]
                      }
                    ]
                  }
                }
              }
            }
          }
          */
        }
      },
      {
        $group: {
          _id: "$weekStart",
          firstOdometer: { $first: "$odometer" },
          lastOdometer: { $last: "$odometer" },
          maxSpeed: { $max: "$speed" },
          avgSpeed: { $avg: "$speed" },
          drivingReadings: {
            $push: {
              $cond: [
                { $eq: ["$ignition", 1] },
                { 
                  ts: "$dateTs", 
                  speed: "$speed" 
                },
                "$$REMOVE"
              ]
            }
          },
          recordCount: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ];
  } else { // daily
    aggregationPipeline = [
      {
        $match: {
          imei: imei,
          [tsKey]: {
            $gte: startDate,
            $lte: endDate
          },
          [speedKey]: { $exists: true },
          [odometerKey]: { $exists: true },
          [ignitionKey]: { $exists: true }
        }
      },
      {
        $addFields: {
          dateTs: `$${tsKey}`,
          // Convert speed from mm/s to km/h
          speed: { 
            $multiply: [
              { $toDouble: `$${speedKey}` },
              0.0036
            ]
          },
          odometer: { $toDouble: `$${odometerKey}` },
          ignition: { $toDouble: `$${ignitionKey}` }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$dateTs"
            }
          },
          firstOdometer: { $first: "$odometer" },
          lastOdometer: { $last: "$odometer" },
          maxSpeed: { $max: "$speed" },
          avgSpeed: { $avg: "$speed" },
          drivingReadings: {
            $push: {
              $cond: [
                { $eq: ["$ignition", 1] },
                { 
                  ts: "$dateTs", 
                  speed: "$speed" 
                },
                "$$REMOVE"
              ]
            }
          },
          recordCount: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ];
  }

  console.log('Aggregation pipeline:', JSON.stringify(aggregationPipeline, null, 2));

  const aggregationResults = await Telemetry.aggregate(aggregationPipeline);
  console.log('Aggregation results:', aggregationResults);

  // Convert to SpeedReportEntry format
  const resultMap = new Map<string, SpeedReportEntry>();
  
  // Generate all expected date labels for the range
  const expectedDates = this.generateDateLabels(startDate, endDate, chartGroupingType);
  
  for (const dateLabel of expectedDates) {
    const aggregatedData = aggregationResults.find(result => {
      if (chartGroupingType === 'weekly') {
        return new Date(result._id).toISOString().split('T')[0] === dateLabel;
      } else {
        return result._id === dateLabel;
      }
    });

    // Calculate driving time from readings (simplified inline calculation)
    let drivingTime = 0;
    if (aggregatedData?.drivingReadings && Array.isArray(aggregatedData.drivingReadings)) {
      const validReadings = aggregatedData.drivingReadings
        .filter((r: any) => r && r.ts)
        .sort((a: any, b: any) => {
          const aTime = a.ts instanceof Date ? a.ts.getTime() : a.ts;
          const bTime = b.ts instanceof Date ? b.ts.getTime() : b.ts;
          return aTime - bTime;
        });
      
      // Simple estimation: count readings where ignition was on, multiply by average interval
      if (validReadings.length > 1) {
        const firstTime = validReadings[0].ts instanceof Date ? validReadings[0].ts.getTime() : validReadings[0].ts;
        const lastTime = validReadings[validReadings.length - 1].ts instanceof Date ? 
          validReadings[validReadings.length - 1].ts.getTime() : validReadings[validReadings.length - 1].ts;
        
        const totalTimeSpan = (lastTime - firstTime) / (1000 * 60); // minutes
        // Estimate driving time as a percentage of total time span based on reading frequency
        drivingTime = Math.min(totalTimeSpan, validReadings.length * 2); // Assume 2 minutes per reading
      }
    }

    // Calculate total distance in kilometers
    const totalDistance = aggregatedData ? 
      Math.max(0, ((aggregatedData.lastOdometer || 0) - (aggregatedData.firstOdometer || 0)) / 1000) : 0;

    const entry: SpeedReportEntry = {
      dateLabel,
      totalDistance: parseFloat(totalDistance.toFixed(1)),
      totalDrivingTime: Math.round(drivingTime),
      totalDrivingTimeUnit: "minutes",
      averageSpeed: parseFloat((aggregatedData?.avgSpeed || 0).toFixed(1)),
      maxSpeed: parseFloat((aggregatedData?.maxSpeed || 0).toFixed(1)),
      speedingIncidents: 0, // TODO: Calculate from speed readings
      rapidAccelerationIncidents: 0, // TODO: Calculate from speed changes
      rapidDecelerationIncidents: 0, // TODO: Calculate from speed changes
      hasData: (aggregatedData?.recordCount || 0) > 0
    };

    resultMap.set(dateLabel, entry);
  }

  console.log('Final result map:', Array.from(resultMap.values()));
  return resultMap;
}

// Helper method to calculate driving time from readings


// Helper method to generate expected date labels
private generateDateLabels(startDate: Date, endDate: Date, chartGroupingType: ChartGroupingType): string[] {
  const labels: string[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    if (chartGroupingType === 'weekly') {
      // Get Monday of the current week
      const monday = new Date(current);
      const dayOfWeek = monday.getDay();
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      monday.setDate(monday.getDate() + daysToMonday);

      if (!isNaN(monday.getTime())) {
        labels.push(monday.toISOString().split('T')[0]!); // <-- added !
      }
      current.setDate(current.getDate() + 7);
    } else {
      if (!isNaN(current.getTime())) {
        labels.push(current.toISOString().split('T')[0]!); // <-- added !
      }
      current.setDate(current.getDate() + 1);
    }
  }

  return [...new Set(labels)];
}



  
}
