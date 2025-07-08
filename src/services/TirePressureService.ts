import { Telemetry } from "../models/Telemetry";
import { AVL_ID_MAP } from "../utils/avlIdMap";
import { DailyTirePressureData, ChartGroupingType } from "../types";

export class TirePressureService {

  async getDailyTirePressureData(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType
  ): Promise<Map<string, DailyTirePressureData>> {
    
    const tsKey = `state.reported.ts`;
    const pressureKey = `state.reported.${AVL_ID_MAP.TYRE_PRESSURE}`;
    const ignitionKey = `state.reported.${AVL_ID_MAP.IGNITION}`;
    const odometerKey = `state.reported.${AVL_ID_MAP.TOTAL_ODOMETER}`;
    const locationKey = `state.reported.latlng`;

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
          [pressureKey]: { $exists: true, $type: "number" },
          [ignitionKey]: { $exists: true },
          [odometerKey]: { $exists: true },
          [locationKey]: { $exists: true }
        },
      },

      { $sort: { [tsKey]: 1 } },

      // Add trip detection using ignition and movement
      {
        $setWindowFields: {
          partitionBy: "$imei",
          sortBy: { [tsKey]: 1 },
          output: {
            previousIgnition: {
              $shift: { output: `$${ignitionKey}`, by: -1, default: null }
            },
            previousOdometer: {
              $shift: { output: `$${odometerKey}`, by: -1, default: null }
            }
          }
        }
      },

      // Identify trip starts and ends
      {
        $addFields: {
          isTripStart: {
            $and: [
              { $eq: [`$${ignitionKey}`, 1] },
              { $or: [
                { $eq: ["$previousIgnition", null] },
                { $eq: ["$previousIgnition", 0] }
              ]}
            ]
          },
          isTripEnd: {
            $and: [
              { $eq: [`$${ignitionKey}`, 0] },
              { $eq: ["$previousIgnition", 1] }
            ]
          }
        }
      },

      // Group by day and collect trip data
      {
        $group: {
          _id: {
            day: {
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
          
          // Pressure statistics
          avgPressure: { $avg: `$${pressureKey}` },
          minPressure: { $min: `$${pressureKey}` },
          maxPressure: { $max: `$${pressureKey}` },
          
          // All pressure readings for variations
          allReadings: {
            $push: {
              time: `$${tsKey}`,
              pressure: `$${pressureKey}`,
              location: `$${locationKey}`,
              odometer: `$${odometerKey}`,
              ignition: `$${ignitionKey}`
            }
          }
        }
      },

      // Process trips and calculate metrics
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
          }
        }
      },

      {
        $project: {
          _id: 0,
          date: "$_id.day",
          dayName: 1,
          dayOfWeek: "$_id.dayOfWeek",
          allReadings: 1,
          hasData: { $gt: [{ $size: "$allReadings" }, 0] }
        }
      },

      { $sort: { date: 1 } }
    ];

    const results = await Telemetry.aggregate(pipeline);

    // Process results and create trip data
    const reportMap = new Map<string, DailyTirePressureData>();
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    // Generate all 7 days
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      
      const dateString = date.toISOString().split('T')[0]!;
      const dayOfWeek = date.getDay();
      const dayName = dayNames[dayOfWeek]!;
      
      // Find data for this day
      const dayData = results.find(r => r.date === dateString);
      
      if (dayData) {
        const { distanceCovered, mainPressure, startLocation, endLocation } = this.processTripsFromReadings(dayData);
        
        reportMap.set(dateString, {
          date: dateString,
          dayName: dayName,
          dayOfWeek: dayOfWeek + 1,
          chartLabel: dayName,
          distanceCovered: distanceCovered,
          mainPressure: mainPressure,
          startLocation: startLocation,
          endLocation: endLocation,
          hasData: dayData.hasData
        });
      } else {
        reportMap.set(dateString, {
          date: dateString,
          dayName: dayName,
          dayOfWeek: dayOfWeek + 1,
          chartLabel: dayName,
          distanceCovered: 0,
          mainPressure: 0,
          startLocation: "",
          endLocation: "",
          hasData: false
        });
      }
    }

    return reportMap;
  }

  async getCurrentTirePressure(imei: string): Promise<{
    pressure: number;
    location: string;
    timestamp: number;
    status: string;
  } | null> {
    const tsKey = `state.reported.ts`;
    const pressureKey = `state.reported.${AVL_ID_MAP.TYRE_PRESSURE}`;
    const locationKey = `state.reported.latlng`;

    const latest = await Telemetry.findOne({ 
      imei,
      [pressureKey]: { $exists: true }
    })
    .sort({ [tsKey]: -1 })
    .select({
      [tsKey]: 1,
      [pressureKey]: 1,
      [locationKey]: 1
    });

    if (!latest || !latest.state?.reported) {
      return null;
    }

    const reported = latest.state.reported;
    const pressure = reported[AVL_ID_MAP.TYRE_PRESSURE] || 0;
    
    let status = "NORMAL";
    if (pressure === 0) {
      status = "NO_DATA";
    } else if (pressure < 25) {
      status = "LOW";
    } else if (pressure < 30) {
      status = "WARNING";
    }

    return {
      pressure,
      location: reported.latlng || "",
      timestamp: reported.ts || Date.now(),
      status
    };
  }

  async getTirePressureHistory(
    imei: string,
    hours: number = 24
  ): Promise<Array<{
    pressure: number;
    location: string;
    timestamp: number;
  }>> {
    const tsKey = `state.reported.ts`;
    const pressureKey = `state.reported.${AVL_ID_MAP.TYRE_PRESSURE}`;
    const locationKey = `state.reported.latlng`;

    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);

    const results = await Telemetry.find({
      imei,
      [tsKey]: { $gte: cutoffTime },
      [pressureKey]: { $exists: true, $gt: 0 }
    })
    .sort({ [tsKey]: -1 })
    .limit(100)
    .select({
      [tsKey]: 1,
      [pressureKey]: 1,
      [locationKey]: 1
    });

    return results.map(doc => {
      const reported = doc.state?.reported;
      return {
        pressure: reported?.[AVL_ID_MAP.TYRE_PRESSURE] || 0,
        location: reported?.latlng || "",
        timestamp: reported?.ts || 0
      };
    }).reverse(); // Return chronological order
  }

  private processTripsFromReadings(dayData: any): { 
    distanceCovered: number; 
    mainPressure: number; 
    startLocation: string; 
    endLocation: string 
  } {
    const readings = dayData.allReadings || [];
    
    if (readings.length === 0) {
      return { distanceCovered: 0, mainPressure: 0, startLocation: "", endLocation: "" };
    }

    // Get first and last readings
    const firstReading = readings[0];
    const lastReading = readings[readings.length - 1];
    
    // Calculate distance covered
    const distanceCovered = Math.round(
      (lastReading.odometer - firstReading.odometer) / 1000 * 100
    ) / 100;

    // Get pressure, start and end locations
    const mainPressure = lastReading.pressure || 0;
    const startLocation = firstReading.location || "";
    const endLocation = lastReading.location || "";

    return { distanceCovered, mainPressure, startLocation, endLocation };
  }
}