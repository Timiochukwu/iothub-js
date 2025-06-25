import { Request, Response } from 'express';
import { TelemetryService } from '../services/TelemetryService';
import { validateRequest, validateQuery } from '../middleware/validation';
import { telemetrySchemas } from '../utils/validationSchemas';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import { CustomError } from '../middleware/errorHandler';

export class TelemetryController {
  private telemetryService: TelemetryService;

  constructor() {
    this.telemetryService = new TelemetryService();
  }

  // POST /api/telemetry/ingest - Ingest telemetry data from IoT devices
  ingest = async (req: Request, res: Response<ApiResponse>): Promise<void> => {
    try {
      const result = await this.telemetryService.ingestTelemetry(req.body);
      res.status(200).json(result);
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/telemetry/all - Get all telemetry records
  getAllTelemetry = async (req: Request, res: Response): Promise<void> => {
    try {
      const telemetries = await this.telemetryService.getAllTelemetry();
      res.status(200).json({
        success: true,
        data: telemetries
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/telemetry/latest - Get latest telemetry record
  getLatestTelemetry = async (req: Request, res: Response): Promise<void> => {
    try {
      const telemetry = await this.telemetryService.getLatestTelemetry();
      if (!telemetry) {
        res.status(204).send();
        return;
      }
      res.status(200).json({
        success: true,
        data: telemetry
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/telemetry/user?email=user@example.com - Get telemetry for specific user
  getUserTelemetry = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.query;
      if (!email || typeof email !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Email parameter is required',
          error: 'MISSING_EMAIL'
        });
        return;
      }

      const telemetries = await this.telemetryService.getTelemetryForUser(email);
      res.status(200).json({
        success: true,
        data: telemetries
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/telemetry/tire-pressure - Get latest tire pressure
  getTirePressure = async (req: Request, res: Response): Promise<void> => {
    try {
      const tirePressure = await this.telemetryService.getLatestTirePressure();
      if (!tirePressure) {
        res.status(204).send();
        return;
      }
      res.status(200).json({
        success: true,
        responseBody: tirePressure
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/telemetry/position - Get latest position
  getPosition = async (req: Request, res: Response): Promise<void> => {
    try {
      const position = await this.telemetryService.getLatestPosition();
      if (!position) {
        res.status(204).send();
        return;
      }
      res.status(200).json({
        success: true,
        status: 200,
        responseBody: position
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/telemetry/speed-info - Get speed information
  getSpeedInfo = async (req: Request, res: Response): Promise<void> => {
    try {
      const speedInfo = await this.telemetryService.getSpeedInfo();
      if (!speedInfo) {
        res.status(204).send();
        return;
      }
      res.status(200).json({
        success: true,
        status: 200,
        responseBody: speedInfo
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/telemetry/battery-voltage - Get battery voltage
  getBattery = async (req: Request, res: Response): Promise<void> => {
    try {
      const battery = await this.telemetryService.getLatestBattery();
      if (!battery) {
        res.status(204).send();
        return;
      }
      res.status(200).json({
        success: true,
        status: 200,
        responseBody: battery
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/telemetry/fuel - Get fuel level
  getFuelLevel = async (req: Request, res: Response): Promise<void> => {
    try {
      const fuelLevel = await this.telemetryService.getLatestFuelLevel();
      if (!fuelLevel) {
        res.status(204).send();
        return;
      }
      res.status(200).json({
        success: true,
        status: 200,
        responseBody: fuelLevel
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/telemetry/engine-rpm - Get engine RPM
  getEngineRpm = async (req: Request, res: Response): Promise<void> => {
    try {
      const engineRpm = await this.telemetryService.getLatestEngineRpm();
      if (!engineRpm) {
        res.status(204).send();
        return;
      }
      res.status(200).json({
        success: true,
        status: 200,
        responseBody: engineRpm
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/telemetry/engine-oil-temp - Get engine oil temperature
  getEngineOilTemp = async (req: Request, res: Response): Promise<void> => {
    try {
      const engineOilTemp = await this.telemetryService.getLatestEngineOilTemp();
      if (!engineOilTemp) {
        res.status(204).send();
        return;
      }
      res.status(200).json({
        success: true,
        status: 200,
        responseBody: engineOilTemp
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/telemetry/crash - Get crash detection
  getCrashDetection = async (req: Request, res: Response): Promise<void> => {
    try {
      const crashDetection = await this.telemetryService.getLatestCrashDetection();
      if (!crashDetection) {
        res.status(204).send();
        return;
      }
      res.status(200).json({
        success: true,
        status: 200,
        responseBody: crashDetection
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/telemetry/engine-load - Get engine load
  getEngineLoad = async (req: Request, res: Response): Promise<void> => {
    try {
      const engineLoad = await this.telemetryService.getLatestEngineLoad();
      if (!engineLoad) {
        res.status(204).send();
        return;
      }
      res.status(200).json({
        success: true,
        status: 200,
        responseBody: engineLoad
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/telemetry/dtc - Get diagnostic trouble codes
  getDtc = async (req: Request, res: Response): Promise<void> => {
    try {
      const dtc = await this.telemetryService.getLatestDtc();
      if (!dtc) {
        res.status(204).send();
        return;
      }
      res.status(200).json({
        success: true,
        status: 200,
        responseBody: dtc
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/telemetry/power-stats - Get power statistics
  getPowerStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const powerStats = await this.telemetryService.getPowerStats();
      if (!powerStats) {
        res.status(204).send();
        return;
      }
      res.status(200).json({
        success: true,
        status: 200,
        responseBody: powerStats
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/telemetry/mileage - Get total mileage
  getTotalMileage = async (req: Request, res: Response): Promise<void> => {
    try {
      const mileage = await this.telemetryService.getLatestTotalMileage();
      if (!mileage) {
        res.status(204).send();
        return;
      }
      res.status(200).json({
        success: true,
        status: 200,
        responseBody: mileage
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/telemetry/vehicle-health - Get vehicle health status
  getVehicleHealthStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const health = await this.telemetryService.getVehicleHealthStatus();
      if (!health) {
        res.status(404).json({
          success: false,
          message: 'No telemetry data available'
        });
        return;
      }
      res.status(200).json({
        success: true,
        status: 200,
        health
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };
}
