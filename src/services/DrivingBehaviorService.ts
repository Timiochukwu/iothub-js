
import { Telemetry } from "../models/Telemetry";
import { AVL_ID_MAP } from "../utils/avlIdMap";
import { 
  DrivingSummary, 
  AnalyticsSummary, 
  ReportOptions, 
  ChartGroupingType,
  SpeedChartPoint 
} from "../types";

export class DrivingBehaviorService {

  async getDrivingBehaviorReport(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType,
    options: ReportOptions
  ): Promise<Map<string, DrivingSummary>> {
    
    const tsKey = `state.reported.${AVL_ID_MAP.TIMESTAMP}`;
    const speedKey = `state.reported.${AVL_ID_MAP.SPEED}`;
    const rpmKey = `state.reported.${AVL_ID_MAP.RPM}`;

    let groupByFormat: string;
    switch (type) {
      case "weekly": groupByFormat = "%Y-%U"; break;
      case "monthly": groupByFormat = "%Y-%m"; break;
      case "daily":
      default: groupByFormat = "%Y-%m-%d"; break;
    }

    const pipeline: any[] = [
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [speedKey]: { $exists: true, $type: "number" },
        },
      },

      { $sort: { [tsKey]: 1 } },

      {
        $setWindowFields: {
          partitionBy: "$imei",
          sortBy: { [tsKey]: 1 },
          output: {
            previousSpeed: {
              $shift: { output: `$${speedKey}`, by: -1, default: null },
            },
            previousTimestamp: {
              $shift: { output: `$${tsKey}`, by: -1, default: null },
            },
          },
        },
      },

      {
        $addFields: {
          timeDeltaSeconds: {
            $cond: {
              if: { $ne: ["$previousTimestamp", null] },
              then: {
                $divide: [
                  { $subtract: [`$${tsKey}`, "$previousTimestamp"] },
                  1000,
                ],
              },
              else: 0,
            },
          },
          speedDeltaKph: {
            $cond: {
              if: { $ne: ["$previousSpeed", null] },
              then: { $subtract: [`$${speedKey}`, "$previousSpeed"] },
              else: 0,
            },
          },
          distanceDeltaKm: {
            $cond: {
              if: { $ne: ["$previousTimestamp", null] },
              then: {
                $multiply: [
                  {
                    $divide: [{ $add: [`$${speedKey}`, "$previousSpeed"] }, 2],
                  },
                  {
                    $divide: [
                      { $subtract: [`$${tsKey}`, "$previousTimestamp"] },
                      3600000,
                    ],
                  },
                ],
              },
              else: 0,
            },
          },
        },
      },

      {
        $addFields: {
          isMoving: { $gt: [`$${speedKey}`, 0] },
          isSpeeding: { $gt: [`$${speedKey}`, options.speedLimitKph] },
          isRapidAccel: {
            $and: [
              { $ne: ["$previousTimestamp", null] },
              { $gt: ["$speedDeltaKph", options.rapidAccelKph] },
              { $lte: ["$timeDeltaSeconds", options.rapidAccelSeconds] },
            ],
          },
          isRapidDecel: {
            $and: [
              { $ne: ["$previousTimestamp", null] },
              { $lt: ["$speedDeltaKph", -options.rapidDecelKph] },
              { $lte: ["$timeDeltaSeconds", options.rapidDecelSeconds] },
            ],
          },
        },
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
          totalDistanceKm: { $sum: "$distanceDeltaKm" },
          totalDrivingTimeSeconds: {
            $sum: { $cond: ["$isMoving", "$timeDeltaSeconds", 0] },
          },
          maxSpeedKph: { $max: `$${speedKey}` },
          movingSpeeds: {
            $push: { $cond: ["$isMoving", `$${speedKey}`, "$$REMOVE"] },
          },
          movingRpms: {
            $push: { $cond: ["$isMoving", `$${rpmKey}`, "$$REMOVE"] },
          },
          speedingCount: { $sum: { $cond: ["$isSpeeding", 1, 0] } },
          speedingDistanceKm: {
            $sum: { $cond: ["$isSpeeding", "$distanceDeltaKm", 0] },
          },
          rapidAccelCount: { $sum: { $cond: ["$isRapidAccel", 1, 0] } },
          rapidDecelCount: { $sum: { $cond: ["$isRapidDecel", 1, 0] } },
        },
      },

      {
        $project: {
          _id: 0,
          label: "$_id",
          summary: {
            totalDistanceKm: "$totalDistanceKm",
            totalDrivingTimeSeconds: "$totalDrivingTimeSeconds",
            maxSpeedKph: "$maxSpeedKph",
            averageMovingSpeedKph: { $avg: "$movingSpeeds" },
            averageRpm: { $avg: "$movingRpms" },
            speedingCount: "$speedingCount",
            speedingDistanceKm: "$speedingDistanceKm",
            rapidAccelCount: "$rapidAccelCount",
            rapidDecelCount: "$rapidDecelCount",
          },
        },
      },

      { $sort: { label: 1 } },
    ];

    const results = await Telemetry.aggregate(pipeline);

    const reportMap = new Map<string, DrivingSummary>();

    results.forEach((point) => {
      const summary = point.summary;
      reportMap.set(point.label, {
        totalDistanceKm: parseFloat(summary.totalDistanceKm?.toFixed(2) ?? "0"),
        totalDrivingTimeSeconds: Math.round(summary.totalDrivingTimeSeconds ?? 0),
        maxSpeedKph: parseFloat(summary.maxSpeedKph?.toFixed(2) ?? "0"),
        averageMovingSpeedKph: parseFloat(summary.averageMovingSpeedKph?.toFixed(2) ?? "0"),
        averageRpm: Math.round(summary.averageRpm ?? 0),
        speedingCount: summary.speedingCount ?? 0,
        speedingDistanceKm: parseFloat(summary.speedingDistanceKm?.toFixed(2) ?? "0"),
        rapidAccelCount: summary.rapidAccelCount ?? 0,
        rapidDecelCount: summary.rapidDecelCount ?? 0,
      });
    });

    return reportMap;
  }

  async getAnalyticsSummary(
    imei: string,
    startDate: Date,
    endDate: Date,
    options: ReportOptions
  ): Promise<AnalyticsSummary | null> {
    
    const tsKey = `state.reported.${AVL_ID_MAP.TIMESTAMP}`;
    const speedKey = `state.reported.${AVL_ID_MAP.SPEED}`;
    const rpmKey = `state.reported.${AVL_ID_MAP.RPM}`;
    const odometerKey = `state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`;

    const pipeline: any[] = [
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [speedKey]: { $exists: true, $type: "number" },
        },
      },

      { $sort: { [tsKey]: 1 } },

      {
        $setWindowFields: {
          partitionBy: "$imei",
          sortBy: { [tsKey]: 1 },
          output: {
            previousSpeed: {
              $shift: { output: `$${speedKey}`, by: -1, default: null },
            },
            previousTimestamp: {
              $shift: { output: `$${tsKey}`, by: -1, default: null },
            },
            previousOdometer: {
              $shift: { output: `$${odometerKey}`, by: -1, default: null },
            },
          },
        },
      },

      {
        $addFields: {
          timeDeltaSeconds: {
            $cond: {
              if: { $ne: ["$previousTimestamp", null] },
              then: {
                $divide: [
                  { $subtract: [`$${tsKey}`, "$previousTimestamp"] },
                  1000,
                ],
              },
              else: 0,
            },
          },
          speedDeltaKph: {
            $cond: {
              if: { $ne: ["$previousSpeed", null] },
              then: { $subtract: [`$${speedKey}`, "$previousSpeed"] },
              else: 0,
            },
          },
          distanceDeltaKm: {
            $cond: {
              if: { $ne: ["$previousOdometer", null] },
              then: {
                $divide: [
                  { $subtract: [`$${odometerKey}`, "$previousOdometer"] },
                  1000
                ]
              },
              else: 0
            }
          }
        },
      },

      {
        $addFields: {
          isMoving: { $gt: [`$${speedKey}`, 0] },
          isSpeeding: { $gt: [`$${speedKey}`, options.speedLimitKph] },
          isRapidAccel: {
            $and: [
              { $ne: ["$previousTimestamp", null] },
              { $gt: ["$speedDeltaKph", options.rapidAccelKph] },
              { $lte: ["$timeDeltaSeconds", options.rapidAccelSeconds] },
            ],
          },
          isRapidDecel: {
            $and: [
              { $ne: ["$previousTimestamp", null] },
              { $lt: ["$speedDeltaKph", -options.rapidDecelKph] },
              { $lte: ["$timeDeltaSeconds", options.rapidDecelSeconds] },
            ],
          },
        },
      },

      {
        $group: {
          _id: null,
          totalDistanceKm: { $sum: "$distanceDeltaKm" },
          totalDrivingTimeSeconds: {
            $sum: { $cond: ["$isMoving", "$timeDeltaSeconds", 0] },
          },
          maxSpeedKph: { $max: `$${speedKey}` },
          movingSpeeds: {
            $push: { $cond: ["$isMoving", `$${speedKey}`, "$$REMOVE"] },
          },
          movingRpms: {
            $push: { $cond: ["$isMoving", `$${rpmKey}`, "$$REMOVE"] },
          },
          speedingCount: { $sum: { $cond: ["$isSpeeding", 1, 0] } },
          speedingDistanceKm: {
            $sum: { $cond: ["$isSpeeding", "$distanceDeltaKm", 0] },
          },
          rapidAccelCount: { $sum: { $cond: ["$isRapidAccel", 1, 0] } },
          rapidDecelCount: { $sum: { $cond: ["$isRapidDecel", 1, 0] } },
        },
      },

      {
        $project: {
          _id: 0,
          totalDistanceKm: 1,
          totalDrivingTimeSeconds: 1,
          maxSpeedKph: 1,
          averageMovingSpeedKph: { $avg: "$movingSpeeds" },
          averageRpm: { $avg: "$movingRpms" },
          speedingCount: 1,
          speedingDistanceKm: 1,
          rapidAccelCount: 1,
          rapidDecelCount: 1,
        },
      },
    ];

    const results = await Telemetry.aggregate(pipeline);

    if (!results || results.length === 0) {
      return null;
    }

    const summary = results[0];
    return {
      totalDistanceKm: parseFloat(summary.totalDistanceKm?.toFixed(2) ?? "0"),
      totalDrivingTimeSeconds: Math.round(summary.totalDrivingTimeSeconds ?? 0),
      maxSpeedKph: parseFloat(summary.maxSpeedKph?.toFixed(2) ?? "0"),
      averageMovingSpeedKph: parseFloat(summary.averageMovingSpeedKph?.toFixed(2) ?? "0"),
      averageRpm: Math.round(summary.averageRpm ?? 0),
      speedingCount: summary.speedingCount ?? 0,
      speedingDistanceKm: parseFloat(summary.speedingDistanceKm?.toFixed(2) ?? "0"),
      rapidAccelCount: summary.rapidAccelCount ?? 0,
      rapidDecelCount: summary.rapidDecelCount ?? 0,
    };
  }

  async getSpeedChartData(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType
  ): Promise<SpeedChartPoint[]> {
    
    const tsKey = `state.reported.${AVL_ID_MAP.TIMESTAMP}`;
    const speedKey = `state.reported.${AVL_ID_MAP.SPEED}`;

    let groupByFormat: string;
    switch (type) {
      case "weekly": groupByFormat = "%Y-%U"; break;
      case "monthly": groupByFormat = "%Y-%m"; break;
      case "daily":
      default: groupByFormat = "%Y-%m-%d"; break;
    }

    const results = await Telemetry.aggregate([
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          [speedKey]: { $exists: true, $type: "number" },
        },
      },

      {
        $group: {
          _id: {
            $dateToString: {
              format: groupByFormat,
              date: { $toDate: `$${tsKey}` },
            },
          },
          maxSpeed: { $max: `$${speedKey}` },
          averageSpeed: {
            $avg: {
              $cond: [{ $gt: [`$${speedKey}`, 0] }, `$${speedKey}`, null],
            },
          },
        },
      },

      {
        $project: {
          _id: 0,
          label: "$_id",
          maxSpeed: { $ifNull: ["$maxSpeed", 0] },
          averageSpeed: { $ifNull: ["$averageSpeed", 0] },
        },
      },

      { $sort: { label: 1 } },
    ]);

    return results.map((r) => ({
      ...r,
      maxSpeed: parseFloat(r.maxSpeed.toFixed(2)),
      averageSpeed: parseFloat(r.averageSpeed.toFixed(2)),
    }));
  }

  async getCurrentDrivingStatus(imei: string): Promise<{
    isMoving: boolean;
    currentSpeed: number;
    currentRpm: number;
    ignitionStatus: string;
    timestamp: number;
  } | null> {
    
    const tsKey = `state.reported.ts`;
    const speedKey = `state.reported.${AVL_ID_MAP.SPEED}`;
    const rpmKey = `state.reported.${AVL_ID_MAP.ENGINE_RPM}`;
    const ignitionKey = `state.reported.${AVL_ID_MAP.IGNITION}`;
  
    const latest = await Telemetry.findOne({ imei })
      .sort({ [tsKey]: -1 })
      .select({
        [tsKey]: 1,
        [speedKey]: 1,
        [rpmKey]: 1,
        [ignitionKey]: 1
      });
  
    if (!latest || !latest.state?.reported) {
      return null;
    }
  
    const reported = latest.state.reported;
    const currentSpeed = reported[AVL_ID_MAP.SPEED] || 0;
    const currentRpm = reported[AVL_ID_MAP.ENGINE_RPM] || 0;
    const ignition = reported[AVL_ID_MAP.IGNITION] || 0;
  
    return {
      isMoving: currentSpeed > 0,
      currentSpeed,
      currentRpm,
      ignitionStatus: ignition === 1 ? "ON" : "OFF",
      timestamp: reported.ts || Date.now()
    };
  }
}