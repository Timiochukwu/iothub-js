import { Request, Response } from "express";
import { TirePressureService } from "../services/TirePressureService";
import { ChartGroupingType } from "../types";
import { CustomError } from "../middleware/errorHandler";

export class TirePressureController {
  private tirePressureService: TirePressureService;

  constructor() {
    this.tirePressureService = new TirePressureService();
  }

  async getDailyTirePressureData(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;
      const { startDate, endDate, type = 'daily' } = req.query;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      if (!startDate || !endDate) {
        throw new CustomError("Start date and end date are required", 400);
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      const groupingType = type as ChartGroupingType;

      const tirePressureData = await this.tirePressureService.getDailyTirePressureData(
        imei,
        start,
        end,
        groupingType
      );

      // Convert Map to Array for JSON response
      const tirePressureArray = Array.from(tirePressureData, ([date, data]) => ({
        ...data
      }));

      res.status(200).json({
        success: true,
        data: tirePressureArray,
        message: "Tire pressure data retrieved successfully"
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

  async getCurrentTirePressure(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      const currentPressure = await this.tirePressureService.getCurrentTirePressure(imei);

      if (!currentPressure) {
        res.status(404).json({
          success: false,
          message: "No tire pressure data found"
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: currentPressure,
        message: "Current tire pressure retrieved successfully"
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

  async getTirePressureHistory(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;
      const { hours = 24 } = req.query;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      const historyHours = parseInt(hours as string) || 24;

      if (historyHours > 168) { // Max 7 days
        throw new CustomError("Maximum history period is 168 hours (7 days)", 400);
      }

      const pressureHistory = await this.tirePressureService.getTirePressureHistory(
        imei,
        historyHours
      );

      res.status(200).json({
        success: true,
        data: pressureHistory,
        message: `Tire pressure history for last ${historyHours} hours retrieved successfully`
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

  async getTirePressureAlert(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      const currentPressure = await this.tirePressureService.getCurrentTirePressure(imei);

      if (!currentPressure) {
        res.status(404).json({
          success: false,
          message: "No tire pressure data found"
        });
        return;
      }

      // Generate alert based on pressure status
      let alertLevel = "info";
      let alertMessage = "Tire pressure is normal";

      switch (currentPressure.status) {
        case "LOW":
          alertLevel = "error";
          alertMessage = `Critical: Tire pressure is dangerously low at ${currentPressure.pressure} PSI`;
          break;
        case "WARNING":
          alertLevel = "warning";
          alertMessage = `Warning: Tire pressure is low at ${currentPressure.pressure} PSI`;
          break;
        case "NO_DATA":
          alertLevel = "warning";
          alertMessage = "No tire pressure data available";
          break;
        default:
          alertMessage = `Tire pressure is normal at ${currentPressure.pressure} PSI`;
      }

      res.status(200).json({
        success: true,
        data: {
          ...currentPressure,
          alertLevel,
          alertMessage,
          recommendedAction: this.getRecommendedAction(currentPressure.status)
        },
        message: "Tire pressure alert generated successfully"
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

  private getRecommendedAction(status: string): string {
    switch (status) {
      case "LOW":
        return "Stop driving immediately and check tire pressure";
      case "WARNING":
        return "Check tire pressure as soon as possible";
      case "NO_DATA":
        return "Check tire pressure sensor connection";
      default:
        return "Continue normal driving";
    }
  }
}