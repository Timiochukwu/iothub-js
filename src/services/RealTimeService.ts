import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import * as jwt from "jsonwebtoken";
import { CollisionAlert, CollisionAlertSettings } from "../models/Collision";
import { TelemetryService } from "./TelemetryService";
import { Telemetry, ITelemetry } from "../models/Telemetry";
import { Device } from "../models/Device";
import { Notification } from "../models/Notification";
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
import { WorkingHours } from "../models/WorkingHours";

import { GeofenceService } from "./GeofenceService";

const COLLISION_DECELERATION_THRESHOLD_KPH_S = 30;

import { AVL_ID_MAP } from "../services/TelemetryService";

interface HistoryPayload {
  imei: string;
  startDate: string;
  endDate: string;
}

interface GeofenceEvent {
  type: "entry" | "exit";
  deviceImei: string;
  geofenceId: string;
  geofenceName: string;
  timestamp: number;
  coordinates: { lat: number; lng: number };
  userEmail?: string;
}

interface GeofenceRoomData {
  deviceImei: string;
  userEmail?: string;
}

// Add this interface to your existing interfaces
// interface CollisionAlertEvent {
//   type: "collision_alert";
//   imei: string;
//   timestamp: number;
//   alert: CollisionAlert;
// }

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

  private geofenceService?: GeofenceService;

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer<any, any, any, SocketData>(httpServer, {
      cors: {
        origin: "*", // ✅ Allow all origins for development
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["*"],
        exposedHeaders: ["*"],
      },
      transports: ["websocket", "polling"],
      allowEIO3: true,
      pingTimeout: 60000,
      pingInterval: 25000,
      upgradeTimeout: 30000,
      allowRequest: (req, fn) => {
        // Allow all requests for development
        fn(null, true);
      },
    });

    this.telemetryService = new TelemetryService();
    this.notificationService = new NotificationService();
    this.setupSocketHandlers();
    this.setupChangeStreamListener();
    console.log("✅ RealTimeService initialized with Socket.IO server.");
  }

  public setGeofenceService(geofenceService: GeofenceService): void {
    this.geofenceService = geofenceService;
    console.log("✅ GeofenceService connected to RealTimeService");
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

      // 🟢 NEW: Geofence Event Listeners
      socket.on("join-geofence-room", (data: GeofenceRoomData) =>
        this.handleJoinGeofenceRoom(socket, data)
      );
      socket.on("leave-geofence-room", (data: GeofenceRoomData) =>
        this.handleLeaveGeofenceRoom(socket, data)
      );
      socket.on("test-geofence-event", (data: GeofenceEvent) =>
        this.handleTestGeofenceEvent(socket, data)
      );

      // Legacy support for the old event names
      socket.on("join-device-room", (data: { deviceImei: string }) =>
        this.handleJoinGeofenceRoom(socket, data)
      );
      socket.on("leave-device-room", (data: { deviceImei: string }) =>
        this.handleLeaveGeofenceRoom(socket, data)
      );
      socket.on("disconnect", (reason) =>
        this.handleDisconnection(socket, reason)
      );

      // socket.on("update_collision_status", (data: any) =>
      //   this.handleCollisionStatusUpdate(socket, data)
      // );
      // socket.on("get_collision_history", (data: any) =>
      //   this.handleGetCollisionHistory(socket, data)
      // );

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
        this.handleCollisionByDeceleration(newTelemetryDoc.imei);

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
        console.log(
          `[Broadcast] 📡 Emitting event '${eventName}' with payload:`,
          eventPayload
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
      // if (
      //   collisionAlert &&
      //   typeof collisionAlert === "object" &&
      //   !Array.isArray(collisionAlert)
      // ) {
      //   await this.handleCollisionAlert(imei, collisionAlert);
      // }

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

  // public broadcastCollisionAlert(imei: string, alert: CollisionAlert): void {
  //   const watchRoom = `watch:${imei}`;
  //   console.log(
  //     `[Broadcast] 🚨 Broadcasting collision alert to room '${watchRoom}'.`
  //   );

  //   this.io.to(watchRoom).emit("collision_alert", {
  //     type: "collision_alert",
  //     imei,
  //     timestamp: Date.now(),
  //     alert,
  //   });
  // }

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
    // const workingHourData = await WorkingHours.findOne({ deviceId });
    // get all working hour for device
    const workingHourData = await WorkingHours.find({ deviceId });

    if (!workingHourData) {
      console.log(`Working hours not found for device ID ${deviceId}.`);
      return;
    }

    workingHourData.forEach(async (workingHourData) => {
      // check if current time is within working hours
      const startTime = workingHourData.startTime;
      const endTime = workingHourData.endTime;

      const restingLocation = workingHourData.endLocation;
      const restingLat = restingLocation?.lat;
      const restingLng = restingLocation?.lng;

      const latLng = payload.state.reported[AVL_ID_MAP["LAT_LNG"]];
      const lat = latLng ? latLng.split(",")[0] : null;
      const lng = latLng ? latLng.split(",")[1] : null;

      let message = `Device ${imei} is outside working hours. Speed: ${payload.state.reported[AVL_ID_MAP["SPEED"]]} kph`;

      const formatStartTime = new Date(
        currentTime.toDateString() + " " + startTime
      );
      const formatEndTime = new Date(
        currentTime.toDateString() + " " + endTime
      );

      // if (!(currentTime >= formatStartTime && currentTime <= formatEndTime)) {
      if (
        payload.state.reported.ts > formatEndTime.getTime() ||
        payload.state.reported.ts < formatStartTime.getTime()
      ) {
        if (payload.state.reported[AVL_ID_MAP["MOVEMENT"]] == 1) {
          // console.log(
          //   `Device ${imei} is outside working hours. Speed: ${payload.state.reported[AVL_ID_MAP["SPEED"]]} kph`
          // );

          if (restingLat !== lat && restingLng !== lng) {
            message = `Device ${imei} is outside working hours and not at resting location. Speed: ${payload.state.reported[AVL_ID_MAP["SPEED"]]} kph`;
          } else {
            message = `Device ${imei} is outside working hours but at resting location. No alert triggered.`;
            return;
          }

          workingHourData.triggered = true;
          await workingHourData.save();

          // await WorkingHourAlert.create({
          //   device: deviceId,
          //   imei,
          //   timestamp: currentTime,
          //   data: payload.state.reported,
          //   location: {
          //     lat: lat,
          //     lng: lng,
          //   },
          //   status: "danger",
          //   message,
          // });

          //store in notifications
          const notification = {
            user: device.user,
            type: "working_hour_alert",
            message,
            data: mapTelemetry(payload.state.reported),
          };
          await Notification.create(notification);
        }
      }
      // }
    });
  }

  private async handleCollisionByDeceleration(imei: string): Promise<any> {
    const device = await Device.findOne({ imei });
    if (!device) {
      console.log(`Device with IMEI ${imei} not found.`);
      return;
    }

    // get collision alert status
    const collisionAlertSettingsData = await CollisionAlertSettings.findOne({
      device: device._id,
      status: true,
    }).lean();

    // if (!collisionAlertSettingsData) {
    //   console.log(
    //     `Collision alert is not active for device ${imei}. Skipping collision detection.`
    //   );
    //   return false;
    // }

    const recentTelemetry = await Telemetry.find({ imei })
      .sort({ "state.reported.ts": -1 })
      .limit(2)
      .lean() // Use .lean() to get plain JavaScript objects instead of Mongoose Documents
      .exec();

    // Ensure we have two points to compare
    if (recentTelemetry.length < 2) {
      console.log(
        `Not enough telemetry data to detect collision for IMEI ${imei}.`
      );
      return false;
    }

    // 2. FIX: Convert Mongoose Documents to plain objects to fix TS errors.
    // The first document in the sorted result is the most recent one.

    const currentTelemetry = recentTelemetry[0];
    const previousTelemetry = recentTelemetry[1];

    const previousPoint = previousTelemetry?.state?.reported as any;
    const currentPoint = currentTelemetry?.state?.reported as any;

    // console.log("Full: ", recentTelemetry);

    // console.log("currentTelemetry: ", currentTelemetry);
    // console.log("previousTelemetry: ", previousTelemetry);

    // console.log("currentPoint: ", currentPoint);
    // console.log("previousPoint: ", previousPoint);

    if (!previousPoint || !currentPoint) {
      console.log(`Telemetry data is malformed for IMEI ${imei}.`);
      return false;
    }
    // console.log(currentPoint);

    // Use OBD speed (37) or GPS speed ('sp') as a fallback

    const currentSpeed = currentPoint[AVL_ID_MAP.SPEED];
    const previousSpeed = previousPoint[AVL_ID_MAP.SPEED];

    const currentTimestamp = currentPoint[AVL_ID_MAP.TIMESTAMP];
    const previousTimestamp = previousPoint[AVL_ID_MAP.TIMESTAMP];

    if (
      currentSpeed === null ||
      currentSpeed === undefined ||
      previousSpeed === null ||
      previousSpeed === undefined ||
      !currentTimestamp ||
      !previousTimestamp
    ) {
      return false;
    }

    const timeDeltaSeconds = (currentTimestamp - previousTimestamp) / 1000;

    if (timeDeltaSeconds <= 0 || timeDeltaSeconds > 10) {
      // Increased to 10s to be safer
      return false;
    }

    const speedDeltaKph = previousSpeed - currentSpeed;

    if (speedDeltaKph <= 0) {
      return false;
    }

    const deceleration = speedDeltaKph / timeDeltaSeconds;

    if (
      deceleration >= COLLISION_DECELERATION_THRESHOLD_KPH_S &&
      currentSpeed < 5
    ) {
      console.log(
        `Potential Collision Detected! Deceleration: ${deceleration.toFixed(2)} km/h/s. ` +
          `Speed dropped from ${previousSpeed} to ${currentSpeed} km/h.`
      );

      const device = await Device.findOne({ imei }).lean(); // .lean() is efficient if you only need the data
      if (!device) {
        console.log(
          `Device with IMEI ${imei} not found during alert creation.`
        );
        return false;
      }

      // 3. FIX: Access latlng from the plain object `currentPoint`
      const latLng = currentPoint[AVL_ID_MAP.LAT_LNG];
      const lat = latLng ? latLng.split(",")[0] : null;
      const lng = latLng ? latLng.split(",")[1] : null;

      const now = new Date();

      let message =
        `Potential Collision Detected! Deceleration: ${deceleration.toFixed(2)} km/h/s. ` +
        `Speed dropped from ${previousSpeed} to ${currentSpeed} km/h.`;
      // 4. FIX: Use the ICollisionAlert interface for type safety
      const collisionAlertData = {
        device: device._id.toString(), // _id is available on the lean object
        timestamp: now,
        location: { lat, lng },
        message:
          `Potential Collision Detected! Deceleration: ${deceleration.toFixed(2)} km/h/s. ` +
          `Speed dropped from ${previousSpeed} to ${currentSpeed} km/h.`,
        // 5. FIX: Pass the plain object `currentPoint` to your mapping function
        data: currentPoint,
        speed: currentSpeed,
        rpm: currentPoint[AVL_ID_MAP.RPM] || 0,
      };

      await CollisionAlert.create(collisionAlertData);

      const notification = {
        user: device.user,
        type: "collision_alert",
        message,
        data: currentPoint,
      };
      await Notification.create(notification);

      return true;
    }

    return false;
  }

  /**
   * Handle geofence room joining
   */
  private async handleJoinGeofenceRoom(
    socket: Socket<any, any, any, SocketData>,
    data: GeofenceRoomData
  ): Promise<void> {
    try {
      const { deviceImei, userEmail } = data;
      const user = socket.data.user;

      // Authentication check
      if (!user) {
        throw new CustomError("Authentication required.", 401);
      }

      if (!deviceImei) {
        throw new CustomError("Device IMEI is required.", 400);
      }

      // Authorization check - verify user owns this device
      const device = await Device.findOne({
        imei: deviceImei,
        user: user.userId,
      });
      if (!device) {
        throw new CustomError(`Access denied to device ${deviceImei}.`, 403);
      }

      // Join geofence-specific rooms
      const deviceGeofenceRoom = `geofence:device:${deviceImei}`;
      socket.join(deviceGeofenceRoom);

      if (userEmail) {
        const userGeofenceRoom = `geofence:user:${userEmail}`;
        socket.join(userGeofenceRoom);
      }

      console.log(
        `[Geofence] 👤 User '${user.email}' joined geofence room for device ${deviceImei}`
      );

      socket.emit("geofence_room_joined", {
        message: `Successfully joined geofence monitoring for device ${deviceImei}`,
        deviceImei,
        rooms: [
          deviceGeofenceRoom,
          userEmail ? `geofence:user:${userEmail}` : null,
        ].filter(Boolean),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to join geofence room";
      const errorCode = error instanceof CustomError ? error.statusCode : 500;
      console.error(`[Geofence] ❌ Error joining room: ${errorMessage}`);
      socket.emit("error", {
        message: "Failed to join geofence room",
        details: errorMessage,
        code: errorCode,
      });
    }
  }

  /**
   * Handle leaving geofence room
   */
  private async handleLeaveGeofenceRoom(
    socket: Socket<any, any, any, SocketData>,
    data: GeofenceRoomData
  ): Promise<void> {
    try {
      const { deviceImei, userEmail } = data;

      const deviceGeofenceRoom = `geofence:device:${deviceImei}`;
      socket.leave(deviceGeofenceRoom);

      if (userEmail) {
        const userGeofenceRoom = `geofence:user:${userEmail}`;
        socket.leave(userGeofenceRoom);
      }

      console.log(
        `[Geofence] 🚪 Socket ${socket.id} left geofence room for device ${deviceImei}`
      );

      socket.emit("geofence_room_left", {
        message: `Left geofence monitoring for device ${deviceImei}`,
        deviceImei,
      });
    } catch (error) {
      console.error(`[Geofence] ❌ Error leaving room:`, error);
    }
  }

  /**
   * Broadcast geofence event to relevant clients
   */
  public broadcastGeofenceEvent(event: GeofenceEvent): void {
    const deviceRoom = `geofence:device:${event.deviceImei}`;

    console.log(
      `[Geofence] 🎯 Broadcasting ${event.type} event for device ${event.deviceImei} to room '${deviceRoom}'`
    );

    // Broadcast to device-specific room
    this.io.to(deviceRoom).emit("geofence-event", event);

    // Also broadcast to user room if specified
    if (event.userEmail) {
      const userRoom = `geofence:user:${event.userEmail}`;
      this.io.to(userRoom).emit("geofence-event", event);
    }

    // Broadcast to general watchers of this device
    const watchRoom = `watch:${event.deviceImei}`;
    this.io.to(watchRoom).emit("geofence-event", event);
  }

  /**
   * Test geofence event (for development)
   */
  private async handleTestGeofenceEvent(
    socket: Socket<any, any, any, SocketData>,
    data: GeofenceEvent
  ): Promise<void> {
    try {
      const user = socket.data.user;

      if (!user) {
        throw new CustomError("Authentication required.", 401);
      }

      // Verify user owns the device
      const device = await Device.findOne({
        imei: data.deviceImei,
        user: user.userId,
      });
      if (!device) {
        throw new CustomError(
          `Access denied to device ${data.deviceImei}.`,
          403
        );
      }

      console.log(
        `[Geofence] 🧪 Test event received from user ${user.email}:`,
        data
      );

      // Add timestamp if not provided
      const eventWithTimestamp = {
        ...data,
        timestamp: data.timestamp || Date.now(),
      };

      // Broadcast the test event
      this.broadcastGeofenceEvent(eventWithTimestamp);

      socket.emit("test_geofence_event_sent", {
        message: `Test ${data.type} event broadcasted for device ${data.deviceImei}`,
        event: eventWithTimestamp,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to send test event";
      const errorCode = error instanceof CustomError ? error.statusCode : 500;
      console.error(`[Geofence] ❌ Test event error: ${errorMessage}`);
      socket.emit("error", {
        message: "Failed to send test geofence event",
        details: errorMessage,
        code: errorCode,
      });
    }
  }
}
