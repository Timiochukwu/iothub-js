import { Request, Response } from "express";
import { RealTimeService } from "../services/RealTimeService";
import { ApiResponse } from "../types";

import { CustomError } from "../middleware/errorHandler";
import { JwtUtils } from "../utils/jwt";
import { mapTelemetry } from "../utils/mapTelemetry";
import { TelemetryDTO } from "../types/TelemetryDTO";

import { TelemetryService } from "../services/TelemetryService";

export class analyticsController {
  private telemetryService: TelemetryService;

  constructor() {
    this.telemetryService = new TelemetryService();
  }
  async getDailyFuelConsumption(
    req: Request,
    res: Response<ApiResponse>
  ): Promise<void> {
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
          startDate,
          endDate
        );

      res.status(200).json({
        success: true,
        message: "Daily fuel consumption retrieved successfully",
        data: fuelConsumptionData,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to get daily fuel consumption",
        error: "INTERNAL_ERROR",
      });
    }
  }

  async getSpeedHistory(
    req: Request,
    res: Response<ApiResponse>
  ): Promise<void> {
    try {
      const { imei } = req.params;

      const { startDate, endDate } = req.body;

      // Validate input
      if (!imei) {
        res.status(400).json({
          success: false,
          message: "Missing required fields",
          error: "BAD_REQUEST",
        });
        return;
      }

      // Fetch speed reports from the RealTimeService
      console.log("Checking Telemetry: ", this.telemetryService);

      const speedReports = await this.telemetryService.getSpeedHistory(
        imei,
        startDate,
        endDate
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
  }
}

export const analyticsControllerInstance = new analyticsController();
export default analyticsControllerInstance;
