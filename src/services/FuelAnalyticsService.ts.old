import { Telemetry } from "../models/Telemetry";
import { AVL_ID_MAP } from "../utils/avlIdMap";
import { FuelSummary, DailyFuelBarChartData, ChartGroupingType } from "../types";

export class FuelAnalyticsService {
  private readonly FUEL_TANK_CAPACITY_LITERS = 60;

  async getFuelAnalyticsReport(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType
  ): Promise<Map<string, FuelSummary>> {
    
    const tsKey = `state.reported.ts`;
    const fuelKey = `state.reported.${AVL_ID_MAP.FUEL_LEVEL}`;
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
          [fuelKey]: { $exists: true, $type: "number", $gte: 0, $lte: 100 },
          [odometerKey]: { $exists: true, $type: "number" },
        },
      },

      { $sort: { [tsKey]: 1 } },

      {
        $group: {
          _id: {
            day: {
              $dateToString: {
                format: groupByFormat,
                date: { $toDate: `$${tsKey}` },
                timezone: "UTC"
              }
            }
          },
          
          dayStartFuelPercent: { $first: `$${fuelKey}` },
          dayEndFuelPercent: { $last: `$${fuelKey}` },
          dayStartOdometer: { $first: `$${odometerKey}` },
          dayEndOdometer: { $last: `$${odometerKey}` },
          currentFuelLevel: { $last: `$${fuelKey}` },
          currentIgnitionStatus: { $last: `$${ignitionKey}` },
          lastUpdateTime: { $last: `$${tsKey}` },
          minFuelPercent: { $min: `$${fuelKey}` },
          maxFuelPercent: { $max: `$${fuelKey}` },
          readingCount: { $sum: 1 }
        }
      },

      {
        $addFields: {
          dayStartFuelLiters: {
            $multiply: ["$dayStartFuelPercent", { $divide: [this.FUEL_TANK_CAPACITY_LITERS, 100] }]
          },
          dayEndFuelLiters: {
            $multiply: ["$dayEndFuelPercent", { $divide: [this.FUEL_TANK_CAPACITY_LITERS, 100] }]
          },
          currentFuelLiters: {
            $multiply: ["$currentFuelLevel", { $divide: [this.FUEL_TANK_CAPACITY_LITERS, 100] }]
          },
          
          dailyDistanceKm: {
            $divide: [
              { $subtract: ["$dayEndOdometer", "$dayStartOdometer"] },
              1000
            ]
          },
          
          refuelAmount: {
            $cond: {
              if: {
                $gt: [
                  { $subtract: ["$maxFuelPercent", "$minFuelPercent"] },
                  8
                ]
              },
              then: {
                $multiply: [
                  { $subtract: ["$maxFuelPercent", "$minFuelPercent"] },
                  { $divide: [this.FUEL_TANK_CAPACITY_LITERS, 100] }
                ]
              },
              else: 0
            }
          }
        }
      },

      {
        $addFields: {
          actualFuelConsumed: {
            $cond: {
              if: { $gt: ["$refuelAmount", 0] },
              then: {
                $add: [
                  { $subtract: ["$dayStartFuelLiters", "$dayEndFuelLiters"] },
                  "$refuelAmount"
                ]
              },
              else: {
                $max: [0, { $subtract: ["$dayStartFuelLiters", "$dayEndFuelLiters"] }]
              }
            }
          },
          
          estimatedFuelUsed: {
            $cond: {
              if: { $gt: ["$dailyDistanceKm", 0] },
              then: { $multiply: ["$dailyDistanceKm", 0.10] },
              else: 0
            }
          },
          
          fuelEfficiencyKmL: {
            $cond: {
              if: {
                $and: [
                  { $gt: ["$dailyDistanceKm", 1] },
                  { $gt: ["$actualFuelConsumed", 0] }
                ]
              },
              then: { $divide: ["$dailyDistanceKm", "$actualFuelConsumed"] },
              else: 0
            }
          },
          
          fuelEfficiencyL100km: {
            $cond: {
              if: {
                $and: [
                  { $gt: ["$dailyDistanceKm", 1] },
                  { $gt: ["$actualFuelConsumed", 0] }
                ]
              },
              then: {
                $multiply: [
                  { $divide: ["$actualFuelConsumed", "$dailyDistanceKm"] },
                  100
                ]
              },
              else: 0
            }
          }
        }
      },

      {
        $project: {
          _id: 0,
          date: "$_id.day",
          startingFuelPercent: { $round: ["$dayStartFuelPercent", 1] },
          endingFuelPercent: { $round: ["$dayEndFuelPercent", 1] },
          currentFuelLevel: { $round: ["$currentFuelLevel", 1] },
          startingFuelLiters: { $round: ["$dayStartFuelLiters", 1] },
          endingFuelLiters: { $round: ["$dayEndFuelLiters", 1] },
          currentFuelLiters: { $round: ["$currentFuelLiters", 1] },
          totalFuelConsumedLiters: { $round: ["$actualFuelConsumed", 2] },
          estimatedFuelUsed: { $round: ["$estimatedFuelUsed", 2] },
          totalFuelRefueledLiters: { $round: ["$refuelAmount", 2] },
          totalDistanceKm: { $round: ["$dailyDistanceKm", 2] },
          mileageKmL: { $round: ["$fuelEfficiencyKmL", 2] },
          fuelEfficiencyL100km: { $round: ["$fuelEfficiencyL100km", 2] },
          currentIgnitionStatus: "$currentIgnitionStatus",
          ignitionStatusText: {
            $cond: {
              if: { $eq: ["$currentIgnitionStatus", 1] },
              then: "ON",
              else: "OFF"
            }
          },
          refuelOccurred: { $gt: ["$refuelAmount", 0] },
          lastUpdateTime: "$lastUpdateTime",
          dataQuality: "$readingCount"
        }
      },

      { $sort: { date: 1 } }
    ];

    const results = await Telemetry.aggregate(pipeline);

    const reportMap = new Map<string, FuelSummary>();
    results.forEach((point) => {
      reportMap.set(point.date, {
        startingFuelPercent: point.startingFuelPercent || 0,
        endingFuelPercent: point.endingFuelPercent || 0,
        currentFuelLevel: point.currentFuelLevel || 0,
        currentFuelLiters: point.currentFuelLiters || 0,
        startingFuelLiters: point.startingFuelLiters || 0,
        endingFuelLiters: point.endingFuelLiters || 0,
        totalFuelConsumedLiters: point.totalFuelConsumedLiters || 0,
        estimatedFuelUsed: point.estimatedFuelUsed || 0,
        totalFuelRefueledLiters: point.totalFuelRefueledLiters || 0,
        totalDistanceKm: point.totalDistanceKm || 0,
        mileageKmL: point.mileageKmL || 0,
        fuelEfficiencyL100km: point.fuelEfficiencyL100km || 0,
        currentIgnitionStatus: point.currentIgnitionStatus || 0,
        ignitionStatusText: point.ignitionStatusText || "OFF",
        refuelOccurred: point.refuelOccurred || false,
        lastUpdateTime: point.lastUpdateTime,
        dataQuality: point.dataQuality
      });
    });

    return reportMap;
  }

  async getDailyFuelBarChartData(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType
  ): Promise<Map<string, DailyFuelBarChartData>> {
    
    const tsKey = `state.reported.ts`;
    const fuelKey = `state.reported.${AVL_ID_MAP.FUEL_LEVEL}`;
    const odometerKey = `state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`;

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
          [fuelKey]: { $exists: true, $type: "number", $gte: 0, $lte: 100 },
          [odometerKey]: { $exists: true, $type: "number" },
        },
      },

      { $sort: { [tsKey]: 1 } },

      {
        $group: {
          _id: {
            period: {
              $dateToString: {
                format: groupByFormat,
                date: { $toDate: `$${tsKey}` },
                timezone: "UTC"
              }
            },
            dayOfWeek: {
              $dayOfWeek: { $toDate: `$${tsKey}` }
            }
          },
          
          dayStartFuelPercent: { $first: `$${fuelKey}` },
          dayEndFuelPercent: { $last: `$${fuelKey}` },
          minFuelPercent: { $min: `$${fuelKey}` },
          maxFuelPercent: { $max: `$${fuelKey}` },
          dayStartOdometer: { $first: `$${odometerKey}` },
          dayEndOdometer: { $last: `$${odometerKey}` },
          readingCount: { $sum: 1 }
        }
      },

      {
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
                { case: { $eq: ["$_id.dayOfWeek", 7] }, then: "Saturday" }
              ],
              default: "Unknown"
            }
          },
          
          dayStartFuelLiters: {
            $multiply: ["$dayStartFuelPercent", { $divide: [this.FUEL_TANK_CAPACITY_LITERS, 100] }]
          },
          dayEndFuelLiters: {
            $multiply: ["$dayEndFuelPercent", { $divide: [this.FUEL_TANK_CAPACITY_LITERS, 100] }]
          },
          minFuelLiters: {
            $multiply: ["$minFuelPercent", { $divide: [this.FUEL_TANK_CAPACITY_LITERS, 100] }]
          },
          maxFuelLiters: {
            $multiply: ["$maxFuelPercent", { $divide: [this.FUEL_TANK_CAPACITY_LITERS, 100] }]
          }
        }
      },

      {
        $addFields: {
          refuelAmount: {
            $cond: {
              if: {
                $gt: [
                  { $subtract: ["$maxFuelPercent", "$minFuelPercent"] },
                  8
                ]
              },
              then: { $subtract: ["$maxFuelLiters", "$minFuelLiters"] },
              else: 0
            }
          },
          
          netFuelChange: {
            $subtract: ["$dayEndFuelLiters", "$dayStartFuelLiters"]
          }
        }
      },

      {
        $addFields: {
          totalFuelConsumedLiters: {
            $cond: {
              if: { $gt: ["$refuelAmount", 0] },
              then: {
                $subtract: ["$refuelAmount", "$netFuelChange"]
              },
              else: {
                $max: [0, { $subtract: ["$dayStartFuelLiters", "$dayEndFuelLiters"] }]
              }
            }
          },
          
          totalFuelRefueledLiters: "$refuelAmount"
        }
      },

      {
        $project: {
          _id: 0,
          label: "$_id.period",
          dayName: 1,
          dayOfWeek: "$_id.dayOfWeek",
          totalFuelConsumedLiters: { $round: ["$totalFuelConsumedLiters", 2] },
          totalFuelRefueledLiters: { $round: ["$totalFuelRefueledLiters", 2] },
          hasData: { $gt: ["$readingCount", 10] }
        }
      },

      { $sort: { label: 1 } }
    ];

    const results = await Telemetry.aggregate(pipeline);

    const dbDataMap = new Map<string, any>();
    results.forEach((point) => {
      dbDataMap.set(point.label, point);
    });

    const reportMap = new Map<string, DailyFuelBarChartData>();
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      
      const dateString = date.toISOString().split('T')[0]!;
      const dayOfWeek = date.getDay();
      const dayName = dayNames[dayOfWeek]!;
      
      const dbData = dbDataMap.get(dateString);
      
      if (dbData) {
        reportMap.set(dateString, {
          date: dateString,
          dayName: dayName,
          dayOfWeek: dayOfWeek + 1,
          chartLabel: `${dayName}`,
          totalFuelConsumedLiters: dbData.totalFuelConsumedLiters || 0,
          totalFuelRefueledLiters: dbData.totalFuelRefueledLiters || 0,
          hasData: dbData.hasData || false
        });
      } else {
        reportMap.set(dateString, {
          date: dateString,
          dayName: dayName,
          dayOfWeek: dayOfWeek + 1,
          chartLabel: `${dayName}`,
          totalFuelConsumedLiters: 0,
          totalFuelRefueledLiters: 0,
          hasData: false
        });
      }
    }

    return reportMap;
  }
}