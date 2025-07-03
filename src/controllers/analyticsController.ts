import { Request, Response } from "express";
import { RealTimeService } from "../services/RealTimeService";
import { ApiResponse } from "../types";

import { CustomError } from "../middleware/errorHandler";
import { JwtUtils } from "../utils/jwt";
import { mapTelemetry } from "../utils/mapTelemetry";
import { TelemetryDTO } from "../types/TelemetryDTO";

import {
  TelemetryService,
  ReportOptions,
  ChartGroupingType,
} from "../services/TelemetryService";

const reportOptions: ReportOptions = {
  // From UI: "Speed for more than 5 seconds over 135km/h"
  // Note: The "5 seconds" part is implicitly handled by the number of telemetry points.
  // The core rule is the speed limit itself.
  speedLimitKph: 135,

  // From UI: "Acceleration in 2 seconds overs 7km/h"
  rapidAccelKph: 7,
  rapidAccelSeconds: 2,

  // From UI: "Deceleration in 2 seconds overs 9km/h"
  rapidDecelKph: 9,
  rapidDecelSeconds: 2,
};

export class analyticsController {
  private telemetryService: TelemetryService;

  constructor() {
    this.telemetryService = new TelemetryService();

    console.log("Checking Telemetry: ", this.telemetryService);
  }

  getCombinedAnalyticsReport = async (
    req: Request,
    res: Response<ApiResponse>
  ): Promise<void> => {
    try {
      const { startDate, endDate, chartType = "daily" } = req.body;
      const { imei } = req.params;

      // Validate input
      if (!imei || !startDate || !endDate) {
        res.status(400).json({
          success: false,
          message: "Missing required fields",
          error: "BAD_REQUEST",
        });
        return;
      }

      // Fetch data from the RealTimeService
      const fuelConsumptionData =
        await this.telemetryService.getCombinedAnalyticsReport(
          imei,
          new Date(startDate),
          new Date(endDate),
          chartType,
          reportOptions
        );

      res.status(200).json({
        success: true,
        message: "Daily fuel consumption retrieved successfully",
        data: fuelConsumptionData,
      });
    } catch (error) {
      console.log("Error fetching daily fuel consumption:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get daily fuel consumption",
        error: "INTERNAL_ERROR",
      });
    }
  };

  getDailyFuelConsumption = async (
    req: Request,
    res: Response<ApiResponse>
  ): Promise<void> => {
    try {
      const { startDate, endDate } = req.body;
      const { imei } = req.params;

      // Validate input
      if (!imei || !startDate || !endDate) {
        res.status(400).json({
          success: false,
          message: "Missing required fields",
          error: "BAD_REQUEST",
        });
        return;
      }

      // Fetch data from the RealTimeService
      const fuelConsumptionData =
        await this.telemetryService.getDailyFuelConsumption(
          imei,
          new Date(startDate),
          new Date(endDate)
        );

      res.status(200).json({
        success: true,
        message: "Daily fuel consumption retrieved successfully",
        data: fuelConsumptionData,
      });
    } catch (error) {
      console.log("Error fetching daily fuel consumption:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get daily fuel consumption",
        error: "INTERNAL_ERROR",
      });
    }
  };

  getSpeedHistory = async (
    req: Request,
    res: Response<ApiResponse>
  ): Promise<void> => {
    try {
      const { startDate, endDate } = req.body;
      const { imei } = req.params;

      if (!imei || !startDate || !endDate) {
        res.status(400).json({
          success: false,
          message: "Missing required fields",
          error: "BAD_REQUEST",
        });
        return;
      }
      // Fetch speed reports from the TelemetryService
      const speedReports = await this.telemetryService.getDailySpeedReport(
        imei,
        new Date(startDate),
        new Date(endDate)
      );

      res.status(200).json({
        success: true,
        message: "Speed reports retrieved successfully",
        data: speedReports,
      });
    } catch (error) {
      console.log("Error fetching speed reports:", error);

      res.status(500).json({
        success: false,
        message: "Failed to get speed reports",
        error: "INTERNAL_ERROR",
      });
    }
  };

  getVehicleAnalytics = async (
    req: Request,
    res: Response<ApiResponse>
  ): Promise<void> => {
    try {
      const { imei } = req.params;
      const { startDate, endDate, chartType = "daily" } = req.body;

      // Basic validation
      if (!imei || !startDate || !endDate) {
        res.status(400).json({
          success: false,
          message: "Missing required fields: imei, startDate, endDate",
          error: "BAD_REQUEST",
        });
        return;
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      // Define thresholds for events based on UI text
      const reportOptions: ReportOptions = {
        speedLimitKph: 135, // "over 135km/h"
        rapidAccelKph: 7, // "over 7km/h"
        rapidAccelSeconds: 2, // "in 2 seconds"
        rapidDecelKph: 9, // "over 9km/h"
        rapidDecelSeconds: 2, // "in 2 seconds"
      };

      // Fetch both the summary and chart data in parallel
      const [summary, chartData] = await Promise.all([
        this.telemetryService.getAnalyticsSummary(
          imei,
          start,
          end,
          reportOptions
        ),
        this.telemetryService.getSpeedChartData(
          imei,
          start,
          end,
          chartType as ChartGroupingType
        ),
      ]);

      if (!summary) {
        res.status(404).json({
          success: false,
          message: "No telemetry data found for the specified period.",
          error: "NOT_FOUND",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Vehicle analytics retrieved successfully",
        data: {
          summary: summary,
          speedReport: chartData,
        },
      });
    } catch (error) {
      console.error("Error fetching vehicle analytics:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get vehicle analytics",
        error: "INTERNAL_ERROR",
      });
    }
  };
}

export const analyticsControllerInstance = new analyticsController();
export default analyticsControllerInstance;
