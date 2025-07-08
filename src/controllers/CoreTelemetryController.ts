import { Request, Response } from "express";
import { CoreTelemetryService } from "../services/CoreTelemetryService";
import { CustomError } from "../middleware/errorHandler";

export class CoreTelemetryController {
  private coreTelemetryService: CoreTelemetryService;

  constructor() {
    this.coreTelemetryService = new CoreTelemetryService();
  }

  async ingestTelemetry(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.coreTelemetryService.ingestTelemetry(req.body);
      res.status(200).json(result);
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

  async getAllTelemetry(req: Request, res: Response): Promise<void> {
    try {
      const telemetries = await this.coreTelemetryService.getAllTelemetry();
      res.status(200).json({
        success: true,
        data: telemetries,
        message: "All telemetry data retrieved successfully"
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

  async getLatestTelemetry(req: Request, res: Response): Promise<void> {
    try {
      const latest = await this.coreTelemetryService.getLatestTelemetry();
      
      if (!latest) {
        res.status(404).json({
          success: false,
          message: "No telemetry data found"
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: latest,
        message: "Latest telemetry retrieved successfully"
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

  async getDeviceLatestTelemetry(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      const latest = await this.coreTelemetryService.getDeviceLatestTelemetry(imei);
      
      if (!latest) {
        res.status(404).json({
          success: false,
          message: "No telemetry data found for this device"
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: latest,
        message: "Device telemetry retrieved successfully"
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

  async getCarState(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      const carState = await this.coreTelemetryService.getCarState(imei);
      
      res.status(200).json({
        success: true,
        data: carState,
        message: "Car state retrieved successfully"
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

  async getLocationHistory(req: Request, res: Response): Promise<void> {
    try {
      const { imei } = req.params;
      const { limit = 100 } = req.query;

      if (!imei) {
        throw new CustomError("IMEI is required", 400);
      }

      const locationHistory = await this.coreTelemetryService.getLocationHistory(
        imei, 
        parseInt(limit as string)
      );
      
      res.status(200).json({
        success: true,
        data: locationHistory,
        message: "Location history retrieved successfully"
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

  // Individual data point getters
  async getLatestTirePressure(req: Request, res: Response): Promise<void> {
    try {
      const data = await this.coreTelemetryService.getLatestTirePressure();
      res.status(200).json({
        success: true,
        data,
        message: "Latest tire pressure retrieved successfully"
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async getLatestPosition(req: Request, res: Response): Promise<void> {
    try {
      const data = await this.coreTelemetryService.getLatestPosition();
      res.status(200).json({
        success: true,
        data,
        message: "Latest position retrieved successfully"
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async getSpeedInfo(req: Request, res: Response): Promise<void> {
    try {
      const data = await this.coreTelemetryService.getSpeedInfo();
      res.status(200).json({
        success: true,
        data,
        message: "Speed info retrieved successfully"
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async getLatestBattery(req: Request, res: Response): Promise<void> {
    try {
      const data = await this.coreTelemetryService.getLatestBattery();
      res.status(200).json({
        success: true,
        data,
        message: "Latest battery retrieved successfully"
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async getLatestFuelLevel(req: Request, res: Response): Promise<void> {
    try {
      const data = await this.coreTelemetryService.getLatestFuelLevel();
      res.status(200).json({
        success: true,
        data,
        message: "Latest fuel level retrieved successfully"
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async getVehicleHealthStatus(req: Request, res: Response): Promise<void> {
    try {
      const data = await this.coreTelemetryService.getVehicleHealthStatus();
      res.status(200).json({
        success: true,
        data,
        message: "Vehicle health status retrieved successfully"
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  private handleError(error: any, res: Response): void {
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