import { Request, Response } from "express";
import { FuelAnalyticsService } from "../services/FuelAnalyticsService";
import { ChartGroupingType } from "../types";
import { CustomError } from "../middleware/errorHandler";

export class FuelAnalyticsController {
  private fuelAnalyticsService: FuelAnalyticsService;

  constructor() {
    this.fuelAnalyticsService = new FuelAnalyticsService();
  }

  /**
   * Endpoint A: Get fuel consumption chart data (Refueled vs Consumed)
   * Matches your dashboard chart exactly
   * 
   * GET /api/fuel/:imei/consumption-chart?startDate=2025-08-01&endDate=2025-08-31&type=daily
   */
  async getFuelConsumptionChart(req: Request, res: Response): Promise<void> {
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

      // Validate dates
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new CustomError("Invalid date format. Use YYYY-MM-DD", 400);
      }

      if (start > end) {
        throw new CustomError("Start date cannot be after end date", 400);
      }

      const chartData = await this.fuelAnalyticsService.getFuelConsumptionChart(
        imei,
        start,
        end,
        groupingType
      );

      res.status(200).json({
        success: true,
        data: chartData,
        message: "Fuel consumption chart data retrieved successfully",
        metadata: {
          imei,
          startDate: start.toISOString().split('T')[0],
          endDate: end.toISOString().split('T')[0],
          groupingType,
          totalDataPoints: chartData.length,
        }
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Endpoint B: Get current fuel summary (Starting fuel, ending fuel, distance, estimated used, fuel level)
   * Matches your dashboard summary section
   * 
   * GET /api/fuel/:imei/current-summary
   */
  async getCurrentFuelSummary(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;
  
      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }
  
      const fuelSummary = await this.fuelAnalyticsService.getCurrentFuelSummary(imei);
  
      if (!fuelSummary) {
        res.status(404).json({
          success: false,
          message: "No fuel data found for this vehicle",
          data: null
        });
        return;
      }
  
      // Build the response data object
      const responseData: any = {
        // Vehicle Info
        vehicleInfo: {
          vehicleId: fuelSummary.vehicleId,
          imei: imei,
          status: fuelSummary.status,
          lastUpdated: new Date(fuelSummary.timestamp).toISOString(),
        },
        
        // Daily Fuel Usage
        dailyUsage: {
          startingFuel: `${fuelSummary.startingFuel}%`,
          endingFuel: `${fuelSummary.endingFuel}%`,
          distanceDriven: `${fuelSummary.distanceDriven}km`,
          estimatedUsed: `${fuelSummary.estimatedUsed}%`,
          actualConsumption: `${fuelSummary.actualConsumption}%`,
        },
        
        // Current Status
        currentStatus: {
          fuelLevel: `${fuelSummary.currentFuelLevel}%`,
          fuelLevelStatus: fuelSummary.fuelLevelStatus,
          totalOdometer: `${fuelSummary.totalOdometer}km`,
          fuelType: fuelSummary.fuelType,
          fuelEfficiency: fuelSummary.fuelEfficiency > 0 ? `${fuelSummary.fuelEfficiency} km/L` : 'N/A',
          dataQuality: fuelSummary.dataQuality,
        },
        
        // Raw data for further processing
        raw: {
          startingFuel: fuelSummary.startingFuel,
          endingFuel: fuelSummary.endingFuel,
          distanceDriven: fuelSummary.distanceDriven,
          estimatedUsed: fuelSummary.estimatedUsed,
          actualConsumption: fuelSummary.actualConsumption,
          fuelEfficiency: fuelSummary.fuelEfficiency,
          currentFuelLevel: fuelSummary.currentFuelLevel,
          totalOdometer: fuelSummary.totalOdometer,
          timestamp: fuelSummary.timestamp,
          dataQuality: fuelSummary.dataQuality,
        }
      };
  
      // Add lastRefuel data if it exists (THIS WAS MISSING!)
      if (fuelSummary.lastRefuel) {
        responseData.lastRefuel = {
          percentage: `${fuelSummary.lastRefuel.percentage}%`,
          date: fuelSummary.lastRefuel.date,
          time: fuelSummary.lastRefuel.time,
          timestamp: fuelSummary.lastRefuel.timestamp,
          description: `Refueled ${fuelSummary.lastRefuel.percentage}% on ${fuelSummary.lastRefuel.date} at ${fuelSummary.lastRefuel.time}`
        };
        
        // Also add to raw data
        responseData.raw.lastRefuel = fuelSummary.lastRefuel;
      }
  
      // Add debug info in development mode
      if (fuelSummary.debug && process.env.NODE_ENV === 'development') {
        responseData.debug = fuelSummary.debug;
      }
  
      res.status(200).json({
        success: true,
        data: responseData,
        message: "Current fuel summary retrieved successfully"
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Legacy endpoint for backward compatibility
   * GET /api/fuel/:imei/analytics (deprecated - use consumption-chart instead)
   */
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

      const chartData = await this.fuelAnalyticsService.getFuelConsumptionChart(
        imei,
        start,
        end,
        groupingType
      );

      res.status(200).json({
        success: true,
        data: chartData,
        message: "Fuel analytics retrieved successfully (deprecated - use /consumption-chart)",
        deprecated: true,
        newEndpoint: `/api/fuel/${imei}/consumption-chart`
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Legacy endpoint for backward compatibility
   * GET /api/fuel/:imei/current-level (deprecated - use current-summary instead)
   */
  async getCurrentFuelLevel(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      const fuelSummary = await this.fuelAnalyticsService.getCurrentFuelSummary(imei);

      if (!fuelSummary) {
        res.status(404).json({
          success: false,
          message: "No fuel data found",
        });
        return;
      }

      // Return legacy format
      res.status(200).json({
        success: true,
        data: {
          timestamp: fuelSummary.timestamp,
          currentFuelLevel: fuelSummary.currentFuelLevel,
          fuelLevelUnit: "%",
          fuelLevelStatus: fuelSummary.fuelLevelStatus,
          totalOdometer: fuelSummary.totalOdometer,
          totalOdometerUnit: "km",
          fuelType: fuelSummary.fuelType,
          estimatedRange: (fuelSummary.currentFuelLevel / 100) * 500, // Basic estimation
          estimatedRangeUnit: "km",
        },
        message: "Current fuel level retrieved successfully (deprecated - use /current-summary)",
        deprecated: true,
        newEndpoint: `/api/fuel/${imei}/current-summary`
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Get fuel events for debugging purposes
   * GET /api/fuel/:imei/events?startDate=2025-08-01&endDate=2025-08-31
   */
  async getFuelEvents(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;
      const { startDate, endDate, includeRaw = false } = req.query;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      if (!startDate || !endDate) {
        throw new CustomError("Start date and end date are required", 400);
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      const chartData = await this.fuelAnalyticsService.getFuelConsumptionChart(
        imei,
        start,
        end,
        "daily"
      );

      // Calculate totals
      const totals = chartData.reduce(
        (acc, day) => ({
          totalRefueled: acc.totalRefueled + day.refueled,
          totalConsumed: acc.totalConsumed + day.consumed,
        }),
        { totalRefueled: 0, totalConsumed: 0 }
      );

      res.status(200).json({
        success: true,
        data: {
          events: chartData,
          summary: {
            totalDays: chartData.length,
            totalRefueled: parseFloat(totals.totalRefueled.toFixed(2)),
            totalConsumed: parseFloat(totals.totalConsumed.toFixed(2)),
            netFuelChange: parseFloat((totals.totalRefueled - totals.totalConsumed).toFixed(2)),
          }
        },
        message: "Fuel events retrieved successfully"
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Error handler
   */
  private handleError(error: any, res: Response): void {
    if (error instanceof CustomError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    } else {
      console.error("Fuel Analytics Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        ...(process.env.NODE_ENV === 'development' && { error: error.message })
      });
    }
  }
}