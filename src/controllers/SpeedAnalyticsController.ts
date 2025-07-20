// src/controllers/SpeedAnalyticsController.ts

import { Request, Response } from "express";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth";

import { SpeedAnalyticsService } from "../services/SpeedAnalyticsService";
import { ChartGroupingType } from "../types"; // Import ChartGroupingType
import { Device } from "../models/Device"; // Assuming you have a Device model

export class SpeedAnalyticsController {
  private speedAnalyticsService: SpeedAnalyticsService;

  constructor() {
    this.speedAnalyticsService = new SpeedAnalyticsService();
  }

  async getCurrentSpeedData(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    const imei = req.params?.imei as string;

    if (!imei) {
      res.status(400).json({ error: "IMEI is required" });
      return;
    }

    // confirm user own device
    const device = await Device.findOne({
      imei,
      userId: req.user?.userId as any,
    });

    if (!device) {
      res.status(403).json({ error: "User does not own this device" });
      return;
    }

    try {
      const data = await this.speedAnalyticsService.getCurrentSpeedData(imei);
      if (data) {
        res.json(data);
      } else {
        res.status(404).json({ error: "Data not found for the given IMEI" });
      }
    } catch (error) {
      console.error("Error fetching current speed data:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  async getSpeedReport(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    const imei = req.params?.imei as string;
    let startDateParam = req.query?.startDate as string | undefined;
    let endDateParam = req.query?.endDate as string | undefined;
    let chartType = req.query?.groupingType as ChartGroupingType | undefined;

    if (!imei) {
      res.status(400).json({ error: "IMEI is required" });
      return;
    }

    // confirm user own device
    const device = await Device.findOne({
      imei,
      userId: req.user?.userId as any,
    });

    if (!device) {
      res.status(403).json({ error: "User does not own this device" });
      return;
    }

    let startDate: Date;
    let endDate: Date;

    if (!startDateParam || !endDateParam) {
      const currentDate = new Date();
      startDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate() - 7
      );
      endDate = currentDate;
    } else {
      startDate = new Date(startDateParam);
      endDate = new Date(endDateParam);
    }

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      res.status(400).json({
        error: "Invalid date format provided for startDate or endDate",
      });
      return;
    }

    if (endDate.getTime() < startDate.getTime()) {
      res.status(400).json({ error: "End date must be after start date" });
      return;
    }

    const chartGroupingType: ChartGroupingType =
      chartType && ["daily", "weekly", "monthly"].includes(chartType)
        ? chartType
        : "daily";

    try {
      const data = await this.speedAnalyticsService.getSpeedReportData(
        imei,
        startDate,
        endDate,
        chartGroupingType
      );

      // --- FIX IS HERE ---
      // 'entry' already contains 'dateLabel', so just spread 'entry'
      const responseData = Array.from(data.values()); // Get just the values (SpeedReportEntry objects) from the Map

      if (responseData.length > 0) {
        res.json({
          success: true,
          data: responseData,
          message: "Speed report retrieved successfully",
        });
      } else {
        res
          .status(404)
          .json({ error: "No speed report data found for the given criteria" });
      }
    } catch (error) {
      console.error("Error fetching speed report:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
