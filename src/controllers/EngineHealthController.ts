import { Request, Response } from "express";
import { EngineHealthService } from "../services/EngineHealthService";
import { ChartGroupingType } from "../types";
import { CustomError } from "../middleware/errorHandler";

export class EngineHealthController {
  private engineHealthService: EngineHealthService;

  constructor() {
    this.engineHealthService = new EngineHealthService();
  }

  async getEngineHealth(req: Request, res: Response): Promise<void> {
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

      const engineData = await this.engineHealthService.getEngineHealthData(
        imei,
        start,
        end,
        groupingType
      );

      // Convert Map to Array for JSON response - FIXED
      const engineDataArray = Array.from(engineData, ([dateKey, data]) => ({
        ...data
      }));

      res.status(200).json({
        success: true,
        data: engineDataArray,
        message: "Engine health data retrieved successfully"
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

  async getCurrentEngineStatus(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      const engineData = await this.engineHealthService.getEngineHealthData(
        imei,
        yesterday,
        today,
        'daily'
      );

      const currentData = Array.from(engineData.values())[0];

      if (!currentData) {
        res.status(404).json({
          success: false,
          message: "No engine data found"
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          ignitionStatus: currentData.ignitionStatus,
          engineStatus: currentData.engineStatus,
          avgRpm: currentData.avgRpm,
          temperature: currentData.temperature,
          oilLevel: currentData.oilLevel,
          speed: currentData.speed,
          activeFaults: currentData.activeFaults
        },
        message: "Current engine status retrieved successfully"
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

  async getActiveFaults(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;
      const { startDate, endDate } = req.query;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      let start: Date, end: Date;

      if (startDate && endDate) {
        start = new Date(startDate as string);
        end = new Date(endDate as string);
      } else {
        // Default to last 7 days
        end = new Date();
        start = new Date();
        start.setDate(end.getDate() - 7);
      }

      const faultData = await this.engineHealthService.getActiveDTCs(
        imei,
        start,
        end
      );

      res.status(200).json({
        success: true,
        data: faultData,
        message: `Found ${faultData.length} active fault(s)`
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

  async getEngineHealthSummary(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      // Get both engine health and active faults
      const [engineData, activeFaults] = await Promise.all([
        this.engineHealthService.getEngineHealthData(imei, yesterday, today, 'daily'),
        this.engineHealthService.getActiveDTCs(imei, yesterday, today)
      ]);

      const currentData = Array.from(engineData.values())[0];

      if (!currentData) {
        res.status(404).json({
          success: false,
          message: "No engine data found"
        });
        return;
      }

      // Calculate health score
      let healthScore = 100;
      const alerts: string[] = [];

      if (currentData.temperature > 105) {
        healthScore -= 25;
        alerts.push("High engine temperature detected");
      }

      if (currentData.activeFaults > 0) {
        healthScore -= (currentData.activeFaults * 20);
        alerts.push(`${currentData.activeFaults} active fault code(s)`);
      }

      if (currentData.oilLevel === "CHECK_REQUIRED") {
        healthScore -= 15;
        alerts.push("Oil level check required");
      }

      let status = "EXCELLENT";
      if (healthScore < 90) status = "GOOD";
      if (healthScore < 70) status = "FAIR";
      if (healthScore < 50) status = "POOR";
      if (healthScore < 30) status = "CRITICAL";

      res.status(200).json({
        success: true,
        data: {
          ...currentData,
          healthScore: Math.max(0, healthScore),
          status,
          alerts,
          activeFaultDetails: activeFaults
        },
        message: "Engine health summary retrieved successfully"
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