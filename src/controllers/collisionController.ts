import { Request, Response } from "express";
import { CollisionDetectionService } from "../services/CollisionDetectionService";
import { CollisionAlert } from "../models/Collision";
import { Device } from "../models/Device";
import { CustomError } from "../middleware/errorHandler";

const collisionService = new CollisionDetectionService();

export const getRecentCollision = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.body;
    const { limit = 10 } = req.query;
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
    const { deviceId } = req.body;
    const { limit = 10 } = req.query;
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

// export const getCollisionStats = async (req: Request, res: Response) => {
//   try {
//     const { imei } = req.params;
//     const { days = 30 } = req.query;
//     const userId = (req as any).user.userId;

//     if (!imei) {
//       throw new CustomError("IMEI is required", 400);
//     }

//     const device = await Device.findOne({ imei, user: userId });
//     if (!device) throw new CustomError(`Access denied to device ${imei}`, 403);

//     const stats = await collisionService.getCollisionStats(
//       imei!,
//       parseInt(days as string)
//     );

//     res.json({
//       success: true,
//       data: {
//         imei,
//         period: `${days} days`,
//         ...stats,
//       },
//     });
//   } catch (error) {
//     const statusCode = error instanceof CustomError ? error.statusCode : 500;
//     res.status(statusCode).json({
//       success: false,
//       message:
//         error instanceof Error
//           ? error.message
//           : "Failed to fetch collision statistics",
//     });
//   }
// };

// export const updateCollisionStatus = async (req: Request, res: Response) => {
//   try {
//     const { imei, collisionId, status, responseTime } = req.body;
//     const userId = (req as any).user.userId;

//     if (!imei || !collisionId || !status) {
//       throw new CustomError("IMEI, collisionId, and status are required", 400);
//     }
//     if (!["confirmed", "false_alarm"].includes(status)) {
//       throw new CustomError(
//         'Status must be either "confirmed" or "false_alarm"',
//         400
//       );
//     }

//     const device = await Device.findOne({ imei, user: userId });
//     if (!device) throw new CustomError(`Access denied to device ${imei}`, 403);

//     await collisionService.updateCollisionStatus(
//       imei,
//       collisionId,
//       status,
//       responseTime
//     );

//     res.json({
//       success: true,
//       message: `Collision status updated to ${status}`,
//       data: {
//         imei,
//         collisionId,
//         status,
//         updatedAt: new Date().toISOString(),
//       },
//     });
//   } catch (error) {
//     const statusCode = error instanceof CustomError ? error.statusCode : 500;
//     res.status(statusCode).json({
//       success: false,
//       message:
//         error instanceof Error
//           ? error.message
//           : "Failed to update collision status",
//     });
//   }
// };
