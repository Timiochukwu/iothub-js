import { Router } from "express";
import { DrivingBehaviorController } from "../controllers/DrivingBehaviorController";

const router = Router();
const drivingBehaviorController = new DrivingBehaviorController();

// Get driving behavior report
router.get(
  "/:imei/report", 
  drivingBehaviorController.getDrivingBehaviorReport.bind(drivingBehaviorController)
);

router.get(
    "/:imei/status", 
    drivingBehaviorController.getCurrentDrivingStatus.bind(drivingBehaviorController)
  );

// Get analytics summary
router.get(
  "/:imei/analytics", 
  drivingBehaviorController.getAnalyticsSummary.bind(drivingBehaviorController)
);

// Get speed chart data
router.get(
  "/:imei/speed-chart", 
  drivingBehaviorController.getSpeedChartData.bind(drivingBehaviorController)
);

// Get driving score
router.get(
  "/:imei/score", 
  drivingBehaviorController.getDrivingScore.bind(drivingBehaviorController)
);

export default router;