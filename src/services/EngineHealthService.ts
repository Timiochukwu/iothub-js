import { Telemetry } from "../models/Telemetry";
import { AVL_ID_MAP } from "../utils/avlIdMap";
import { EngineHealthData, DTCFaultData, ChartGroupingType } from "../types/";

export class EngineHealthService {
  async getEngineHealthData(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType
  ): Promise<Map<string, EngineHealthData>> {
    const tsKey = `state.reported.ts`;
    const ignitionKey = `state.reported.${AVL_ID_MAP.IGNITION}`;
    const rpmKey = `state.reported.${AVL_ID_MAP.ENGINE_RPM}`;
    const tempKey = `state.reported.${AVL_ID_MAP.COOLANT_TEMPERATURE}`;
    const speedKey = `state.reported.${AVL_ID_MAP.SPEED}`;
    const dtcKey = `state.reported.${AVL_ID_MAP.DTC_COUNT}`;

    const reportMap = new Map<string, EngineHealthData>();

    const pipeline: any[] = [
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          // Ensure relevant keys exist for calculations
          [rpmKey]: { $exists: true },
          [tempKey]: { $exists: true },
          [speedKey]: { $exists: true },
          [dtcKey]: { $exists: true },
        },
      },
      {
        $group: {
          _id:
            type === "daily"
              ? {
                  year: { $year: { $toDate: `$${tsKey}` } },
                  month: { $month: { $toDate: `$${tsKey}` } },
                  day: { $dayOfMonth: { $toDate: `$${tsKey}` } },
                }
              : type === "weekly"
                ? {
                    year: { $year: { $toDate: `$${tsKey}` } },
                    week: { $week: { $toDate: `$${tsKey}` } },
                  }
                : {
                    year: { $year: { $toDate: `$${tsKey}` } },
                    month: { $month: { $toDate: `$${tsKey}` } },
                  },
          avgRpm: { $avg: `$${rpmKey}` },
          avgTemperature: { $avg: `$${tempKey}` },
          avgSpeed: { $avg: `$${speedKey}` },
          // Get the maximum DTC count within the grouped period
          maxActiveFaults: { $max: `$${dtcKey}` },
          // Check if any readings in the group indicate ignition/movement
          hasIgnitionOrMovement: {
            $max: {
              $cond: [
                {
                  $or: [
                    // Corrected: Compare directly to the field value, not the string key
                    `$${ignitionKey}`, // This will evaluate to 0 or 1
                    { $gt: [`$${rpmKey}`, 0] },
                    { $gt: [`$${speedKey}`, 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          readingCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          date: {
            $dateToString: {
              format:
                type === "daily"
                  ? "%Y-%m-%d"
                  : type === "weekly"
                    ? "%Y-W%U"
                    : "%Y-%m",
              date: {
                $dateFromParts: {
                  year: "$_id.year",
                  month: type === "weekly" ? 1 : "$_id.month", // For weekly, month is not directly used for formatting date, set to 1
                  day: type === "daily" ? "$_id.day" : 1, // For monthly/weekly, day is not directly used for formatting date, set to 1
                },
              },
            },
          },
          avgRpm: { $round: ["$avgRpm", 0] },
          temperature: { $round: ["$avgTemperature", 0] },
          speed: { $round: ["$avgSpeed", 0] },
          activeFaults: "$maxActiveFaults",
          ignitionStatus: {
            $cond: ["$hasIgnitionOrMovement", "ON", "OFF"],
          },
          engineStatus: {
            $cond: ["$hasIgnitionOrMovement", "ON", "OFF"],
          },
          oilLevel: {
            $cond: {
              if: { $gt: ["$maxActiveFaults", 0] },
              then: "CHECK_REQUIRED",
              else: "NORMAL",
            },
          },
          hasData: { $gt: ["$readingCount", 0] },
        },
      },
      {
        $sort: { date: 1 }, // Sort by date to get chronological order
      },
    ];

    const results = await Telemetry.aggregate(pipeline);

    results.forEach((data) => {
      reportMap.set(data.date, {
        date: data.date,
        ignitionStatus: data.ignitionStatus,
        engineStatus: data.engineStatus,
        avgRpm: data.avgRpm,
        temperature: data.temperature,
        oilLevel: data.oilLevel,
        speed: data.speed,
        activeFaults: data.activeFaults,
        dtcFaults: [], // DTC faults are fetched separately by getActiveDTCs
        hasData: data.hasData,
      });
    });

    return reportMap;
  }

  async getActiveDTCs(
    imei: string,
    startDate: Date,
    endDate: Date
  ): Promise<DTCFaultData[]> {
    const tsKey = `state.reported.ts`;
    const dtcCountKey = `state.reported.${AVL_ID_MAP.DTC_COUNT}`;
    const milKey = `state.reported.${AVL_ID_MAP.DISTANCE_TRAVELED_MIL_ON}`;
    const engineLoadKey = `state.reported.${AVL_ID_MAP.ENGINE_LOAD}`;
    const coolantTempKey = `state.reported.${AVL_ID_MAP.COOLANT_TEMPERATURE}`;
    const fuelTrimKey = `state.reported.${AVL_ID_MAP.SHORT_FUEL_TRIM}`;
    const locationKey = `state.reported.latlng`;

    const pipeline: any[] = [
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [dtcCountKey]: { $gt: 0 },
        },
      },

      { $sort: { [tsKey]: -1 } },

      {
        $project: {
          _id: 0,
          timestamp: `$${tsKey}`,
          dtcCount: `$${dtcCountKey}`,
          milDistance: `$${milKey}`,
          engineLoad: `$${engineLoadKey}`,
          coolantTemp: `$${coolantTempKey}`,
          fuelTrim: `$${fuelTrimKey}`,
          location: `$${locationKey}`,

          suspectedFault: {
            $switch: {
              branches: [
                {
                  case: { $gt: [`$${coolantTempKey}`, 105] },
                  then: "COOLING_SYSTEM",
                },
                {
                  case: { $gt: [{ $abs: `$${fuelTrimKey}` }, 15] },
                  then: "FUEL_SYSTEM",
                },
                {
                  case: { $gt: [`$${engineLoadKey}`, 85] },
                  then: "ENGINE_PERFORMANCE",
                },
              ],
              default: "UNKNOWN",
            },
          },
        },
      },
    ];

    const results = await Telemetry.aggregate(pipeline);

    return results.map((fault, index) => ({
      faultId: `DTC_${Date.now()}_${index}`,
      timestamp: new Date(fault.timestamp).toISOString(),
      dtcCount: fault.dtcCount,
      suspectedCode: this.generateSuspectedCode(fault.suspectedFault),
      description: this.getFaultDescription(fault.suspectedFault),
      severity: this.getSeverityLevel(fault),
      location: fault.location,
      symptoms: this.analyzeSymptoms(fault),
      milDistance: fault.milDistance,
      isActive: true,
    }));
  }

  private generateSuspectedCode(faultType: string): string {
    const codes: { [key: string]: string } = {
      COOLING_SYSTEM: "P0217",
      FUEL_SYSTEM: "P0171",
      ENGINE_PERFORMANCE: "P0300",
      UNKNOWN: "P0000",
    };
    return codes[faultType] || "P0000";
  }

  private getFaultDescription(faultType: string): string {
    const descriptions: { [key: string]: string } = {
      COOLING_SYSTEM: "Engine Overheating Condition",
      FUEL_SYSTEM: "Fuel System Too Lean",
      ENGINE_PERFORMANCE: "Engine Performance Issue",
      UNKNOWN: "Unknown Engine Fault",
    };
    return descriptions[faultType] || "Unknown Engine Fault";
  }

  private getSeverityLevel(fault: any): string {
    if (fault.coolantTemp > 110) return "CRITICAL";
    if (fault.dtcCount > 3) return "HIGH";
    if (fault.milDistance > 0) return "MEDIUM";
    return "LOW";
  }

  private analyzeSymptoms(fault: any): string[] {
    const symptoms = [];
    if (fault.coolantTemp > 105) symptoms.push("High coolant temperature");
    if (Math.abs(fault.fuelTrim) > 15) symptoms.push("Fuel trim out of range");
    if (fault.engineLoad > 85) symptoms.push("High engine load");
    if (fault.milDistance > 0) symptoms.push("MIL lamp activated");
    return symptoms;
  }

  async getCurrentEngineStatus(imei: string): Promise<any> {
    try {
      console.log("=== Starting getCurrentEngineStatus ===");
      console.log("IMEI received:", imei);
  
      if (!imei) {
        throw new Error("IMEI is required");
      }
  
      // Step 1: Get the absolute latest data for movement and ignition status
      const latestTelemetry = await Telemetry.findOne({ imei })
        .sort({ "state.reported.ts": -1 });
  
      if (!latestTelemetry) {
        throw new Error("No telemetry data found for the given IMEI");
      }
  
      const latestData = latestTelemetry.toObject ? latestTelemetry.toObject() : latestTelemetry;
      
      if (!latestData.state?.reported) {
        throw new Error("No reported data found in latest telemetry");
      }
  
      const latestReported = latestData.state.reported;
  
      // Get movement and ignition status from absolute latest data
      const ignitionValue = latestReported[239];
      const engineStatus = ignitionValue === 1 ? "ON" : "OFF";
      
      const movementValue = latestReported[240];
      const movementStatus = movementValue === 1 ? "MOVING" : "STOPPED";
  
      // Step 2: Get the latest data that has VIN (256) and RPM (36) for engine data
      const engineTelemetry = await Telemetry.findOne({
        imei,
        $and: [
          { "state.reported.256": { $exists: true } }, // Has VIN
          { "state.reported.36": { $exists: true } }   // Has RPM
        ]
      }).sort({ "state.reported.ts": -1 });
  
      let reported, dataSource;
      
      if (engineTelemetry) {
        const engineData = engineTelemetry.toObject ? engineTelemetry.toObject() : engineTelemetry;
        reported = engineData.state.reported;
        dataSource = "engine_data_with_vin_rpm";
        console.log("Using engine data with VIN and RPM");
      } else {
        // Fallback to latest data if no data with VIN and RPM found
        reported = latestReported;
        dataSource = "latest_data_fallback";
        console.log("No data with VIN and RPM found, using latest data");
      }
      
      // Calculate data age for engine data
      const reportedTime = new Date(reported.ts);
      const dataAge = Math.floor((Date.now() - reportedTime.getTime()) / 1000);
  
      console.log(`Using ${dataSource} from ${dataAge} seconds ago for engine data`);
      console.log("Available keys:", Object.keys(reported));
  
      // Helper function to safely get values from engine data
      const getValue = (key: string | number): number | null => {
        const value = reported[key.toString()];
        return value !== undefined ? value : null;
      };
  
      // Oil Level Status
      let oilLevel = "UNKNOWN";
      const dtcCount = getValue(30);
      if (dtcCount !== null) {
        oilLevel = dtcCount > 0 ? "CHECK REQUIRED" : "NORMAL";
      }
  
      // Build limited response with only requested fields
      const response = {
        // Engine Status
        engineStatus, // ON/OFF based on ignition
        
        // Average RPM
        avgRpm: getValue(36), // Engine RPM
        
        // Temperature in °C
        temperature: getValue(32), // Coolant temperature in Celsius
        
        // Oil Level
        oilLevel,
        
        // Location
        location: {
          latLng: reported.latlng || null,
          altitude: reported.alt || 0,
          angle: reported.ang || 0
        },
        
        // VIN
        vin: getValue(256), // Vehicle Identification Number
        
        // Speed
        speed: getValue(37) || reported.sp || 0, // OBD speed or GPS speed
        
        // Additional requested fields
        coolantTemp: getValue(32), // Same as temperature
        fuelTrim: getValue(33), // Short fuel trim percentage
        engineLoad: getValue(31), // Engine load percentage
        rpm: getValue(36), // Same as avgRpm
        ignitionStatus: engineStatus, // Same as engineStatus
        
        // Movement status (from latest data)
        movement: movementStatus,
        
        // Metadata
        timestamp: reported.ts,
        dataAge, // Age in seconds
        deviceActive: dataAge < 300 // Consider active if data is less than 5 minutes old
      };
  
      // Log summary of what data we found
      console.log("Response summary:", {
        engineStatus: `${engineStatus} (from latest)`,
        movementStatus: `${movementStatus} (from latest)`,
        engineDataAge: `${dataAge}s`,
        dataSource,
        temperature: response.temperature,
        rpm: response.rpm,
        speed: response.speed,
        hasVin: response.vin !== null
      });
  
      return response;
  
    } catch (error) {
      console.error("=== ERROR in getCurrentEngineStatus ===");
      console.error("Error message:", error instanceof Error ? error.message : String(error));
      console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      throw error;
    }
  }
  
}
