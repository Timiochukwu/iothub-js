// src/services/SpeedAnalyticsService.ts
import { Telemetry } from "../models/Telemetry";
import { AVL_ID_MAP } from "../utils/avlIdMap";
import {
  ChartGroupingType,
  CurrentSpeedData,
  SpeedReportEntry,
  ReportOptions
} from "../types"; // Make sure these are properly exported in your types file


interface SpeedingEvent {
  startTime: number;
  endTime: number;
  maxSpeed: number;
  distance: number;
  speedLimit: number;
}

interface AccelerationEvent {
  timestamp: number;
  accelerationRate: number; // m/s²
  type: 'rapid_acceleration' | 'rapid_deceleration';
  startSpeed: number;
  endSpeed: number;
}

interface TripSegment {
  startTime: number;
  endTime: number;
  startOdometer: number;
  endOdometer: number;
  distance: number;
  startFuelLevel: number;
  endFuelLevel: number;
  fuelUsed: number;
  mileage: number;
}

interface EnhancedReading {
  ts: number;
  ignition: number;
  movement: number;
  speed: number;
  fuelLevel: number;
  odometer: number;
  rpm: number;
}

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

  private readonly DEFAULT_REPORT_OPTIONS: ReportOptions = {
    speedLimitKph: 50,        // Urban speed limit
    rapidAccelKph: 10,        // 10 km/h increase
    rapidAccelSeconds: 3,     // within 3 seconds
    rapidDecelKph: 15,        // 15 km/h decrease  
    rapidDecelSeconds: 3,     // within 3 seconds
  };



  private readonly FUEL_TANK_CAPACITY = 50; // Liters - adjust per vehicle type
  private readonly MIN_TRIP_DISTANCE = 0.1; // Minimum 100m for valid trip
  private readonly MAX_REASONABLE_MILEAGE = 50; // km/L upper bound
  private readonly MAX_INTERVAL_MINUTES = 10; // Cap time intervals to avoid outliers

  /**
   * Retrieves current speed-related data including estimated mileage and daily driving details.
   * This function fetches the latest telemetry data and aggregates data for the current day.
   *
   * @param imei The IMEI of the device.
   * @returns A CurrentSpeedData object or null if no data is found.
   */
  async getCurrentSpeedData(imei: string): Promise<CurrentSpeedData | null> {
    console.log(`Getting enhanced speed data for IMEI: ${imei}`);

    const AVL_ID_MAP = {
      FUEL_LEVEL: 48,
      TOTAL_ODOMETER: 16,
      IGNITION: 239,
      EXTERNAL_VOLTAGE: 67,
      SPEED: 37,
      ENGINE_RPM: 36,
      MOVEMENT: 240,
      ACTIVE_GSM_OPERATOR: 241,
      VIN: 256,
    };

    const tsKey = "state.reported.ts";
    const speedKey = "state.reported.sp";
    const obdSpeedKey = `state.reported.${AVL_ID_MAP.SPEED}`;
    const odometerKey = `state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`;
    const fuelLevelKey = `state.reported.${AVL_ID_MAP.FUEL_LEVEL}`;
    const rpmKey = `state.reported.${AVL_ID_MAP.ENGINE_RPM}`;
    const ignitionKey = `state.reported.${AVL_ID_MAP.IGNITION}`;
    const movementKey = `state.reported.${AVL_ID_MAP.MOVEMENT}`;
    const vinKey = `state.reported.${AVL_ID_MAP.VIN}`;

    // Get latest telemetry
    const latestTelemetry = await Telemetry.findOne({
      imei,
      [vinKey]: { $exists: true, $ne: null },
      [odometerKey]: { $exists: true, $ne: null },
      [rpmKey]: { $exists: true, $ne: null },
      [ignitionKey]: { $exists: true, $ne: null },
      [movementKey]: { $exists: true, $ne: null },
    })
      .sort({ [tsKey]: -1 })
      .select({
        [tsKey]: 1,
        [speedKey]: 1,
        [obdSpeedKey]: 1,
        [odometerKey]: 1,
        [fuelLevelKey]: 1,
        [rpmKey]: 1,
        [ignitionKey]: 1,
        [movementKey]: 1,
        [vinKey]: 1,
      })
      .lean()
      .exec();

    if (!latestTelemetry || !latestTelemetry.state?.reported) {
      console.log("No valid telemetry data found");
      return null;
    }

    const reported = latestTelemetry.state.reported;
    const currentTimestamp = this.extractTimestamp(reported.ts);

    // Extract current values
    const currentSpeed = this.convertToNumber(reported.sp) || this.convertToNumber(reported[AVL_ID_MAP.SPEED]) || 0;
    const currentOdometer = this.convertToNumber(reported[AVL_ID_MAP.TOTAL_ODOMETER]) || 0;
    const currentFuelLevel = this.convertToNumber(reported[AVL_ID_MAP.FUEL_LEVEL]) || 0;
    const currentRpm = this.convertToNumber(reported[AVL_ID_MAP.ENGINE_RPM]) || 0;
    const currentIgnition = this.convertToNumber(reported[AVL_ID_MAP.IGNITION]) || 0;
    const currentMovement = this.convertToNumber(reported[AVL_ID_MAP.MOVEMENT]) || 0;

    // Determine device status
    const deviceStatus: "Unknown" | "Active" | "Inactive" =
      currentIgnition === 1 || currentMovement === 1 || currentSpeed > 0 ? "Active" : "Inactive";

    // Get today's date range
    const currentDate = new Date(currentTimestamp);
    const startOfToday = new Date(currentDate);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(currentDate);
    endOfToday.setHours(23, 59, 59, 999);

    // Enhanced aggregation pipeline to get ALL readings for detailed analysis
    const enhancedPipeline: any[] = [
      {
        $match: {
          imei,
          [tsKey]: { $gte: startOfToday, $lte: endOfToday },
          [`state.reported.${AVL_ID_MAP.VIN}`]: { $exists: true, $ne: null },
        },
      },
      { $sort: { [tsKey]: 1 } },
      {
        $addFields: {
          timestampConverted: {
            $cond: {
              if: { $ne: [`$${tsKey}`, null] },
              then: {
                $cond: {
                  if: { $eq: [{ $type: `$${tsKey}` }, "date"] },
                  then: { $toLong: `$${tsKey}` },
                  else: {
                    $cond: {
                      if: { $eq: [{ $type: `$${tsKey}` }, "object"] },
                      then: { $toLong: `$${tsKey}` },
                      else: `$${tsKey}`,
                    },
                  },
                },
              },
              else: { $toLong: new Date() },
            },
          },
          speedConverted: {
            $cond: {
              if: { $ne: [{ $ifNull: ["$state.reported.sp", null] }, null] },
              then: { $toDouble: { $ifNull: ["$state.reported.sp", 0] } },
              else: { $toDouble: { $ifNull: [`$state.reported.${AVL_ID_MAP.SPEED}`, 0] } },
            },
          },
          odometerConverted: { $toDouble: { $ifNull: [`$state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`, 0] } },
          rpmConverted: { $toDouble: { $ifNull: [`$state.reported.${AVL_ID_MAP.ENGINE_RPM}`, 0] } },
          fuelConverted: { $toDouble: { $ifNull: [`$state.reported.${AVL_ID_MAP.FUEL_LEVEL}`, 0] } },
          ignitionConverted: { $toDouble: { $ifNull: [`$state.reported.${AVL_ID_MAP.IGNITION}`, 0] } },
          movementConverted: { $toDouble: { $ifNull: [`$state.reported.${AVL_ID_MAP.MOVEMENT}`, 0] } },
        },
      },
      {
        $match: {
          odometerConverted: { $gt: 0 },
        },
      },
      // Get ALL readings for detailed analysis (not just aggregated stats)
      {
        $group: {
          _id: null,
          firstOdometer: { $first: "$odometerConverted" },
          lastOdometer: { $last: "$odometerConverted" },
          maxSpeed: { $max: "$speedConverted" },
          avgSpeed: { $avg: "$speedConverted" },
          avgRpm: { $avg: "$rpmConverted" },
          count: { $sum: 1 },
          // This is the key: get ALL readings for detailed analysis
          allReadings: {
            $push: {
              ts: "$timestampConverted",
              ignition: "$ignitionConverted",
              movement: "$movementConverted",
              speed: "$speedConverted",
              fuelLevel: "$fuelConverted",
              odometer: "$odometerConverted",
              rpm: "$rpmConverted",
            },
          },
        },
      },
    ];

    const dailyResults = await Telemetry.aggregate(enhancedPipeline);
    console.log(`Daily aggregation found ${dailyResults.length} result groups`);

    let distanceToday = 0;
    let drivingTimeToday = 0;
    let avgSpeedToday = 0;
    let maxSpeedToday = 0;
    let avgRpmToday = 0;
    let avgMileageToday = 0;
    let lastTripMileage = 0;
    let speedingIncidentsToday = 0;
    let speedingDistanceToday = 0;
    let rapidAccelerationIncidentsToday = 0;
    let rapidDecelerationIncidentsToday = 0;

    if (dailyResults.length > 0) {
      const data = dailyResults[0];
      const allReadings: EnhancedReading[] = data.allReadings || [];

      console.log(`Found ${data.count} records with ${allReadings.length} detailed readings for today`);

      // Basic metrics from aggregation
      const firstOdo = data.firstOdometer || 0;
      const lastOdo = data.lastOdometer || 0;
      const odometerDifferenceMeters = Math.max(0, lastOdo - firstOdo);
      distanceToday = odometerDifferenceMeters / 1000; // Convert to km
      
      maxSpeedToday = data.maxSpeed || 0;
      avgSpeedToday = parseFloat((data.avgSpeed || 0).toFixed(1));
      avgRpmToday = parseFloat((data.avgRpm || 0).toFixed(0));

      // Enhanced analytics using all readings
      if (allReadings.length > 0) {
        // 1. Calculate speeding metrics
        const speedingMetrics = this.calculateSpeedingMetrics(allReadings, this.DEFAULT_REPORT_OPTIONS.speedLimitKph);
        speedingIncidentsToday = speedingMetrics.incidents;
        speedingDistanceToday = speedingMetrics.distance;

        // 2. Calculate acceleration events
        const accelerationMetrics = this.calculateAccelerationEvents(allReadings, this.DEFAULT_REPORT_OPTIONS);
        rapidAccelerationIncidentsToday = accelerationMetrics.rapidAccelerations;
        rapidDecelerationIncidentsToday = accelerationMetrics.rapidDecelerations;

        // 3. Calculate driving time more accurately
        drivingTimeToday = this.calculateEnhancedDrivingTime(allReadings);

        // 4. Calculate fuel mileage metrics
        const mileageMetrics = this.calculateFuelMileageMetrics(allReadings);
        avgMileageToday = mileageMetrics.avgMileage;
        lastTripMileage = mileageMetrics.lastTripMileage;

        console.log("Enhanced analytics results:", {
          speedingIncidents: speedingIncidentsToday,
          speedingDistance: speedingDistanceToday,
          rapidAccel: rapidAccelerationIncidentsToday,
          rapidDecel: rapidDecelerationIncidentsToday,
          drivingTime: drivingTimeToday,
          avgMileage: avgMileageToday,
          lastTripMileage: lastTripMileage,
        });
      }
    } else {
      console.log("No daily results found - running diagnostics...");
      await this.runDiagnostics(imei, startOfToday, endOfToday, AVL_ID_MAP);
    }

    const result: CurrentSpeedData = {
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
      speedingDistanceToday: parseFloat(speedingDistanceToday.toFixed(1)),
      rapidAccelerationIncidentsToday,
      rapidDecelerationIncidentsToday,
      deviceStatus,
    };

    console.log("Final enhanced result:", result);
    return result;
  }

  /**
   * Calculate speeding incidents and distance
   */
  private calculateSpeedingMetrics(readings: EnhancedReading[], speedLimit: number): {
    incidents: number;
    distance: number;
    events: SpeedingEvent[];
  } {
    let incidents = 0;
    let totalSpeedingDistance = 0;
    const events: SpeedingEvent[] = [];
    let currentSpeedingEvent: Partial<SpeedingEvent> | null = null;

    for (let i = 0; i < readings.length; i++) {
      const reading = readings[i];
      if (!reading) continue; // Skip undefined readings
      
      const speed = reading.speed || 0;
      const isMoving = reading.ignition === 1 || reading.movement === 1 || speed > 0;

      if (isMoving && speed > speedLimit) {
        // Start or continue speeding event
        if (!currentSpeedingEvent) {
          currentSpeedingEvent = {
            startTime: reading.ts,
            maxSpeed: speed,
            speedLimit,
            distance: 0
          };
        } else {
          currentSpeedingEvent.maxSpeed = Math.max(currentSpeedingEvent.maxSpeed!, speed);
        }

        // Calculate distance for this reading
        // Assuming readings are taken at regular intervals, estimate time between readings
        const prevReading = readings[i-1];
        const timeInterval = i > 0 && prevReading ? (reading.ts - prevReading.ts) / 1000 / 3600 : 1/60; // hours
        const distanceThisReading = speed * Math.min(timeInterval, 1/6); // Cap at 10 minutes
        currentSpeedingEvent.distance = (currentSpeedingEvent.distance || 0) + distanceThisReading;
      } else {
        // End speeding event if one was in progress
        if (currentSpeedingEvent && currentSpeedingEvent.distance! > 0) {
          currentSpeedingEvent.endTime = reading.ts;
          events.push(currentSpeedingEvent as SpeedingEvent);
          incidents++;
          totalSpeedingDistance += currentSpeedingEvent.distance || 0;
          currentSpeedingEvent = null;
        } else if (currentSpeedingEvent) {
          currentSpeedingEvent = null; // Reset if no distance covered
        }
      }
    }

    // Handle case where speeding event continues to the end
    if (currentSpeedingEvent && readings.length > 0 && currentSpeedingEvent.distance! > 0) {
      const lastReading = readings[readings.length - 1];
      if (lastReading) {
        currentSpeedingEvent.endTime = lastReading.ts;
        events.push(currentSpeedingEvent as SpeedingEvent);
        incidents++;
        totalSpeedingDistance += currentSpeedingEvent.distance || 0;
      }
    }

    return {
      incidents,
      distance: parseFloat(totalSpeedingDistance.toFixed(2)),
      events
    };
  }

  /**
   * Calculate acceleration/deceleration events
   */
  private calculateAccelerationEvents(readings: EnhancedReading[], options: ReportOptions): {
    rapidAccelerations: number;
    rapidDecelerations: number;
    events: AccelerationEvent[];
  } {
    const events: AccelerationEvent[] = [];
    let rapidAccelerations = 0;
    let rapidDecelerations = 0;

    // Convert thresholds from km/h to m/s for calculations
    const accelThresholdKmh = options.rapidAccelKph;
    const decelThresholdKmh = options.rapidDecelKph;

    for (let i = 1; i < readings.length; i++) {
      const prevReading = readings[i - 1];
      const currReading = readings[i];
      
      if (!prevReading || !currReading) continue; // Skip undefined readings

      const prevSpeed = prevReading.speed || 0; // km/h
      const currSpeed = currReading.speed || 0; // km/h
      const speedDiff = currSpeed - prevSpeed; // km/h

      const timeDiffSeconds = Math.max((currReading.ts - prevReading.ts) / 1000, 1); // Minimum 1 second

      // Only analyze if time difference is reasonable (between 1 second and 2x the expected interval)
      if (timeDiffSeconds <= options.rapidAccelSeconds * 2 && timeDiffSeconds >= 1) {
        
        // Check for rapid acceleration
        if (speedDiff >= accelThresholdKmh && timeDiffSeconds <= options.rapidAccelSeconds) {
          const accelerationRate = speedDiff / timeDiffSeconds; // km/h per second
          events.push({
            timestamp: currReading.ts,
            accelerationRate,
            type: 'rapid_acceleration',
            startSpeed: prevSpeed,
            endSpeed: currSpeed
          });
          rapidAccelerations++;
        } 
        // Check for rapid deceleration
        else if (speedDiff <= -decelThresholdKmh && timeDiffSeconds <= options.rapidDecelSeconds) {
          const accelerationRate = speedDiff / timeDiffSeconds; // km/h per second (negative)
          events.push({
            timestamp: currReading.ts,
            accelerationRate,
            type: 'rapid_deceleration',
            startSpeed: prevSpeed,
            endSpeed: currSpeed
          });
          rapidDecelerations++;
        }
      }
    }

    return {
      rapidAccelerations,
      rapidDecelerations,
      events
    };
  }

  /**
   * Calculate enhanced driving time using actual timestamps
   */
  private calculateEnhancedDrivingTime(readings: EnhancedReading[]): number {
    if (readings.length < 2) return 0;

    let totalDrivingTimeMinutes = 0;
    
    for (let i = 0; i < readings.length - 1; i++) {
      const current = readings[i];
      const next = readings[i + 1];
      
      if (!current || !next) continue; // Skip undefined readings
      
      const isDriving = current.ignition === 1 || current.movement === 1 || current.speed > 0;
      
      if (isDriving) {
        const timeDiffMinutes = (next.ts - current.ts) / (1000 * 60);
        // Cap individual intervals to avoid outliers
        totalDrivingTimeMinutes += Math.min(timeDiffMinutes, this.MAX_INTERVAL_MINUTES);
      }
    }
    
    return totalDrivingTimeMinutes;
  }

  /**
   * Calculate fuel mileage metrics with trip segmentation
   */
  private calculateFuelMileageMetrics(readings: EnhancedReading[]): {
    avgMileage: number;
    lastTripMileage: number;
    trips: TripSegment[];
  } {
    const trips: TripSegment[] = [];
    let currentTrip: Partial<TripSegment> | null = null;
    
    // Sort readings by timestamp to ensure proper order
    const sortedReadings = [...readings].sort((a, b) => a.ts - b.ts);
    
    for (let i = 0; i < sortedReadings.length; i++) {
      const reading = sortedReadings[i];
      if (!reading) continue; // Skip undefined readings
      
      const isEngineOn = reading.ignition === 1;
      
      if (isEngineOn && !currentTrip) {
        // Start new trip
        currentTrip = {
          startTime: reading.ts,
          startOdometer: reading.odometer,
          startFuelLevel: reading.fuelLevel,
        };
      } else if (!isEngineOn && currentTrip && reading.odometer > currentTrip.startOdometer!) {
        // End current trip
        const distanceMeters = reading.odometer - currentTrip.startOdometer!;
        const distanceKm = distanceMeters / 1000; // Convert to km
        
        if (distanceKm > this.MIN_TRIP_DISTANCE) { // Only consider trips > 100m
          const fuelDrop = Math.max(0, currentTrip.startFuelLevel! - reading.fuelLevel);
          
          // Convert fuel percentage to liters (assuming full tank capacity)
          const fuelUsedLiters = (fuelDrop / 100) * this.FUEL_TANK_CAPACITY;
          
          if (fuelUsedLiters > 0) {
            const mileage = distanceKm / fuelUsedLiters; // km/L
            
            if (mileage > 0 && mileage < this.MAX_REASONABLE_MILEAGE) {
              currentTrip.endTime = reading.ts;
              currentTrip.endOdometer = reading.odometer;
              currentTrip.endFuelLevel = reading.fuelLevel;
              currentTrip.distance = distanceKm;
              currentTrip.fuelUsed = fuelUsedLiters;
              currentTrip.mileage = mileage;
              
              trips.push(currentTrip as TripSegment);
            }
          }
        }
        currentTrip = null;
      }
    }
    
    // Calculate averages from valid trips
    const validTrips = trips.filter(trip => trip.mileage > 0 && trip.mileage < this.MAX_REASONABLE_MILEAGE);
    
    const avgMileage = validTrips.length > 0 
      ? validTrips.reduce((sum, trip) => sum + trip.mileage, 0) / validTrips.length 
      : 0;
    
    const lastTripMileage = validTrips.length > 0 
      ? validTrips[validTrips.length - 1]?.mileage || 0
      : 0;
    
    console.log(`Calculated mileage: ${validTrips.length} valid trips, avg: ${avgMileage.toFixed(1)} km/L, last: ${lastTripMileage.toFixed(1)} km/L`);
    
    return {
      avgMileage: parseFloat(avgMileage.toFixed(1)),
      lastTripMileage: parseFloat(lastTripMileage.toFixed(1)),
      trips: validTrips
    };
  }






  /**
   * Run diagnostics when no data is found
   */
  private async runDiagnostics(imei: string, startOfToday: Date, endOfToday: Date, AVL_ID_MAP: any): Promise<void> {
    const tsKey = "state.reported.ts";
    
    // Check available IMEIs
    const availableImeis = await Telemetry.distinct("imei");
    console.log("Available IMEIs in database:", availableImeis.slice(0, 10));
    
    // Check total records for this IMEI
    const anyDataForImei = await Telemetry.countDocuments({ imei });
    console.log(`Total records for IMEI ${imei}:`, anyDataForImei);
    
    // Check records for today without filters
    const todayDataCount = await Telemetry.countDocuments({
      imei,
      [tsKey]: { $gte: startOfToday, $lte: endOfToday },
    });
    console.log(`Records for today without VIN filter:`, todayDataCount);
    
    // Check for records with VIN specifically
    const vinRecordsToday = await Telemetry.countDocuments({
      imei,
      [tsKey]: { $gte: startOfToday, $lte: endOfToday },
      [`state.reported.${AVL_ID_MAP.VIN}`]: { $exists: true, $ne: null },
    });
    console.log(`Records with VIN for today:`, vinRecordsToday);
    
    // Check recent VIN data availability
    const recentVinData = await Telemetry.find({ 
      imei,
      [`state.reported.${AVL_ID_MAP.VIN}`]: { $exists: true, $ne: null },
    })
      .select({ [tsKey]: 1, [`state.reported.${AVL_ID_MAP.VIN}`]: 1 })
      .sort({ [tsKey]: -1 })
      .limit(5)
      .lean();
    
    console.log("Recent VIN records:", recentVinData.map(d => ({
      ts: d.state?.reported?.ts,
      vin: d.state?.reported?.[AVL_ID_MAP.VIN]
    })));
  }

  /**
   * Helper method to extract timestamp from various formats
   */
  private extractTimestamp(ts: any): number {
    if (!ts) return Date.now();
    
    if (typeof ts === "object" && ts.$date) {
      return new Date(ts.$date).getTime();
    } else if (typeof ts === "object" && ts.$numberLong) {
      return Number(ts.$numberLong);
    } else if (ts instanceof Date) {
      return ts.getTime();
    } else if (typeof ts === "number") {
      return ts;
    } else {
      return new Date(ts).getTime();
    }
  }

  /**
   * Helper method to safely convert values to numbers
   */
  private convertToNumber(value: any): number {
    if (value == null || value === undefined) return 0;
    if (typeof value === 'number') return isNaN(value) ? 0 : value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }
    if (typeof value === 'boolean') return value ? 1 : 0;
    return 0;
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

    const modifiedEndDate = new Date(endDate);
    modifiedEndDate.setHours(23, 59, 59, 999); // Set to end of day

    console.log("=== DEBUG SPEED REPORT ===");
    console.log("IMEI:", imei);
    console.log("Start Date:", startDate.toISOString());
    console.log("End Date:", endDate.toISOString());
    console.log("Modified End Date:", modifiedEndDate.toISOString());
    console.log("Chart Type:", chartGroupingType);

    // First, check if raw data exists - using Date objects for timestamp
    const rawDataCount = await Telemetry.countDocuments({
      imei: imei,
      [tsKey]: {
        $gte: startDate,
        $lte: modifiedEndDate,
      },
    });
    console.log("Raw telemetry count:", rawDataCount);

    let aggregationPipeline: any[];

    if (chartGroupingType === "weekly") {
      aggregationPipeline = [
        {
          $match: {
            imei: imei,
            [tsKey]: {
              $gte: startDate,
              $lte: endDate,
            },
            [speedKey]: { $exists: true },
            [odometerKey]: { $exists: true },
            [ignitionKey]: { $exists: true },
          },
        },
        {
          $addFields: {
            // ts is already a Date object, no conversion needed
            dateTs: `$${tsKey}`,
            // Convert speed from mm/s to km/h (assuming it's in mm/s)
            // 1 mm/s = 0.0036 km/h
            speed: {
              $multiply: [{ $toDouble: `$${speedKey}` }, 0.0036],
            },
            // Convert odometer to meters (assuming it's in mm or similar)
            odometer: { $toDouble: `$${odometerKey}` },
            ignition: { $toDouble: `$${ignitionKey}` },
          },
        },
        {
          $addFields: {
            // Calculate week start (Monday) using $dateTrunc if MongoDB 5.0+
            weekStart: {
              $dateTrunc: {
                date: "$dateTs",
                unit: "week",
                startOfWeek: "monday",
              },
            },
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
          },
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
                    speed: "$speed",
                  },
                  "$$REMOVE",
                ],
              },
            },
            recordCount: { $sum: 1 },
          },
        },
        {
          $sort: { _id: 1 },
        },
      ];
    } else {
      // daily
      aggregationPipeline = [
        {
          $match: {
            imei: imei,
            [tsKey]: {
              $gte: startDate,
              $lte: endDate,
            },
            [speedKey]: { $exists: true },
            [odometerKey]: { $exists: true },
            [ignitionKey]: { $exists: true },
          },
        },
        {
          $addFields: {
            dateTs: `$${tsKey}`,
            // Convert speed from mm/s to km/h
            speed: {
              $multiply: [{ $toDouble: `$${speedKey}` }, 0.0036],
            },
            odometer: { $toDouble: `$${odometerKey}` },
            ignition: { $toDouble: `$${ignitionKey}` },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$dateTs",
              },
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
                    speed: "$speed",
                  },
                  "$$REMOVE",
                ],
              },
            },
            recordCount: { $sum: 1 },
          },
        },
        {
          $sort: { _id: 1 },
        },
      ];
    }

    // console.log(
    //   "Aggregation pipeline:",
    //   JSON.stringify(aggregationPipeline, null, 2)
    // );

    const aggregationResults = await Telemetry.aggregate(aggregationPipeline);
    // console.log("Aggregation results:", aggregationResults);

    // Convert to SpeedReportEntry format
    const resultMap = new Map<string, SpeedReportEntry>();

    // Generate all expected date labels for the range
    const expectedDates = this.generateDateLabels(
      startDate,
      endDate,
      chartGroupingType
    );

    for (const dateLabel of expectedDates) {
      const aggregatedData = aggregationResults.find((result) => {
        if (chartGroupingType === "weekly") {
          return new Date(result._id).toISOString().split("T")[0] === dateLabel;
        } else {
          return result._id === dateLabel;
        }
      });

      // Calculate driving time from readings (simplified inline calculation)
      let drivingTime = 0;
      if (
        aggregatedData?.drivingReadings &&
        Array.isArray(aggregatedData.drivingReadings)
      ) {
        const validReadings = aggregatedData.drivingReadings
          .filter((r: any) => r && r.ts)
          .sort((a: any, b: any) => {
            const aTime = a.ts instanceof Date ? a.ts.getTime() : a.ts;
            const bTime = b.ts instanceof Date ? b.ts.getTime() : b.ts;
            return aTime - bTime;
          });

        // Simple estimation: count readings where ignition was on, multiply by average interval
        if (validReadings.length > 1) {
          const firstTime =
            validReadings[0].ts instanceof Date
              ? validReadings[0].ts.getTime()
              : validReadings[0].ts;
          const lastTime =
            validReadings[validReadings.length - 1].ts instanceof Date
              ? validReadings[validReadings.length - 1].ts.getTime()
              : validReadings[validReadings.length - 1].ts;

          const totalTimeSpan = (lastTime - firstTime) / (1000 * 60); // minutes
          // Estimate driving time as a percentage of total time span based on reading frequency
          drivingTime = Math.min(totalTimeSpan, validReadings.length * 2); // Assume 2 minutes per reading
        }
      }

      // Calculate total distance in kilometers
      const totalDistance = aggregatedData
        ? Math.max(
            0,
            ((aggregatedData.lastOdometer || 0) -
              (aggregatedData.firstOdometer || 0)) /
              1000
          )
        : 0;

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
        hasData: (aggregatedData?.recordCount || 0) > 0,
      };

      resultMap.set(dateLabel, entry);
    }

    console.log("Final result map:", Array.from(resultMap.values()));
    return resultMap;
  }

  // Helper method to calculate driving time from readings

  // Helper method to generate expected date labels
  private generateDateLabels(
    startDate: Date,
    endDate: Date,
    chartGroupingType: ChartGroupingType
  ): string[] {
    const labels: string[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      if (chartGroupingType === "weekly") {
        // Get Monday of the current week
        const monday = new Date(current);
        const dayOfWeek = monday.getDay();
        const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        monday.setDate(monday.getDate() + daysToMonday);

        if (!isNaN(monday.getTime())) {
          labels.push(monday.toISOString().split("T")[0]!); // <-- added !
        }
        current.setDate(current.getDate() + 7);
      } else {
        if (!isNaN(current.getTime())) {
          labels.push(current.toISOString().split("T")[0]!); // <-- added !
        }
        current.setDate(current.getDate() + 1);
      }
    }

    return [...new Set(labels)];
  }
}
