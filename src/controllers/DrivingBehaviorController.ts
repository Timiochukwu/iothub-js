import { Request, Response } from "express";
import { DrivingBehaviorService } from "../services/DrivingBehaviorService";
import { ChartGroupingType, ReportOptions } from "../types";
import { CustomError } from "../middleware/errorHandler";

export class DrivingBehaviorController {
  private drivingBehaviorService: DrivingBehaviorService;

  constructor() {
    this.drivingBehaviorService = new DrivingBehaviorService();
  }

  async getDrivingBehaviorReport(req: Request, res: Response): Promise<void> {
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

      const drivingData = await this.drivingBehaviorService.getDrivingBehaviorReport(
        imei,
        start,
        end,
        groupingType,
        options
      );

      // Convert Map to Array for JSON response
      const drivingDataArray = Array.from(drivingData, ([date, data]) => ({
        date,
        ...data
      }));

      res.status(200).json({
        success: true,
        data: drivingDataArray,
        options: options,
        message: "Driving behavior report retrieved successfully"
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

      const analyticsSummary = await this.drivingBehaviorService.getAnalyticsSummary(
        imei,
        start,
        end,
        options
      );

      if (!analyticsSummary) {
        res.status(404).json({
          success: false,
          message: "No driving data found for the specified period"
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: analyticsSummary,
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

  async getSpeedChartData(req: Request, res: Response): Promise<void> {
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

      const speedChartData = await this.drivingBehaviorService.getSpeedChartData(
        imei,
        start,
        end,
        groupingType
      );

      res.status(200).json({
        success: true,
        data: speedChartData,
        message: "Speed chart data retrieved successfully"
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

  async getDrivingScore(req: Request, res: Response): Promise<void> {
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

      const options: ReportOptions = {
        speedLimitKph: 120,
        rapidAccelKph: 10,
        rapidAccelSeconds: 3,
        rapidDecelKph: 10,
        rapidDecelSeconds: 3
      };

      const analyticsSummary = await this.drivingBehaviorService.getAnalyticsSummary(
        imei,
        start,
        end,
        options
      );

      if (!analyticsSummary) {
        res.status(404).json({
          success: false,
          message: "No driving data found for the specified period"
        });
        return;
      }

      // Calculate driving score based on behavior
      let score = 100;
      const penalties = [];

      // Speeding penalty
      if (analyticsSummary.speedingCount > 0) {
        const speedingPenalty = Math.min(analyticsSummary.speedingCount * 2, 30);
        score -= speedingPenalty;
        penalties.push(`Speeding incidents: -${speedingPenalty} points`);
      }

      // Rapid acceleration penalty
      if (analyticsSummary.rapidAccelCount > 0) {
        const accelPenalty = Math.min(analyticsSummary.rapidAccelCount * 1.5, 20);
        score -= accelPenalty;
        penalties.push(`Rapid acceleration: -${accelPenalty} points`);
      }

      // Rapid deceleration penalty
      if (analyticsSummary.rapidDecelCount > 0) {
        const decelPenalty = Math.min(analyticsSummary.rapidDecelCount * 1.5, 20);
        score -= decelPenalty;
        penalties.push(`Rapid deceleration: -${decelPenalty} points`);
      }

      score = Math.max(0, Math.round(score));

      let grade = "A+";
      let feedback = "Excellent driving!";
      
      if (score < 95) { grade = "A"; feedback = "Very good driving"; }
      if (score < 85) { grade = "B"; feedback = "Good driving with minor issues"; }
      if (score < 75) { grade = "C"; feedback = "Average driving, room for improvement"; }
      if (score < 65) { grade = "D"; feedback = "Poor driving, significant improvement needed"; }
      if (score < 50) { grade = "F"; feedback = "Dangerous driving patterns detected"; }

      res.status(200).json({
        success: true,
        data: {
          score,
          grade,
          feedback,
          penalties,
          analytics: analyticsSummary,
          recommendations: this.generateRecommendations(analyticsSummary)
        },
        message: "Driving score calculated successfully"
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

  private generateRecommendations(analytics: any): string[] {
    const recommendations = [];

    if (analytics.speedingCount > 5) {
      recommendations.push("Reduce speeding incidents by maintaining awareness of speed limits");
    }

    if (analytics.rapidAccelCount > 3) {
      recommendations.push("Practice smoother acceleration to improve fuel efficiency and safety");
    }

    if (analytics.rapidDecelCount > 3) {
      recommendations.push("Allow more following distance to avoid sudden braking");
    }

    if (analytics.averageMovingSpeedKph > 80) {
      recommendations.push("Consider reducing average driving speed for better safety");
    }

    if (recommendations.length === 0) {
      recommendations.push("Keep up the excellent driving habits!");
    }

    return recommendations;
  }

  async getCurrentDrivingStatus(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;
  
      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }
  
      const currentStatus = await this.drivingBehaviorService.getCurrentDrivingStatus(imei);
  
      if (!currentStatus) {
        res.status(404).json({
          success: false,
          message: "No driving data found"
        });
        return;
      }
  
      res.status(200).json({
        success: true,
        data: {
          ...currentStatus,
          status: currentStatus.isMoving ? "DRIVING" : "PARKED",
          lastUpdate: new Date(currentStatus.timestamp).toISOString()
        },
        message: "Current driving status retrieved successfully"
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