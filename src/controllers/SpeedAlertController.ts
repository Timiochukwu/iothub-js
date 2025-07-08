import { Request, Response } from "express";
import { SpeedAnalyticsService } from "../services/SpeedAlertService";
import { ChartGroupingType } from "../types/";
import { CustomError } from "../middleware/errorHandler";

export class SpeedAnalyticsController {
  private speedAnalyticsService: SpeedAnalyticsService;

  constructor() {
    this.speedAnalyticsService = new SpeedAnalyticsService();
  }

  async getSpeedAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;
      const { startDate, endDate, type = 'daily', speedLimit = 120 } = req.query;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      if (!startDate || !endDate) {
        throw new CustomError("Start date and end date are required", 400);
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      const groupingType = type as ChartGroupingType;
      const speedLimitKph = parseInt(speedLimit as string);

      const speedData = await this.speedAnalyticsService.getSpeedAnalytics(
        imei,
        start,
        end,
        groupingType,
        speedLimitKph
      );

      const speedDataArray = Array.from(speedData, ([date, data]) => ({
        date,
        ...data
      }));

      res.status(200).json({
        success: true,
        data: speedDataArray,
        message: "Speed analytics retrieved successfully"
      });
    } catch (error) {
      if (error instanceof CustomError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Internal server error"
        });
      }
    }
  }

  async getCurrentSpeedStatus(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      const currentStatus = await this.speedAnalyticsService.getCurrentSpeedStatus(imei);

      if (!currentStatus) {
        res.status(404).json({
          success: false,
          message: "No speed data found"
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: currentStatus,
        message: "Current speed status retrieved successfully"
      });
    } catch (error) {
      if (error instanceof CustomError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Internal server error"
        });
      }
    }
  }

  async getSpeedSummary(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;
      const { startDate, endDate } = req.query;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      if (!startDate || !endDate) {
        throw new CustomError("Start date and end date are required", 400);
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      const summary = await this.speedAnalyticsService.getSpeedSummary(
        imei,
        start,
        end
      );

      res.status(200).json({
        success: true,
        data: summary,
        message: "Speed summary retrieved successfully"
      });
    } catch (error) {
      if (error instanceof CustomError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Internal server error"
        });
      }
    }
  }
}