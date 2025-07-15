import { Request, Response } from "express";
import { FuelAnalyticsService } from "../services/FuelAnalyticsService";
import { ChartGroupingType } from "../types";
import { CustomError } from "../middleware/errorHandler";

export class FuelAnalyticsController {
  private fuelAnalyticsService: FuelAnalyticsService;

  constructor() {
    this.fuelAnalyticsService = new FuelAnalyticsService();
  }

  async getFuelAnalytics(req: Request, res: Response): Promise<void> {
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

      const fuelData = await this.fuelAnalyticsService.getFuelAnalyticsReport(
        imei,
        start,
        end,
        groupingType
      );

      // Convert Map to Array for JSON response
      const fuelDataArray = Array.from(fuelData, ([date, data]) => ({
        date,
        ...data,
      }));

      res.status(200).json({
        success: true,
        data: fuelDataArray,
        message: "Fuel analytics retrieved successfully",
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

  // async getDailyFuelBarChart(req: Request, res: Response): Promise<void> {
  //   try {
  //     const { imei } = req.params;
  //     const { startDate, endDate, type = "daily" } = req.query;

  //     if (!imei) {
  //       throw new CustomError("IMEI is required", 400);
  //     }

  //     if (!startDate || !endDate) {
  //       throw new CustomError("Start date and end date are required", 400);
  //     }

  //     const start = new Date(startDate as string);
  //     const end = new Date(endDate as string);
  //     const groupingType = type as ChartGroupingType;

  //     const chartData =
  //       await this.fuelAnalyticsService.getDailyFuelBarChartData(
  //         imei,
  //         start,
  //         end,
  //         groupingType
  //       );

  //     // Convert Map to Array for JSON response
  //     const chartDataArray = Array.from(chartData, ([date, data]) => ({
  //       ...data,
  //     }));

  //     res.status(200).json({
  //       success: true,
  //       data: chartDataArray,
  //       message: "Daily fuel bar chart data retrieved successfully",
  //     });
  //   } catch (error) {
  //     if (error instanceof CustomError) {
  //       res.status(error.statusCode).json({
  //         success: false,
  //         message: error.message,
  //       });
  //     } else {
  //       res.status(500).json({
  //         success: false,
  //         message: "Internal server error",
  //       });
  //     }
  //   }
  // }

  async getCurrentFuelLevel(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      const fuelData =
        await this.fuelAnalyticsService.getCurrentFuelStatus(imei);

      if (!fuelData) {
        res.status(404).json({
          success: false,
          message: "No fuel data found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: fuelData,
        message: "Current fuel level retrieved successfully",
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
}
