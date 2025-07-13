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

    // Get current status from latest telemetry
    const latestTelemetry = await Telemetry.findOne({ imei })
      .sort({ [tsKey]: -1 })
      .select({
        [tsKey]: 1,
        [rpmKey]: 1,
        [speedKey]: 1,
        [tempKey]: 1,
        [dtcKey]: 1,
        [ignitionKey]: 1,
      });

    let currentIgnitionStatus = "OFF";
    if (latestTelemetry) {
      const reported = latestTelemetry.state?.reported;
      const currentRpm = reported?.[AVL_ID_MAP.ENGINE_RPM];
      const currentSpeed = reported?.[AVL_ID_MAP.SPEED];
      const currentIgnition = reported?.[AVL_ID_MAP.IGNITION];

      if (
        currentIgnition === 1 ||
        (currentRpm && currentRpm > 0) ||
        (currentSpeed && currentSpeed > 0)
      ) {
        currentIgnitionStatus = "ON";
      }
    }

    const pipeline: any[] = [
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [rpmKey]: { $exists: true },
          [tempKey]: { $exists: true },
          [speedKey]: { $exists: true },
          [dtcKey]: { $exists: true },
        },
      },

      {
        $group: {
          _id: null,
          currentSpeed: { $first: `$${speedKey}` },
          currentTemp: { $first: `$${tempKey}` },
          activeFaults: { $first: `$${dtcKey}` },
          avgRpm: { $avg: `$${rpmKey}` },
          readingCount: { $sum: 1 },
        },
      },

      {
        $project: {
          _id: 0,
          avgRpm: { $round: ["$avgRpm", 0] },
          temperature: "$currentTemp",
          speed: "$currentSpeed",
          activeFaults: "$activeFaults",
          oilLevel: {
            $cond: {
              if: { $gt: ["$activeFaults", 0] },
              then: "CHECK_REQUIRED",
              else: "NORMAL",
            },
          },
          hasData: { $gt: ["$readingCount", 0] },
        },
      },
    ];

    const results = await Telemetry.aggregate(pipeline);

    const reportMap = new Map<string, EngineHealthData>();
    const today = new Date().toISOString().split("T")[0]!;

    if (results.length > 0) {
      const data = results[0];
      reportMap.set(today, {
        date: today,
        ignitionStatus: currentIgnitionStatus,
        engineStatus: currentIgnitionStatus,
        avgRpm: data.avgRpm,
        temperature: data.temperature,
        oilLevel: data.oilLevel,
        speed: data.speed,
        activeFaults: data.activeFaults,
        dtcFaults: [],
        hasData: data.hasData,
      });
    }

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
