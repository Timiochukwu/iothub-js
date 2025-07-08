import { Request, Response } from "express";
import { CombinedAnalyticsService } from "../services/CombinedAnalyticsService";
import { ChartGroupingType, ReportOptions } from "../types";
import { CustomError } from "../middleware/errorHandler";

export class CombinedAnalyticsController {
  private combinedAnalyticsService: CombinedAnalyticsService;

  constructor() {
    this.combinedAnalyticsService = new CombinedAnalyticsService();
  }

  async getCombinedAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;
      const { 
        startDate, 
        endDate, 
        type = 'daily',
        speedLimit = 120,
        rapidAccelThreshold = 10,
        rapidAccelTime = 3,
        rapidDecelThreshold = 10,
        rapidDecelTime = 3
      } = req.query;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      if (!startDate || !endDate) {
        throw new CustomError("Start date and end date are required", 400);
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      const groupingType = type as ChartGroupingType;

      const options: ReportOptions = {
        speedLimitKph: parseInt(speedLimit as string),
        rapidAccelKph: parseInt(rapidAccelThreshold as string),
        rapidAccelSeconds: parseInt(rapidAccelTime as string),
        rapidDecelKph: parseInt(rapidDecelThreshold as string),
        rapidDecelSeconds: parseInt(rapidDecelTime as string)
      };

      const combinedData = await this.combinedAnalyticsService.getCombinedAnalyticsReport(
        imei,
        start,
        end,
        groupingType,
        options
      );

      res.status(200).json({
        success: true,
        data: combinedData,
        options: options,
        message: "Combined analytics retrieved successfully"
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

  async getVehicleOverview(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      const overview = await this.combinedAnalyticsService.getVehicleOverview(imei);

      res.status(200).json({
        success: true,
        data: overview,
        message: "Vehicle overview retrieved successfully"
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

  async getAnalyticsSummary(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;
      const { 
        startDate, 
        endDate,
        speedLimit = 120,
        rapidAccelThreshold = 10,
        rapidAccelTime = 3,
        rapidDecelThreshold = 10,
        rapidDecelTime = 3
      } = req.query;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      if (!startDate || !endDate) {
        throw new CustomError("Start date and end date are required", 400);
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      const options: ReportOptions = {
        speedLimitKph: parseInt(speedLimit as string),
        rapidAccelKph: parseInt(rapidAccelThreshold as string),
        rapidAccelSeconds: parseInt(rapidAccelTime as string),
        rapidDecelKph: parseInt(rapidDecelThreshold as string),
        rapidDecelSeconds: parseInt(rapidDecelTime as string)
      };

      const summary = await this.combinedAnalyticsService.getAnalyticsSummary(
        imei,
        start,
        end,
        options
      );

      if (!summary) {
        res.status(404).json({
          success: false,
          message: "No analytics data found for the specified period"
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: summary,
        options: options,
        message: "Analytics summary retrieved successfully"
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