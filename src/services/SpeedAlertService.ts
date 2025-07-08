import { Telemetry } from "../models/Telemetry";
import { AVL_ID_MAP } from "../utils/avlIdMap";
import { ChartGroupingType } from "../types";

export class SpeedAnalyticsService {

  async getSpeedAnalytics(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType,
    speedLimitKph: number = 120
  ): Promise<Map<string, any>> {
    
    const tsKey = `state.reported.ts`;
    const speedKey = `state.reported.${AVL_ID_MAP.SPEED}`;
    const gpsSpeedKey = `state.reported.sp`;
    const rpmKey = `state.reported.${AVL_ID_MAP.ENGINE_RPM}`;
    const odometerKey = `state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`;
    const ignitionKey = `state.reported.${AVL_ID_MAP.IGNITION}`;

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
          $or: [
            { [speedKey]: { $exists: true, $type: "number" } },
            { [gpsSpeedKey]: { $exists: true, $type: "number" } }
          ]
        }
      },

      { $sort: { [tsKey]: 1 } },

      // Use OBD speed if available, otherwise GPS speed
      {
        $addFields: {
          actualSpeed: {
            $cond: {
              if: { $and: [{ $exists: [`$${speedKey}`] }, { $type: [`$${speedKey}`, "number"] }] },
              then: `$${speedKey}`,
              else: { $ifNull: [`$${gpsSpeedKey}`, 0] }
            }
          }
        }
      },

      // Calculate deltas for analysis
      {
        $setWindowFields: {
          partitionBy: "$imei",
          sortBy: { [tsKey]: 1 },
          output: {
            previousSpeed: {
              $shift: { output: "$actualSpeed", by: -1, default: null }
            },
            previousTimestamp: {
              $shift: { output: `$${tsKey}`, by: -1, default: null }
            },
            previousOdometer: {
              $shift: { output: `$${odometerKey}`, by: -1, default: null }
            }
          }
        }
      },

      {
        $addFields: {
          timeDeltaSeconds: {
            $cond: {
              if: { $ne: ["$previousTimestamp", null] },
              then: { $divide: [{ $subtract: [`$${tsKey}`, "$previousTimestamp"] }, 1000] },
              else: 0
            }
          },
          speedDeltaKph: {
            $cond: {
              if: { $ne: ["$previousSpeed", null] },
              then: { $subtract: ["$actualSpeed", "$previousSpeed"] },
              else: 0
            }
          },
          distanceDeltaKm: {
            $cond: {
              if: { $ne: ["$previousOdometer", null] },
              then: { $divide: [{ $subtract: [`$${odometerKey}`, "$previousOdometer"] }, 1000] },
              else: 0
            }
          }
        }
      },

      {
        $addFields: {
          isMoving: { $gt: ["$actualSpeed", 0] },
          isSpeeding: { $gt: ["$actualSpeed", speedLimitKph] },
          isRapidAccel: {
            $and: [
              { $ne: ["$previousTimestamp", null] },
              { $gt: ["$speedDeltaKph", 15] }, // 15 km/h increase
              { $lt: ["$timeDeltaSeconds", 5] } // within 5 seconds
            ]
          },
          isRapidDecel: {
            $and: [
              { $ne: ["$previousTimestamp", null] },
              { $lt: ["$speedDeltaKph", -15] }, // 15 km/h decrease
              { $lt: ["$timeDeltaSeconds", 5] } // within 5 seconds
            ]
          }
        }
      },

      {
        $group: {
          _id: {
            $dateToString: {
              format: groupByFormat,
              date: { $toDate: `$${tsKey}` },
              timezone: "UTC"
            }
          },
          
          // Basic speed metrics
          maxSpeed: { $max: "$actualSpeed" },
          minSpeed: { $min: { $cond: ["$isMoving", "$actualSpeed", null] } },
          avgSpeed: { $avg: { $cond: ["$isMoving", "$actualSpeed", null] } },
          
          // Distance and time
          totalDistance: { $sum: { $cond: [{ $gt: ["$distanceDeltaKm", 0] }, "$distanceDeltaKm", 0] } },
          totalDrivingTime: { $sum: { $cond: ["$isMoving", "$timeDeltaSeconds", 0] } },
          
          // Violations
          speedingCount: { $sum: { $cond: ["$isSpeeding", 1, 0] } },
          speedingTime: { $sum: { $cond: ["$isSpeeding", "$timeDeltaSeconds", 0] } },
          speedingDistance: { $sum: { $cond: ["$isSpeeding", "$distanceDeltaKm", 0] } },
          
          // Behavior analysis
          rapidAccelCount: { $sum: { $cond: ["$isRapidAccel", 1, 0] } },
          rapidDecelCount: { $sum: { $cond: ["$isRapidDecel", 1, 0] } },
          
          // Engine data
          avgRpm: { $avg: { $cond: ["$isMoving", `$${rpmKey}`, null] } },
          maxRpm: { $max: `$${rpmKey}` },
          
          // Status
          ignitionOnTime: { $sum: { $cond: [{ $eq: [`$${ignitionKey}`, 1] }, "$timeDeltaSeconds", 0] } },
          
          // Latest values
          currentSpeed: { $last: "$actualSpeed" },
          currentRpm: { $last: `$${rpmKey}` },
          currentIgnition: { $last: `$${ignitionKey}` },
          
          // Data quality
          totalRecords: { $sum: 1 },
          movingRecords: { $sum: { $cond: ["$isMoving", 1, 0] } },
          
          lastUpdate: { $last: `$${tsKey}` }
        }
      },

      {
        $project: {
          _id: 0,
          date: "$_id",
          
          // Speed metrics
          maxSpeed: { $round: [{ $ifNull: ["$maxSpeed", 0] }, 1] },
          minSpeed: { $round: [{ $ifNull: ["$minSpeed", 0] }, 1] },
          avgSpeed: { $round: [{ $ifNull: ["$avgSpeed", 0] }, 1] },
          
          // Distance and time
          totalDistance: { $round: [{ $ifNull: ["$totalDistance", 0] }, 2] },
          totalDrivingTime: { $round: [{ $divide: [{ $ifNull: ["$totalDrivingTime", 0] }, 3600] }, 2] }, // Convert to hours
          
          // Violations
          speedingCount: { $ifNull: ["$speedingCount", 0] },
          speedingTime: { $round: [{ $divide: [{ $ifNull: ["$speedingTime", 0] }, 60] }, 1] }, // Convert to minutes
          speedingDistance: { $round: [{ $ifNull: ["$speedingDistance", 0] }, 2] },
          speedingPercentage: {
            $cond: {
              if: { $gt: ["$totalDrivingTime", 0] },
              then: { $round: [{ $multiply: [{ $divide: ["$speedingTime", "$totalDrivingTime"] }, 100] }, 1] },
              else: 0
            }
          },
          
          // Behavior
          rapidAccelCount: { $ifNull: ["$rapidAccelCount", 0] },
          rapidDecelCount: { $ifNull: ["$rapidDecelCount", 0] },
          
          // Engine metrics
          avgRpm: { $round: [{ $ifNull: ["$avgRpm", 0] }, 0] },
          maxRpm: { $round: [{ $ifNull: ["$maxRpm", 0] }, 0] },
          
          // Efficiency
          fuelEfficiency: {
            $cond: {
              if: { $gt: ["$totalDistance", 0] },
              then: { $round: [{ $divide: ["$avgRpm", "$totalDistance"] }, 2] },
              else: 0
            }
          },
          
          // Status
          ignitionOnTime: { $round: [{ $divide: [{ $ifNull: ["$ignitionOnTime", 0] }, 3600] }, 2] }, // Hours
          currentSpeed: { $round: [{ $ifNull: ["$currentSpeed", 0] }, 1] },
          currentRpm: { $round: [{ $ifNull: ["$currentRpm", 0] }, 0] },
          currentIgnition: { $cond: [{ $eq: ["$currentIgnition", 1] }, "ON", "OFF"] },
          
          // Data quality
          dataQuality: {
            $cond: {
              if: { $gt: ["$totalRecords", 0] },
              then: { $round: [{ $multiply: [{ $divide: ["$movingRecords", "$totalRecords"] }, 100] }, 0] },
              else: 0
            }
          },
          
          // Safety score (0-100)
          safetyScore: {
            $let: {
              vars: {
                baseScore: 100,
                speedPenalty: { $multiply: ["$speedingCount", 2] },
                accelPenalty: { $multiply: ["$rapidAccelCount", 3] },
                decelPenalty: { $multiply: ["$rapidDecelCount", 3] }
              },
              in: {
                $max: [
                  0,
                  { $subtract: [
                    "$$baseScore",
                    { $add: ["$$speedPenalty", "$$accelPenalty", "$$decelPenalty"] }
                  ]}
                ]
              }
            }
          },
          
          lastUpdate: "$lastUpdate",
          hasData: { $gt: ["$totalRecords", 0] }
        }
      },

      { $sort: { date: 1 } }
    ];

    const results = await Telemetry.aggregate(pipeline);
    const reportMap = new Map<string, any>();

    results.forEach((item) => {
      reportMap.set(item.date, item);
    });

    return reportMap;
  }

  async getCurrentSpeedStatus(imei: string): Promise<{
    currentSpeed: number;
    currentRpm: number;
    ignitionStatus: string;
    isMoving: boolean;
    isSpeeding: boolean;
    speedLimit: number;
    lastUpdate: number;
    trend: string;
  } | null> {
    
    const tsKey = `state.reported.ts`;
    const speedKey = `state.reported.${AVL_ID_MAP.SPEED}`;
    const gpsSpeedKey = `state.reported.sp`;
    const rpmKey = `state.reported.${AVL_ID_MAP.ENGINE_RPM}`;
    const ignitionKey = `state.reported.${AVL_ID_MAP.IGNITION}`;

    // Get last few readings to determine trend
    const recent = await Telemetry.find({
      imei,
      $or: [
        { [speedKey]: { $exists: true, $type: "number" } },
        { [gpsSpeedKey]: { $exists: true, $type: "number" } }
      ]
    })
    .sort({ [tsKey]: -1 })
    .limit(5)
    .select({
      [tsKey]: 1,
      [speedKey]: 1,
      [gpsSpeedKey]: 1,
      [rpmKey]: 1,
      [ignitionKey]: 1
    });

    if (recent.length === 0) return null;

    const latest = recent[0];
    if (!latest || !latest.state?.reported) return null;

    const reported = latest.state?.reported;

    if (!reported) return null;

    const obdSpeed = reported[AVL_ID_MAP.SPEED];
    const gpsSpeed = reported.sp;
    const currentSpeed = obdSpeed || gpsSpeed || 0;
    const currentRpm = reported[AVL_ID_MAP.ENGINE_RPM] || 0;
    const ignition = reported[AVL_ID_MAP.IGNITION] || 0;
    const speedLimit = 120; // Default speed limit

    // Determine trend
    let trend = "stable";
    if (recent.length > 1) {
      const speeds = recent.map(r => {
        const rep = r.state?.reported;
        return rep?.[AVL_ID_MAP.SPEED] || rep?.sp || 0;
      });
      
      const avgRecent = speeds.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
      const avgOlder = speeds.slice(2).reduce((a, b) => a + b, 0) / (speeds.length - 2);
      
      if (avgRecent > avgOlder + 5) trend = "increasing";
      else if (avgRecent < avgOlder - 5) trend = "decreasing";
    }

    return {
      currentSpeed: parseFloat(currentSpeed.toFixed(1)),
      currentRpm: Math.round(currentRpm),
      ignitionStatus: ignition === 1 ? "ON" : "OFF",
      isMoving: currentSpeed > 0,
      isSpeeding: currentSpeed > speedLimit,
      speedLimit,
      lastUpdate: reported.ts || Date.now(),
      trend
    };
  }

  async getSpeedViolations(
    imei: string,
    startDate: Date,
    endDate: Date,
    speedLimitKph: number = 120
  ): Promise<Array<{
    timestamp: number;
    speed: number;
    speedLimit: number;
    excessSpeed: number;
    duration: number;
    location?: string;
    severity: string;
  }>> {
    
    const tsKey = `state.reported.ts`;
    const speedKey = `state.reported.${AVL_ID_MAP.SPEED}`;
    const gpsSpeedKey = `state.reported.sp`;
    const locationKey = `state.reported.latlng`;

    const pipeline: any[] = [
      {
        $match: {
          imei,
          [tsKey]: { $gte: startDate.getTime(), $lte: endDate.getTime() },
          $or: [
            { [speedKey]: { $gt: speedLimitKph } },
            { [gpsSpeedKey]: { $gt: speedLimitKph } }
          ]
        }
      },

      { $sort: { [tsKey]: 1 } },

      {
        $addFields: {
          actualSpeed: {
            $cond: {
              if: { $and: [{ $exists: [`$${speedKey}`] }, { $type: [`$${speedKey}`, "number"] }] },
              then: `$${speedKey}`,
              else: { $ifNull: [`$${gpsSpeedKey}`, 0] }
            }
          }
        }
      },

      {
        $match: {
          actualSpeed: { $gt: speedLimitKph }
        }
      },

      {
        $setWindowFields: {
          partitionBy: "$imei",
          sortBy: { [tsKey]: 1 },
          output: {
            previousTimestamp: {
              $shift: { output: `$${tsKey}`, by: -1, default: null }
            }
          }
        }
      },

      {
        $addFields: {
          duration: {
            $cond: {
              if: { $ne: ["$previousTimestamp", null] },
              then: { $divide: [{ $subtract: [`$${tsKey}`, "$previousTimestamp"] }, 1000] },
              else: 0
            }
          }
        }
      },

      {
        $project: {
          _id: 0,
          timestamp: `$${tsKey}`,
          speed: { $round: ["$actualSpeed", 1] },
          speedLimit: speedLimitKph,
          excessSpeed: { $round: [{ $subtract: ["$actualSpeed", speedLimitKph] }, 1] },
          duration: { $round: ["$duration", 1] },
          location: `$${locationKey}`,
          severity: {
            $cond: [
              { $gt: ["$actualSpeed", { $add: [speedLimitKph, 30] }] },
              "HIGH",
              { $cond: [
                { $gt: ["$actualSpeed", { $add: [speedLimitKph, 15] }] },
                "MEDIUM",
                "LOW"
              ]}
            ]
          }
        }
      },

      { $limit: 100 } // Limit to most recent violations
    ];

    const results = await Telemetry.aggregate(pipeline);
    return results;
  }

  async getSpeedChartData(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType
  ): Promise<Array<{
    date: string;
    maxSpeed: number;
    avgSpeed: number;
    violations: number;
    distance: number;
    drivingTime: number;
  }>> {
    
    const speedData = await this.getSpeedAnalytics(imei, startDate, endDate, type);
    const chartData = [];

    for (const [date, data] of speedData.entries()) {
      chartData.push({
        date,
        maxSpeed: data.maxSpeed,
        avgSpeed: data.avgSpeed,
        violations: data.speedingCount,
        distance: data.totalDistance,
        drivingTime: data.totalDrivingTime
      });
    }

    return chartData;
  }

  async getSpeedSummary(
    imei: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalDistance: number;
    totalDrivingTime: number;
    maxSpeed: number;
    avgSpeed: number;
    speedingViolations: number;
    speedingTime: number;
    speedingDistance: number;
    safetyScore: number;
    rapidAccelerations: number;
    rapidDecelerations: number;
  }> {
    
    const speedData = await this.getSpeedAnalytics(imei, startDate, endDate, "daily");
    
    let totalDistance = 0;
    let totalDrivingTime = 0;
    let maxSpeed = 0;
    let totalAvgSpeed = 0;
    let speedingViolations = 0;
    let speedingTime = 0;
    let speedingDistance = 0;
    let totalSafetyScore = 0;
    let rapidAccelerations = 0;
    let rapidDecelerations = 0;
    let validDays = 0;

    for (const [, data] of speedData.entries()) {
      if (data.hasData) {
        totalDistance += data.totalDistance;
        totalDrivingTime += data.totalDrivingTime;
        maxSpeed = Math.max(maxSpeed, data.maxSpeed);
        totalAvgSpeed += data.avgSpeed;
        speedingViolations += data.speedingCount;
        speedingTime += data.speedingTime;
        speedingDistance += data.speedingDistance;
        totalSafetyScore += data.safetyScore;
        rapidAccelerations += data.rapidAccelCount;
        rapidDecelerations += data.rapidDecelCount;
        validDays++;
      }
    }

    return {
      totalDistance: parseFloat(totalDistance.toFixed(2)),
      totalDrivingTime: parseFloat(totalDrivingTime.toFixed(2)),
      maxSpeed: parseFloat(maxSpeed.toFixed(1)),
      avgSpeed: validDays > 0 ? parseFloat((totalAvgSpeed / validDays).toFixed(1)) : 0,
      speedingViolations,
      speedingTime: parseFloat(speedingTime.toFixed(1)),
      speedingDistance: parseFloat(speedingDistance.toFixed(2)),
      safetyScore: validDays > 0 ? Math.round(totalSafetyScore / validDays) : 0,
      rapidAccelerations,
      rapidDecelerations
    };
  }
}