import { Request, Response } from "express";
import { BatteryAnalyticsService } from "../services/BatteryAnalyticsService";
import { ChartGroupingType } from "../types";
import { CustomError } from "../middleware/errorHandler";

export class BatteryAnalyticsController {
  private batteryAnalyticsService: BatteryAnalyticsService;

  constructor() {
    this.batteryAnalyticsService = new BatteryAnalyticsService();
  }

  async getBatteryAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;
      const { startDate, endDate, type = "daily" } = req.query;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      if (!startDate || !endDate) {
        throw new CustomError("Start date and end date are required", 400);
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      const groupingType = type as ChartGroupingType;

      const batteryData =
        await this.batteryAnalyticsService.getBatteryAnalyticsReport(
          imei,
          start,
          end,
          groupingType
        );

      // Convert Map to Array for JSON response
      const batteryDataArray = Array.from(batteryData, ([date, data]) => ({
        date,
        ...data,
      }));

      res.status(200).json({
        success: true,
        data: batteryDataArray,
        message: "Battery analytics retrieved successfully",
      });
    } catch (error) {
      if (error instanceof CustomError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    }
  }

  async getCurrentBatteryStatus(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      const currentBattery =
        await this.batteryAnalyticsService.getCurrentBatteryStatus(imei);

      console.log(`Current Battery Status for IMEI ${imei}:`, currentBattery);

      if (!currentBattery) {
        res.status(404).json({
          success: false,
          message: "No battery data found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: currentBattery,
        message: "Current battery status retrieved successfully",
      });
    } catch (error) {
      // ... error handling
    }
  }

  async getBatteryHealth(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;
      const { days = 7 } = req.query;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      const daysCount = parseInt(days as string) || 7;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - daysCount);

      const batteryData =
        await this.batteryAnalyticsService.getBatteryAnalyticsReport(
          imei,
          startDate,
          endDate,
          "daily"
        );

      // Calculate battery health trends
      const batteryArray = Array.from(batteryData.values());

      if (batteryArray.length === 0) {
        res.status(404).json({
          success: false,
          message: "No battery data found for health analysis",
        });
        return;
      }

      // Calculate average voltages
      const avgStartingVoltage =
        batteryArray.reduce((sum, data) => sum + data.startingVoltage, 0) /
        batteryArray.length;
      const avgEndingVoltage =
        batteryArray.reduce((sum, data) => sum + data.endingVoltage, 0) /
        batteryArray.length;
      const avgMinVoltage =
        batteryArray.reduce((sum, data) => sum + data.minVoltage, 0) /
        batteryArray.length;
      const avgMaxVoltage =
        batteryArray.reduce((sum, data) => sum + data.maxVoltage, 0) /
        batteryArray.length;

      // Determine overall health
      let overallHealth = "Unknown";
      let healthScore = 0;

      if (avgMinVoltage >= 12.6) {
        overallHealth = "Excellent";
        healthScore = 95;
      } else if (avgMinVoltage >= 12.4) {
        overallHealth = "Good";
        healthScore = 80;
      } else if (avgMinVoltage >= 12.2) {
        overallHealth = "Fair";
        healthScore = 60;
      } else if (avgMinVoltage >= 12.0) {
        overallHealth = "Poor";
        healthScore = 40;
      } else {
        overallHealth = "Critical";
        healthScore = 20;
      }

      // Calculate voltage drop (indication of battery degradation)
      const voltageDrop = parseFloat(
        (avgStartingVoltage - avgEndingVoltage).toFixed(3)
      );

      const recommendations = this.generateBatteryRecommendations(
        overallHealth,
        voltageDrop,
        avgMinVoltage
      );

      res.status(200).json({
        success: true,
        data: {
          overallHealth,
          healthScore,
          averages: {
            startingVoltage: parseFloat(avgStartingVoltage.toFixed(2)),
            endingVoltage: parseFloat(avgEndingVoltage.toFixed(2)),
            minVoltage: parseFloat(avgMinVoltage.toFixed(2)),
            maxVoltage: parseFloat(avgMaxVoltage.toFixed(2)),
          },
          voltageDrop,
          recommendations,
          daysAnalyzed: batteryArray.length,
        },
        message: "Battery health analysis completed successfully",
      });
    } catch (error) {
      if (error instanceof CustomError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    }
  }

  private generateBatteryRecommendations(
    health: string,
    voltageDrop: number,
    minVoltage: number
  ): string[] {
    const recommendations = [];

    if (health === "Critical" || health === "Poor") {
      recommendations.push("Battery replacement recommended soon");
      recommendations.push("Avoid deep discharges to prevent further damage");
    }

    if (voltageDrop > 0.5) {
      recommendations.push(
        "High voltage drop detected - check charging system"
      );
    }

    if (minVoltage < 12.0) {
      recommendations.push(
        "Battery voltage critically low - immediate attention required"
      );
    }

    if (minVoltage < 12.4 && minVoltage >= 12.0) {
      recommendations.push("Consider charging battery or checking alternator");
    }

    if (health === "Excellent" || health === "Good") {
      recommendations.push(
        "Battery is in good condition - continue regular monitoring"
      );
    }

    return recommendations;
  }
}
