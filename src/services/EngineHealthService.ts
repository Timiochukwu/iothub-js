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
    const telemetry = await Telemetry.findOne({ imei }).sort({
      "state.reported.ts": -1,
    });
    if (!telemetry) {
      throw new Error("No telemetry data found for the given IMEI");
    }
    const reported = telemetry.state?.reported;
    // Calculate oilLevel based on reported faults
    let oilLevelStatus = "NORMAL";
    const activeFaults = reported?.[AVL_ID_MAP.DTC_COUNT] || 0;

    if (activeFaults > 0) {
      oilLevelStatus = "CHECK_REQUIRED";
    }

    return {
      coolantTemp: reported?.[AVL_ID_MAP.COOLANT_TEMPERATURE] || 0,
      fuelTrim: reported?.[AVL_ID_MAP.SHORT_FUEL_TRIM] || 0,
      engineLoad: reported?.[AVL_ID_MAP.ENGINE_LOAD] || 0,
      rpm: reported?.[AVL_ID_MAP.ENGINE_RPM] || 0,
      speed: reported?.[AVL_ID_MAP.SPEED] || 0,
      ignitionStatus: reported?.[AVL_ID_MAP.IGNITION] ? "ON" : "OFF",
      oilLevel: oilLevelStatus,
    };
  }
}
