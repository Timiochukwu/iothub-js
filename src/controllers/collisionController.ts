import { Request, Response } from "express";
import { CollisionAlert, CollisionAlertSettings } from "../models/Collision";
import { Device } from "../models/Device";
import { CustomError } from "../middleware/errorHandler";

export const getRecentCollision = async (req: Request, res: Response) => {
  try {
    // const { deviceId } = req.body;

    const { deviceId } = req.query as {
      deviceId?: string;
    };
    const userId = (req as any).user.userId;

    if (!deviceId) {
      throw new CustomError("Device ID is required", 400);
    }

    const device = await Device.findOne({ _id: deviceId, user: userId });
    if (!device)
      throw new CustomError(`Access denied to device ${deviceId}`, 403);

    const collisions = await CollisionAlert.findOne({
      device: device._id,
    }).sort({
      timestamp: -1,
    });

    res.json({
      success: true,
      data: collisions,
      message: collisions
        ? "Recent collision data fetched successfully"
        : "No recent collision data found",
    });
  } catch (error) {
    const statusCode = error instanceof CustomError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to fetch collision history",
    });
  }
};

export const getRecentCollisions = async (req: Request, res: Response) => {
  try {
    // const { deviceId } = req.body;
    //add type to page
    const { page = 1, deviceId } = req.query as {
      page?: number;
      deviceId?: string;
    };
    const limit = 10;
    const userId = (req as any).user.userId;

    if (!deviceId) {
      throw new CustomError("Device ID is required", 400);
    }

    const device = await Device.findOne({ _id: deviceId, user: userId });
    if (!device)
      throw new CustomError(`Access denied to device ${deviceId}`, 403);

    const collisions = await CollisionAlert.find({ device: device._id })
      .skip((page - 1) * limit)
      .select("-__v -createdAt -updatedAt -data")
      .limit(limit);

    res.json({
      success: true,
      data: collisions,
    });
  } catch (error) {
    const statusCode = error instanceof CustomError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to fetch collision history",
    });
  }
};

export const toggleCollisionStatus = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const userId = (req as any).user.userId;

    let collisionAlert = await CollisionAlertSettings.findOne({
      device: deviceId,
      user: userId,
    });

    if (!collisionAlert) {
      // create one

      collisionAlert = new CollisionAlertSettings({
        device: deviceId,
        user: userId,
        timestamp: new Date(),
        status: true,
      });
    }

    collisionAlert.status = !collisionAlert.status;
    await collisionAlert.save();
    res.json({
      success: true,
      data: collisionAlert,
      message: `Collision status updated to ${collisionAlert.status ? "active" : "inactive"}`,
    });
  } catch (error) {
    const statusCode = error instanceof CustomError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to toggle collision status",
    });
  }
};
