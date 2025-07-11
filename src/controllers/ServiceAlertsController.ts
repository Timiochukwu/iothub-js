import { Request, Response } from "express";
import { ServiceAlertsService } from "../services/ServiceAlertsService";
import { handleSuccess, handleError } from "../utils/responseHandler";
import { Telemetry } from "../models/Telemetry";


export class ServiceAlertsController {
  private serviceAlertsService: ServiceAlertsService;

  constructor() {
    this.serviceAlertsService = new ServiceAlertsService();
  }

  /**
   * GET /api/service-alerts/summary/:imei
   * Get service alerts summary (total faults, critical, warning counts)
   */
  getServiceAlertsSummary = async (req: Request, res: Response): Promise<void> => {
    try {
      const { imei } = req.params;

      if (!imei) {
        handleError(res, "IMEI is required", 400);
        return;
      }

      const summary = await this.serviceAlertsService.getServiceAlertsSummary(imei);

      handleSuccess(res, {
        summary,
        message: "Service alerts summary retrieved successfully"
      });
    } catch (error) {
      console.error("Error getting service alerts summary:", error);
      handleError(res, "Failed to retrieve service alerts summary", 500);
    }
  };

  /**
   * GET /api/service-alerts/recent/:imei
   * Get recent alerts with optional type filter
   * Query params: type (All, DTC, Battery, Fuel, Engine, Tire, Safety), limit
   */
  getRecentAlerts = async (req: Request, res: Response): Promise<void> => {
    try {
      const { imei } = req.params;
      const { type, limit } = req.query;

      if (!imei) {
        handleError(res, "IMEI is required", 400);
        return;
      }

      const alertType = type as string;
      const alertLimit = limit ? parseInt(limit as string) : 20;

      const alerts = await this.serviceAlertsService.getRecentAlerts(
        imei,
        alertType,
        alertLimit
      );

      handleSuccess(res, {
        alerts,
        count: alerts.length,
        type: alertType || "All",
        message: "Recent alerts retrieved successfully"
      });
    } catch (error) {
      console.error("Error getting recent alerts:", error);
      handleError(res, "Failed to retrieve recent alerts", 500);
    }
  };

  /**
   * GET /api/service-alerts/by-type/:imei/:type
   * Get alerts by specific type
   */
  getAlertsByType = async (req: Request, res: Response): Promise<void> => {
    try {
      const { imei, type } = req.params;

      if (!imei || !type) {
        handleError(res, "IMEI and type are required", 400);
        return;
      }

      const alerts = await this.serviceAlertsService.getAlertsByType(imei, type);

      handleSuccess(res, {
        alerts,
        count: alerts.length,
        type,
        message: `${type} alerts retrieved successfully`
      });
    } catch (error) {
      console.error("Error getting alerts by type:", error);
      handleError(res, "Failed to retrieve alerts by type", 500);
    }
  };

  /**
   * GET /api/service-alerts/detail/:imei/:alertId
   * Get specific alert details
   */
  getAlertDetails = async (req: Request, res: Response): Promise<void> => {
    try {
      const { imei, alertId } = req.params;

      if (!imei || !alertId) {
        handleError(res, "IMEI and alertId are required", 400);
        return;
      }

      const alert = await this.serviceAlertsService.getAlertDetails(imei, alertId);

      if (!alert) {
        handleError(res, "Alert not found", 404);
        return;
      }

      handleSuccess(res, {
        alert,
        message: "Alert details retrieved successfully"
      });
    } catch (error) {
      console.error("Error getting alert details:", error);
      handleError(res, "Failed to retrieve alert details", 500);
    }
  };

  /**
   * GET /api/service-alerts/statistics/:imei
   * Get alert statistics for dashboard
   */
  getAlertStatistics = async (req: Request, res: Response): Promise<void> => {
    try {
      const { imei } = req.params;
      const { days } = req.query;

      if (!imei) {
        handleError(res, "IMEI is required", 400);
        return;
      }

      const statisticsDays = days ? parseInt(days as string) : 7;
      const statistics = await this.serviceAlertsService.getAlertStatistics(
        imei,
        statisticsDays
      );

      handleSuccess(res, {
        statistics,
        period: `${statisticsDays} days`,
        message: "Alert statistics retrieved successfully"
      });
    } catch (error) {
      console.error("Error getting alert statistics:", error);
      handleError(res, "Failed to retrieve alert statistics", 500);
    }
  };

  /**
   * GET /api/service-alerts/dashboard/:imei
   * Get combined dashboard data (summary + recent alerts)
   */
  getDashboardData = async (req: Request, res: Response): Promise<void> => {
    try {
      const { imei } = req.params;

      if (!imei) {
        handleError(res, "IMEI is required", 400);
        return;
      }

      const [summary, recentAlerts, statistics] = await Promise.all([
        this.serviceAlertsService.getServiceAlertsSummary(imei),
        this.serviceAlertsService.getRecentAlerts(imei, undefined, 10),
        this.serviceAlertsService.getAlertStatistics(imei, 7)
      ]);

      handleSuccess(res, {
        summary,
        recentAlerts,
        statistics,
        message: "Dashboard data retrieved successfully"
      });
    } catch (error) {
      console.error("Error getting dashboard data:", error);
      handleError(res, "Failed to retrieve dashboard data", 500);
    }
  };

  debugTelemetryData = async (req: Request, res: Response): Promise<void> => {
    try {
      const { imei } = req.params;
      
      // Get raw telemetry data
      const rawData = await Telemetry.find({ imei })
        .sort({ "state.reported.ts": -1 })
        .limit(2);
      
      handleSuccess(res, {
        imei,
        dataCount: rawData.length,
        fullDocuments: rawData.map(d => ({
          id: d._id,
          fullDocument: d.toObject(), // Show the complete document structure
          hasState: !!d.state,
          hasReported: !!d.state?.reported,
          stateKeys: d.state ? Object.keys(d.state) : [],
          reportedKeys: d.state?.reported ? Object.keys(d.state.reported) : []
        }))
      });
    } catch (error) {
      handleError(res, "Failed to get debug data", 500);
    }
  };
}



