import { FuelAnalyticsService } from "./FuelAnalyticsService";
import { EngineHealthService } from "./EngineHealthService";
import { TirePressureService } from "./TirePressureService";
import { DrivingBehaviorService } from "./DrivingBehaviorService";
import { BatteryAnalyticsService } from "./BatteryAnalyticsService";
import {
  CombinedAnalyticsPoint,
  ChartGroupingType,
  ReportOptions,
  AnalyticsSummary,
} from "../types";

export class CombinedAnalyticsService {
  private engineHealthService: EngineHealthService;
  private tirePressureService: TirePressureService;
  private drivingBehaviorService: DrivingBehaviorService;
  private batteryAnalyticsService: BatteryAnalyticsService;

  constructor() {
    this.engineHealthService = new EngineHealthService();
    this.tirePressureService = new TirePressureService();
    this.drivingBehaviorService = new DrivingBehaviorService();
    this.batteryAnalyticsService = new BatteryAnalyticsService();
  }

  async getCombinedAnalyticsReport(
    imei: string,
    startDate: Date,
    endDate: Date,
    type: ChartGroupingType,
    options: ReportOptions
  ): Promise<CombinedAnalyticsPoint[]> {
    // 1. Fetch all reports in parallel for maximum efficiency

    // const [
    //   drivingReportMap,
    //   fuelReportMap,
    //   batteryReportMap,
    //   fuelBarChartMap,
    //   tirePressureMap,
    //   engineHealthMap,
    // ] = await Promise.all([
    //   this.drivingBehaviorService.getDrivingBehaviorReport(
    //     imei,
    //     startDate,
    //     endDate,
    //     type,
    //     options
    //   ),
    //   this.fuelAnalyticsService.getFuelAnalyticsReport(
    //     imei,
    //     startDate,
    //     endDate,
    //     type
    //   ),
    //   this.batteryAnalyticsService.getBatteryAnalyticsReport(
    //     imei,
    //     startDate,
    //     endDate,
    //     type
    //   ),
    //   // this.fuelAnalyticsService.getDailyFuelBarChartData(imei, startDate, endDate, type),
    //   this.tirePressureService.getDailyTirePressureData(
    //     imei,
    //     startDate,
    //     endDate,
    //     type
    //   ),
    //   this.engineHealthService.getEngineHealthData(
    //     imei,
    //     startDate,
    //     endDate,
    //     type
    //   ),
    // ]);

    // // 2. Merge all reports using their labels (dates/weeks/months) as keys
    // const combinedReport = new Map<string, CombinedAnalyticsPoint>();

    // // Add driving data to the map
    // for (const [label, summary] of drivingReportMap.entries()) {
    //   combinedReport.set(label, {
    //     label,
    //     driving_data: summary,
    //     fuel_data: null,
    //     battery_data: null,
    //     fuel_chart_data: null,
    //     tire_pressure_data: null,
    //     engine_health_data: null,
    //   });
    // }

    // // Add/merge fuel data into the map
    // for (const [label, summary] of fuelReportMap.entries()) {
    //   const existingEntry = combinedReport.get(label);
    //   if (existingEntry) {
    //     existingEntry.fuel_data = summary;
    //   } else {
    //     combinedReport.set(label, {
    //       label,
    //       driving_data: null,
    //       fuel_data: summary,
    //       battery_data: null,
    //       fuel_chart_data: null,
    //       tire_pressure_data: null,
    //       engine_health_data: null,
    //     });
    //   }
    // }

    // // Add/merge battery data into the map
    // for (const [label, summary] of batteryReportMap.entries()) {
    //   const existingEntry = combinedReport.get(label);
    //   if (existingEntry) {
    //     existingEntry.battery_data = summary;
    //   } else {
    //     combinedReport.set(label, {
    //       label,
    //       driving_data: null,
    //       fuel_data: null,
    //       battery_data: summary,
    //       fuel_chart_data: null,
    //       tire_pressure_data: null,
    //       engine_health_data: null,
    //     });
    //   }
    // }

    // // Add/merge fuel chart data
    // for (const [label, summary] of fuelBarChartMap.entries()) {
    //   const existingEntry = combinedReport.get(label);
    //   if (existingEntry) {
    //     existingEntry.fuel_chart_data = summary;
    //   } else {
    //     combinedReport.set(label, {
    //       label,
    //       driving_data: null,
    //       fuel_data: null,
    //       battery_data: null,
    //       fuel_chart_data: summary,
    //       tire_pressure_data: null,
    //       engine_health_data: null,
    //     });
    //   }
    // }

    // // Add/merge tire pressure data
    // for (const [label, summary] of tirePressureMap.entries()) {
    //   const existingEntry = combinedReport.get(label);
    //   if (existingEntry) {
    //     existingEntry.tire_pressure_data = summary;
    //   } else {
    //     combinedReport.set(label, {
    //       label,
    //       driving_data: null,
    //       fuel_data: null,
    //       battery_data: null,
    //       fuel_chart_data: null,
    //       tire_pressure_data: summary,
    //       engine_health_data: null,
    //     });
    //   }
    // }

    // // Add/merge engine health data
    // for (const [label, summary] of engineHealthMap.entries()) {
    //   const existingEntry = combinedReport.get(label);
    //   if (existingEntry) {
    //     existingEntry.engine_health_data = summary;
    //   } else {
    //     combinedReport.set(label, {
    //       label,
    //       driving_data: null,
    //       fuel_data: null,
    //       battery_data: null,
    //       fuel_chart_data: null,
    //       tire_pressure_data: null,
    //       engine_health_data: summary,
    //     });
    //   }
    // }

    // // 3. Convert the map back to a sorted array for the final response
    // const finalReport = Array.from(combinedReport.values());
    // finalReport.sort((a, b) => a.label.localeCompare(b.label));

    // return finalReport;
    return [];
  }

  async getAnalyticsSummary(
    imei: string,
    startDate: Date,
    endDate: Date,
    options: ReportOptions
  ): Promise<AnalyticsSummary | null> {
    return await this.drivingBehaviorService.getAnalyticsSummary(
      imei,
      startDate,
      endDate,
      options
    );
  }

  async getVehicleOverview(imei: string): Promise<{
    currentStatus: any;
    batteryHealth: any;
    engineHealth: any;
    tirePressure: any;
  }> {
    // Get current status from all services
    const [drivingStatus, batteryStatus, engineStatus, tireStatus] =
      await Promise.all([
        this.drivingBehaviorService.getCurrentDrivingStatus
          ? this.drivingBehaviorService.getCurrentDrivingStatus(imei)
          : null,
        this.batteryAnalyticsService.getCurrentBatteryStatus(imei),
        this.engineHealthService.getEngineHealthData(
          imei,
          new Date(),
          new Date(),
          "daily"
        ),
        this.tirePressureService.getCurrentTirePressure(imei),
      ]);

    return {
      currentStatus: drivingStatus,
      batteryHealth: batteryStatus,
      engineHealth: Array.from(engineStatus.values())[0] || null,
      tirePressure: tireStatus,
    };
  }
}
