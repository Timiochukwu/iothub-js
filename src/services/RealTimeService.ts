import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import * as jwt from "jsonwebtoken";
import { CollisionAlert } from "./CollisionDetectionService";
import { TelemetryService } from "./TelemetryService";
import { Telemetry, ITelemetry } from "../models/Telemetry";
import { Device } from "../models/Device";
import {
  DeviceConnection,
  TelemetryData,
  TelemetryPayload,
  RealTimeTelemetryEvent,
  ApiResponse,
} from "../types";
import { CustomError } from "../middleware/errorHandler";

import { JwtUtils } from "../utils/jwt";
import { mapTelemetry } from "../utils/mapTelemetry";
import { TelemetryDTO } from "../types/TelemetryDTO";
import { NotificationService } from "./NotificationService";
import { WorkingHours, WorkingHourAlert } from "../models/WorkingHours";

import { AVL_ID_MAP } from "../services/TelemetryService";

interface HistoryPayload {
  imei: string;
  startDate: string;
  endDate: string;
}

// Add this interface to your existing interfaces
interface CollisionAlertEvent {
  type: "collision_alert";
  imei: string;
  timestamp: number;
  alert: CollisionAlert;
}

interface SpeedReportPayload extends HistoryPayload {
  speedLimitKph: number;
}

// 🟢 NEW: Define the structure of the JWT payload for type safety.
interface UserJWTPayload extends jwt.JwtPayload {
  // id: string; // User's MongoDB _id
  email: string;
}

// 🟢 NEW: Extend the default Socket.IO Socket data property.
// This is the modern, recommended way to attach custom data to a socket instance.
interface SocketData {
  user: UserJWTPayload;
}

interface ImeiPayload {
  imei: string;
}

export class RealTimeService {
  private io: SocketIOServer;
  private telemetryService: TelemetryService;
  private deviceConnections: Map<string, DeviceConnection> = new Map(); // Key: imei
  private imeiWatchers: Map<string, Set<string>> = new Map(); // Key: imei, Value: Set of socketIds
  // 🟢 NEW: This map is now actively used to track authenticated user sockets.
  private userSockets: Map<string, Set<string>> = new Map(); // Key: user email, Value: Set of socketIds
  private notificationService: NotificationService;

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer<any, any, any, SocketData>(httpServer, {
      // 🟢 NEW: Apply SocketData type
      cors: {
        origin: [
          process.env.FRONTEND_URL || "http://localhost:3000",
          "http://localhost:6162",
          "http://localhost:5177",
        ],
        methods: ["GET", "POST"],
      },
    });

    this.telemetryService = new TelemetryService();
    this.notificationService = new NotificationService();
    this.setupSocketHandlers();
    this.setupChangeStreamListener();
    console.log("✅ RealTimeService initialized with Socket.IO server.");
  }

  private setupSocketHandlers(): void {
    this.io.on("connection", (socket: Socket<any, any, any, SocketData>) => {
      // 🟢 NEW: Apply SocketData type
      console.log(`[Connection] 🔌 New client connected: ${socket.id}`);

      // 🔴 CHANGED: Authentication flow now distinguishes between Devices and Users (Watchers)
      const { imei, token } = socket.handshake.auth;

      if (imei && typeof imei === "string") {
        // This is a device connection
        this.handleDeviceAutoRegistration(socket, imei);
      } else if (token && typeof token === "string") {
        // 🟢 NEW: This is a user/watcher connection, authenticate via JWT
        this.handleUserAuthentication(socket, token);
      } else {
        // Unauthenticated connection
        console.warn(
          `[Connection] ⚠️ Client ${socket.id} connected without credentials. Waiting for events or disconnection.`
        );
      }

      // --- Event Listeners for this specific socket ---
      socket.on("subscribe_to_device", (data: ImeiPayload) =>
        this.handleSubscribeToDevice(socket, data)
      );
      socket.on("get_real_time_telemetry", (data: ImeiPayload) =>
        this.handleGetRealTimeTelemetry(socket, data)
      );
      socket.on("telemetry_data", (payload: TelemetryPayload) =>
        this.handleTelemetryData(socket, payload)
      );
      socket.on("disconnect", (reason) =>
        this.handleDisconnection(socket, reason)
      );

      socket.on("update_collision_status", (data: any) =>
        this.handleCollisionStatusUpdate(socket, data)
      );
      socket.on("get_collision_history", (data: any) =>
        this.handleGetCollisionHistory(socket, data)
      );

      socket.on("fuel_level_history", (data: HistoryPayload) =>
        this.handleGetFuelLevelHistory(socket, data)
      );

      socket.on("fuel_daily_history", (data: HistoryPayload) =>
        this.handleGetFuelDailyHistory(socket, data)
      );

      socket.on("daily_speed_history", (data: SpeedReportPayload) =>
        this.handleGetDailySpeedReport(socket, data)
      );

      // Add these new event listeners
      socket.on("get_notifications", (data: any) =>
        this.handleGetNotifications(socket, data)
      );
      socket.on("mark_notification_read", (data: any) =>
        this.handleMarkNotificationRead(socket, data)
      );
      socket.on("mark_all_notifications_read", () =>
        this.handleMarkAllNotificationsRead(socket)
      );
      socket.on("delete_notification", (data: any) =>
        this.handleDeleteNotification(socket, data)
      );
    });
  }

  private mapToTelemetryData(telemetry: ITelemetry): TelemetryData {
    // console.log("Mapping telemetry data:", telemetry);

    // Step 1: Use the generic utility to get a flexible DTO
    const telemetryDto: TelemetryDTO = mapTelemetry(telemetry);

    // console.log("Mapped telemetry DTO:", telemetryDto);

    // Step 2: Validate the DTO to ensure it meets the stricter TelemetryData contract
    if (!telemetryDto.imei) {
      throw new Error(
        `Data integrity error: Telemetry record ${telemetry._id} is missing an IMEI.`
      );
    }
    if (telemetryDto.id === undefined) {
      telemetryDto.id = telemetry._id.toString();
    }

    // Step 3: Now that we've validated it, we can safely cast and return it as TelemetryData
    return telemetryDto as TelemetryData;
  }
  private setupChangeStreamListener(): void {
    console.log(
      "[Change Stream] Setting up listener on Telemetry collection..."
    );

    // The .watch() method opens a change stream.
    const changeStream = Telemetry.watch();

    // Listen for the 'change' event.
    changeStream.on("change", (change) => {
      // We only care about new documents being created by the third party.
      if (change.operationType === "insert") {
        const newTelemetryDoc = change.fullDocument as any;
        console.log(
          `[Change Stream] 👂 Detected 'insert' for IMEI: ${newTelemetryDoc.imei}`
        );

        this.handleWorkingHour(newTelemetryDoc.imei, newTelemetryDoc);

        // Prepare the payload for the clients (watchers)
        const telemetryData = this.mapToTelemetryData(newTelemetryDoc);

        // This is the event name you wanted
        const eventName = "real_time_telemetry";

        const eventPayload = {
          imei: newTelemetryDoc.imei,
          data: telemetryData,
        };

        // Find the specific room for watchers of this device
        const watchRoom = `watch:${newTelemetryDoc.imei}`;

        // check if room exist else create
        if (!this.imeiWatchers.has(newTelemetryDoc.imei)) {
          this.imeiWatchers.set(newTelemetryDoc.imei, new Set());
        }

        // Emit the event to all sockets in that room
        this.io.to(watchRoom).emit(eventName, eventPayload);

        console.log(
          `[Broadcast] 📡 Relayed DB change for ${newTelemetryDoc.imei} to room '${watchRoom}'.`
        );
      }
    });

    // It's good practice to handle errors
    changeStream.on("error", (error) => {
      console.error("[Change Stream] ❌ Error:", error);
      // You might want to try re-establishing the stream here after a delay
    });

    console.log("[Change Stream] ✅ Listener is active.");
  }

  // 🟢 NEW: Handler for authenticating a user via JWT
  private handleUserAuthentication(
    socket: Socket<any, any, any, SocketData>,
    token: string
  ): void {
    try {
      if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not defined on the server.");
      }

      const decoded = JwtUtils.verifyToken(token) as UserJWTPayload;

      if (!decoded || !decoded.userId || !decoded.email) {
        throw new Error("Invalid token payload.");
      }

      // Attach user data to the socket instance for later use
      socket.data.user = decoded;

      // Join a user-specific room (useful for sending notifications to all of a user's sessions)
      const userRoom = `user:${decoded.userId}`;
      socket.join(userRoom);

      // Track the user's socket connections
      if (!this.userSockets.has(decoded.userId)) {
        this.userSockets.set(decoded.userId, new Set());
      }
      this.userSockets.get(decoded.userId)!.add(socket.id);

      console.log(
        `[Auth] ✅ User '${decoded.userId}' authenticated for socket ${socket.id}`
      );
      socket.emit("authenticated", { message: "Authentication successful." });
    } catch (error) {
      console.error(
        `[Auth] ❌ JWT authentication failed for socket ${socket.id}:`,
        error
      );
      socket.emit("error", {
        message: "Authentication failed. Invalid token.",
      });
      socket.disconnect(true);
    }
  }

  private handleDeviceAutoRegistration(socket: Socket, imei: string): void {
    // ... (This function remains unchanged)
    console.log(
      `[Auth] 🤝 Handshake received. Attempting to auto-register device with IMEI: ${imei}`
    );
    (async () => {
      try {
        await this.registerDevice(socket, imei);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Authentication failed";
        console.error(
          `[Auth] ❌ Auto-registration failed for IMEI ${imei}: ${errorMessage}`
        );
        socket.emit("error", {
          message: "Registration failed",
          details: errorMessage,
        });
        socket.disconnect(true);
      }
    })();
  }

  private async registerDevice(socket: Socket, imei: string): Promise<void> {
    console.log(`[Register] 📝 Starting registration for IMEI: ${imei}`);

    const device = await Device.findOne({ imei });
    if (!device) {
      throw new CustomError(
        `Device with IMEI ${imei} not found in database`,
        404
      );
    }

    const connection: DeviceConnection = {
      socketId: socket.id,
      imei,
      lastHeartbeat: Date.now(),
      connectedAt: Date.now(),
    };

    this.deviceConnections.set(imei, connection);
    socket.join(`device:${imei}`); // A room just for this device
    console.log(`[Register] ✅ SUCCESS: Device ${imei} is now connected.`);
    socket.emit("device_registered", {
      message: `Device ${imei} registered successfully.`,
    });
  }

  // 🔴 CHANGED: This handler now requires authentication and authorization
  private async handleSubscribeToDevice(
    socket: Socket<any, any, any, SocketData>,
    data: ImeiPayload
  ): Promise<void> {
    try {
      const { imei } = data;
      const user = socket.data.user;

      // 1. Authentication Check: Ensure the user is authenticated
      if (!user) {
        throw new CustomError(
          "Authentication required. Please connect with a valid token.",
          401
        );
      }

      if (!imei) {
        throw new CustomError("IMEI is required for subscription.", 400);
      }

      // 2. Authorization Check: Verify the user owns this device
      const device = await Device.findOne({ imei, user: user.userId });
      if (!device) {
        throw new CustomError(
          `Access denied. You are not authorized to view device ${imei}.`,
          403
        );
      }

      // 3. Subscription Logic (if authorized)
      const watchRoom = `watch:${imei}`;
      socket.join(watchRoom);

      if (!this.imeiWatchers.has(imei)) {
        this.imeiWatchers.set(imei, new Set());
      }
      this.imeiWatchers.get(imei)!.add(socket.id);

      console.log(
        `[Subscribe] 👤 User '${user.email}' (${socket.id}) is now monitoring device ${imei}.`
      );
      socket.emit("device_subscribed", {
        message: `Successfully subscribed to updates for IMEI ${imei}.`,
      });

      // send data first time
      const telemetryData =
        await this.telemetryService.getDeviceLatestTelemetry(imei);
      if (telemetryData) {
        const event: RealTimeTelemetryEvent = {
          type: "telemetry_update",
          imei,
          timestamp: Date.now(),
          data: telemetryData,
        };
        socket.emit("real_time_telemetry", event);
        console.log(
          `[Subscribe] 📡 Initial telemetry data sent for ${imei} to ${socket.id}.`
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Subscription failed";
      const errorCode = error instanceof CustomError ? error.statusCode : 500;
      console.error(
        `[Subscribe] ❌ Error for watcher subscription: ${errorMessage}`
      );
      socket.emit("error", {
        message: "Failed to subscribe to device",
        details: errorMessage,
        code: errorCode,
      });
    }
  }

  private async handleGetRealTimeTelemetry(
    socket: Socket<any, any, any, SocketData>,
    data: ImeiPayload
  ): Promise<void> {
    try {
      const { imei } = data;
      const user = socket.data.user;

      // 1. Authentication Check
      if (!user) {
        throw new CustomError("Authentication required.", 401);
      }

      if (!imei) {
        throw new CustomError("IMEI is required to fetch telemetry.", 400);
      }

      // 2. Authorization Check
      const device = await Device.findOne({ imei, user: user.userId });
      if (!device) {
        throw new CustomError(`Access denied to device ${imei}.`, 403);
      }

      if (!this.deviceConnections.has(imei)) {
        throw new CustomError("Device is not currently connected.", 404);
      }

      // ... rest of the logic is fine
      const telemetryData =
        await this.telemetryService.getDeviceLatestTelemetry(imei);
      if (!telemetryData) {
        throw new CustomError(
          "No telemetry data available for this device yet.",
          404
        );
      }

      socket.emit("real_time_telemetry", { imei, data: telemetryData });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get telemetry";
      const errorCode = error instanceof CustomError ? error.statusCode : 500;
      console.error(`[Telemetry Fetch] ❌ Error: ${errorMessage}`);
      socket.emit("error", {
        message: "Failed to get real-time telemetry",
        details: errorMessage,
        code: errorCode,
      });
    }
  }

  //  it's a device-initiated event.
  private async handleTelemetryData(
    socket: Socket,
    payload: TelemetryPayload
  ): Promise<void> {
    const { imei } = payload;
    if (!imei || !this.deviceConnections.has(imei)) {
      console.warn(
        `[Telemetry Ingest] ⚠️ Received data from unregistered/stale device: ${imei}.`
      );
      socket.disconnect(true);
      return;
    }

    try {
      const ingestResult: ApiResponse<TelemetryData> =
        await this.telemetryService.ingestTelemetry(payload);
      const telemetryData = ingestResult.data;
      if (!telemetryData) throw new Error("Ingested data is invalid.");

      // 🟢 NEW: Check for collision alerts
      const collisionAlert = ingestResult.data?.collisionAlert;
      // Only call handleCollisionAlert if collisionAlert is an object and not a boolean
      if (
        collisionAlert &&
        typeof collisionAlert === "object" &&
        !Array.isArray(collisionAlert)
      ) {
        await this.handleCollisionAlert(imei, collisionAlert);
      }

      const event: RealTimeTelemetryEvent = {
        type: "telemetry_update",
        imei,
        timestamp: Date.now(),
        data: telemetryData,
      };

      const watchRoom = `watch:${imei}`;
      this.io.to(watchRoom).emit("telemetry_update", event);

      console.log(
        `[Telemetry Ingest] 📡 Relayed telemetry for ${imei} to room '${watchRoom}'.`
      );
    } catch (error) {
      console.error(
        `[Telemetry Ingest] ❌ Error processing telemetry for ${imei}:`,
        error
      );
    }
  }

  // 🟢 NEW: Handle collision alerts
  private async handleCollisionAlert(
    imei: string,
    alert: CollisionAlert
  ): Promise<void> {
    try {
      console.log(
        `[Collision Alert] 🚨 ${alert.severity.toUpperCase()} collision detected for device ${imei}`
      );

      // Find device owner
      const device = await Device.findOne({ imei });
      if (!device || !device.user) {
        console.error(
          `[Collision Alert] ❌ Device ${imei} not found or has no owner`
        );
        return;
      }

      // Create collision event for notification
      const collisionEvent = {
        id: alert.id,
        imei: alert.imei,
        timestamp: alert.timestamp,
        severity: alert.severity,
        location: {
          latlng: alert.location,
          address: alert.location,
        },
        vehicleInfo: {
          speed: 0, // You'll need to extract this from your telemetry
          rpm: 0,
          direction: 0,
        },
        accelerometerData: {
          x: 0,
          y: 0,
          z: 0, // You'll need to extract this from your telemetry
        },
        status: "pending" as const,
        emergencyContacted: alert.severity === "severe",
      };

      // Create notification
      const notification =
        await this.notificationService.createCollisionNotification(
          collisionEvent,
          device.user.toString()
        );

      const collisionEventData = {
        type: "collision_alert",
        imei,
        timestamp: alert.timestamp,
        alert,
      };

      // Send real-time collision alert to watchers
      const watchRoom = `watch:${imei}`;
      this.io.to(watchRoom).emit("collision_alert", collisionEventData);

      // Send notification to user's devices
      const userRoom = `user:${device.user}`;
      this.io.to(userRoom).emit("notification", {
        type: "new_notification",
        notification: {
          ...notification,
          date: new Date(notification.timestamp).toLocaleDateString(),
          time: new Date(notification.timestamp).toLocaleTimeString(),
          icon: "🚗",
          color: notification.severity === "critical" ? "#EF4444" : "#F59E0B",
        },
      });

      // For severe collisions, broadcast to emergency channels
      if (alert.severity === "severe") {
        this.io.emit("emergency_collision", {
          ...collisionEventData,
          priority: "HIGH",
          emergencyResponse: true,
        });
      }

      console.log(
        `[Collision Alert] 📡 Collision alert and notification sent for ${imei} - Severity: ${alert.severity}`
      );
    } catch (error) {
      console.error(
        `[Collision Alert] ❌ Error handling collision alert for ${imei}:`,
        error
      );
    }
  }

  // 🟢 NEW: Event handler for collision status updates
  private async handleCollisionStatusUpdate(
    socket: Socket<any, any, any, SocketData>,
    data: {
      imei: string;
      collisionId: string;
      status: "confirmed" | "false_alarm";
      responseTime?: number;
    }
  ): Promise<void> {
    try {
      const { imei, collisionId, status, responseTime } = data;
      const user = socket.data.user;

      // Authentication check
      if (!user) {
        throw new CustomError("Authentication required.", 401);
      }

      // Authorization check
      const device = await Device.findOne({ imei, user: user.userId });
      if (!device) {
        throw new CustomError(`Access denied to device ${imei}.`, 403);
      }

      // Update collision status
      await this.telemetryService.updateCollisionStatus(
        imei,
        collisionId,
        status,
        responseTime
      );

      // Notify all watchers about the status update
      const watchRoom = `watch:${imei}`;
      this.io.to(watchRoom).emit("collision_status_updated", {
        imei,
        collisionId,
        status,
        updatedBy: user.email,
        timestamp: Date.now(),
      });

      socket.emit("collision_status_update_success", {
        message: `Collision status updated to ${status}`,
        collisionId,
        status,
      });

      console.log(
        `[Collision Status] ✅ User ${user.email} updated collision ${collisionId} status to ${status}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to update collision status";
      const errorCode = error instanceof CustomError ? error.statusCode : 500;

      console.error(`[Collision Status] ❌ Error: ${errorMessage}`);
      socket.emit("error", {
        message: "Failed to update collision status",
        details: errorMessage,
        code: errorCode,
      });
    }
  }

  // 🟢 NEW: Get collision history for a device
  private async handleGetCollisionHistory(
    socket: Socket<any, any, any, SocketData>,
    data: { imei: string; limit?: number }
  ): Promise<void> {
    try {
      const { imei, limit = 10 } = data;
      const user = socket.data.user;

      // Authentication check
      if (!user) {
        throw new CustomError("Authentication required.", 401);
      }

      // Authorization check
      const device = await Device.findOne({ imei, user: user.userId });
      if (!device) {
        throw new CustomError(`Access denied to device ${imei}.`, 403);
      }

      const collisionHistory = await this.telemetryService.getCollisionHistory(
        imei,
        limit
      );

      socket.emit("collision_history", {
        imei,
        collisions: collisionHistory,
        timestamp: Date.now(),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to get collision history";
      const errorCode = error instanceof CustomError ? error.statusCode : 500;

      console.error(`[Collision History] ❌ Error: ${errorMessage}`);
      socket.emit("error", {
        message: "Failed to get collision history",
        details: errorMessage,
        code: errorCode,
      });
    }
  }

  private async handleGetFuelLevelHistory(
    socket: Socket<any, any, any, SocketData>,
    data: HistoryPayload
  ): Promise<void> {
    try {
      const { imei, startDate, endDate } = data;
      const user = socket.data.user;

      // Standard security checks
      if (!user) throw new CustomError("Authentication required.", 401);
      if (!imei || !startDate || !endDate)
        throw new CustomError(
          "IMEI, startDate, and endDate are required.",
          400
        );
      const start = new Date(startDate);
      const end = new Date(endDate);
      const device = await Device.findOne({ imei, user: user.userId });
      if (!device)
        throw new CustomError(`Access denied to device ${imei}.`, 403);

      console.log(
        `[History] 📈 User '${user.email}' requested fuel level history for ${imei}`
      );
      const history = await this.telemetryService.getFuelLevelHistory(
        imei,
        start,
        end
      );

      socket.emit("fuel_level_history_result", { imei, history });
    } catch (error) {
      // ... standard error handling
    }
  }

  public async handleGetFuelDailyHistory(
    socket: Socket<any, any, any, SocketData>,
    data: HistoryPayload
  ): Promise<void> {
    try {
      const { imei, startDate, endDate } = data;
      const user = socket.data.user;

      // Standard security checks
      if (!user) throw new CustomError("Authentication required.", 401);
      if (!imei || !startDate || !endDate)
        throw new CustomError(
          "IMEI, startDate, and endDate are required.",
          400
        );
      const start = new Date(startDate);
      const end = new Date(endDate);
      const device = await Device.findOne({ imei, user: user.userId });
      if (!device)
        throw new CustomError(`Access denied to device ${imei}.`, 403);

      console.log(
        `[History] 📈 User '${user.email}' requested fuel daily history for ${imei}`
      );
      const history = await this.telemetryService.getDailyFuelConsumption(
        imei,
        start,
        end
      );

      socket.emit("fuel_daily_history", { imei, history });
    } catch (error) {
      // ... standard error handling
    }
  }

  private async handleGetDailySpeedReport(
    socket: Socket<any, any, any, SocketData>,
    data: SpeedReportPayload
  ): Promise<void> {
    try {
      const { imei, startDate, endDate, speedLimitKph } = data;
      const user = socket.data.user;

      // Security and validation checks
      if (!user) throw new CustomError("Authentication required.", 401);
      if (!imei || !startDate || !endDate) {
        throw new CustomError(
          "IMEI, startDate, endDate, and speedLimitKph are required.",
          400
        );
      }
      const start = new Date(startDate);
      const end = new Date(endDate);
      const device = await Device.findOne({ imei, user: user.userId });
      if (!device)
        throw new CustomError(`Access denied to device ${imei}.`, 403);

      console.log(
        `[Analytics] 🏎️  User '${user.email}' requested daily speed report for ${imei}`
      );
      const dailyReport = await this.telemetryService.getDailySpeedReport(
        imei,
        start,
        end
      );

      socket.emit("daily_speed_history", { imei, dailyReport });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get speed report";
      const errorCode = error instanceof CustomError ? error.statusCode : 500;
      console.error(`[Speed Report] ❌ Error: ${errorMessage}`);
      socket.emit("error", {
        message: "Failed to get daily speed report",
        details: errorMessage,
        code: errorCode,
      });
    }
  }

  // 🔴 CHANGED: Disconnection handler now cleans up user sockets too.
  private handleDisconnection(
    socket: Socket<any, any, any, SocketData>,
    reason: string
  ): void {
    console.log(
      `[Connection] 🔌 Client disconnected: ${socket.id}. Reason: ${reason}`
    );

    // Check if it was a device
    const deviceEntry = Array.from(this.deviceConnections.entries()).find(
      ([, conn]) => conn.socketId === socket.id
    );
    if (deviceEntry) {
      this.deviceConnections.delete(deviceEntry[0]);
      console.log(
        `[Connection] 📱 Device ${deviceEntry[0]} connection removed.`
      );
    }

    // 🟢 NEW: Check if it was an authenticated user and clean up userSockets map
    const user = socket.data.user;
    if (user && user.userId) {
      const userSocketSet = this.userSockets.get(user.userId);
      if (userSocketSet) {
        userSocketSet.delete(socket.id);
        console.log(
          `[Connection] 👤 User '${user.userId}' socket ${socket.id} removed.`
        );
        if (userSocketSet.size === 0) {
          this.userSockets.delete(user.userId);
          console.log(
            `[Connection] 👤 All sockets for user '${user.userId}' disconnected.`
          );
        }
      }
    }

    // Clean up from watcher lists (this part is still correct)
    this.imeiWatchers.forEach((socketIds, imei) => {
      if (socketIds.has(socket.id)) {
        socketIds.delete(socket.id);
        console.log(
          `[Connection] 👤 Watcher ${socket.id} unsubscribed from ${imei}.`
        );
        if (socketIds.size === 0) {
          this.imeiWatchers.delete(imei);
          console.log(
            `[Connection] ოთახი watch:${imei} has no more watchers and was removed.`
          );
        }
      }
    });
  }

  // --- Public Methods for External Use (e.g., from index.ts or controllers) ---
  public getConnectedDevices(): string[] {
    return Array.from(this.deviceConnections.keys());
  }

  public getConnectedUsers(): string[] {
    return Array.from(this.userSockets.keys());
  }

  public cleanupDisconnectedDevices(): void {
    const now = Date.now();
    const timeout = 5 * 60 * 1000;

    for (const [imei, connection] of this.deviceConnections.entries()) {
      if (now - connection.lastHeartbeat > timeout) {
        const socket = this.io.sockets.sockets.get(connection.socketId);
        if (socket) {
          socket.disconnect(true);
        } else {
          this.deviceConnections.delete(imei);
        }
        console.log(
          `[Cleanup] 🧹 Stale device connection for ${imei} removed due to inactivity.`
        );
      }
    }
  }

  public broadcastCollisionAlert(imei: string, alert: CollisionAlert): void {
    const watchRoom = `watch:${imei}`;
    console.log(
      `[Broadcast] 🚨 Broadcasting collision alert to room '${watchRoom}'.`
    );

    this.io.to(watchRoom).emit("collision_alert", {
      type: "collision_alert",
      imei,
      timestamp: Date.now(),
      alert,
    });
  }

  public broadcastToAll(event: string, data: any): void {
    console.log(`[Broadcast] 📢 Broadcasting event '${event}' to ALL clients.`);
    this.io.emit(event, data);
  }

  public broadcastToDevice(imei: string, event: string, data: any): void {
    const room = `device:${imei}`;
    console.log(
      `[Broadcast] 📱 Broadcasting event '${event}' to room '${room}'.`
    );
    this.io.to(room).emit(event, data);
  }

  public broadcastToUser(email: string, event: string, data: any): void {
    const room = `user:${email}`;
    console.log(
      `[Broadcast] 👤 Broadcasting event '${event}' to room '${room}'.`
    );
    this.io.to(room).emit(event, data);
  }

  // New notification event handlers (stubs)
  private async handleGetNotifications(
    socket: Socket<any, any, any, SocketData>,
    data: { limit?: number; offset?: number; unreadOnly?: boolean }
  ): Promise<void> {
    // TODO: Implement notification fetching logic
  }

  private async handleMarkNotificationRead(
    socket: Socket<any, any, any, SocketData>,
    data: { id: string }
  ): Promise<void> {
    // TODO: Implement mark as read logic
  }

  private async handleMarkAllNotificationsRead(
    socket: Socket<any, any, any, SocketData>
  ): Promise<void> {
    // TODO: Implement mark all as read logic
  }

  private async handleDeleteNotification(
    socket: Socket<any, any, any, SocketData>,
    data: { id: string }
  ): Promise<void> {
    // TODO: Implement delete notification logic
  }

  private async handleWorkingHour(imei: string, payload: any): Promise<void> {
    const currentTime = new Date();
    // get device id by imei
    const device = await Device.findOne({ imei });
    if (!device) {
      console.log(`Device with IMEI ${imei} not found.`);
      return;
    }

    const deviceId = device._id?.toString();

    // get working hours
    const workingHourData = await WorkingHours.findOne({ deviceId });
    if (!workingHourData) {
      console.log(`Working hours not found for device ID ${deviceId}.`);
      return;
    }

    // check if current time is within working hours
    const startTime = workingHourData.startTime;
    const endTime = workingHourData.endTime;

    const formatStartTime = new Date(
      currentTime.toDateString() + " " + startTime
    );
    const formatEndTime = new Date(currentTime.toDateString() + " " + endTime);

    // if (!(currentTime >= formatStartTime && currentTime <= formatEndTime)) {
    if (
      payload.state.reported.ts > formatEndTime.getTime() ||
      payload.state.reported.ts < formatStartTime.getTime()
    ) {
      if (payload.state.reported[AVL_ID_MAP["MOVEMENT"]] == 1) {
        console.log(
          `Device ${imei} is outside working hours. Speed: ${payload.state.reported[AVL_ID_MAP["SPEED"]]} kph`
        );

        const latLng = payload.state.reported[AVL_ID_MAP["LAT_LNG"]];
        const lat = latLng ? latLng.split(",")[0] : null;
        const lng = latLng ? latLng.split(",")[1] : null;

        await WorkingHourAlert.create({
          device: deviceId,
          imei,
          timestamp: currentTime,
          data: payload.state.reported,
          location: {
            lat: lat,
            lng: lng,
          },
          status: "danger",
          message: `Device ${imei} is outside working hours. Speed: ${payload.state.reported[AVL_ID_MAP["SPEED"]]} kph`,
        });

        // Here you can handle the logic for when the device is outside working hours
        // For example, you might want to log this or send a notification
      }
    }
    // }
  }
}
