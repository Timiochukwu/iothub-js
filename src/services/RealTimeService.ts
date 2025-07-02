import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import * as jwt from "jsonwebtoken";
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
}
