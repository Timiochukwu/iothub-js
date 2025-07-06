import { Request, Response } from "express";
import { CollisionAlert } from "../models/Collision";
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

    const collisions = await CollisionAlert.findOne({ device: device._id });

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
