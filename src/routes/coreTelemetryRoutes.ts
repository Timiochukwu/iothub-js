import { Router } from "express";
import { CoreTelemetryController } from "../controllers/CoreTelemetryController";

const router = Router();
const coreTelemetryController = new CoreTelemetryController();

// Core telemetry operations
router.post(
  "/ingest", 
  coreTelemetryController.ingestTelemetry.bind(coreTelemetryController)
);

router.get(
  "/all", 
  coreTelemetryController.getAllTelemetry.bind(coreTelemetryController)
);

router.get(
  "/latest", 
  coreTelemetryController.getLatestTelemetry.bind(coreTelemetryController)
);

router.get(
  "/:imei/latest", 
  coreTelemetryController.getDeviceLatestTelemetry.bind(coreTelemetryController)
);

router.get(
  "/:imei/state", 
  coreTelemetryController.getCarState.bind(coreTelemetryController)
);

router.get(
  "/:imei/location-history", 
  coreTelemetryController.getLocationHistory.bind(coreTelemetryController)
);

// Individual data points
router.get(
  "/tire-pressure/latest", 
  coreTelemetryController.getLatestTirePressure.bind(coreTelemetryController)
);

router.get(
  "/position/latest", 
  coreTelemetryController.getLatestPosition.bind(coreTelemetryController)
);

router.get(
  "/speed/latest", 
  coreTelemetryController.getSpeedInfo.bind(coreTelemetryController)
);

router.get(
  "/battery/latest", 
  coreTelemetryController.getLatestBattery.bind(coreTelemetryController)
);

router.get(
  "/fuel/latest", 
  coreTelemetryController.getLatestFuelLevel.bind(coreTelemetryController)
);

router.get(
  "/vehicle-health", 
  coreTelemetryController.getVehicleHealthStatus.bind(coreTelemetryController)
);

export default router;