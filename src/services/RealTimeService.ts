import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import { TelemetryService } from "./TelemetryService";
import { Device } from "../models/Device";
import {
  DeviceConnection,
  TelemetryData,
  TelemetryPayload,
  RealTimeTelemetryEvent,
  ApiResponse,
} from "../types";
import { CustomError } from "../middleware/errorHandler";

export class RealTimeService {
  private io: SocketIOServer;
  private telemetryService: TelemetryService;
  // In-memory maps to track live connections.
  private deviceConnections: Map<string, DeviceConnection> = new Map(); // Key: imei
  // NEW: Maps an IMEI to a set of sockets that are WATCHING it.
  private imeiWatchers: Map<string, Set<string>> = new Map(); // Key: imei, Value: Set of socketIds
  private userSockets: Map<string, Set<string>> = new Map(); // Key: user email, Value: Set of socketIds

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: [
          process.env.FRONTEND_URL || "http://localhost:3000",
          "http://localhost:6162",
        ],
        methods: ["GET", "POST"],
      },
    });

    this.telemetryService = new TelemetryService();
    this.setupSocketHandlers();
    console.log("✅ RealTimeService initialized with Socket.IO server.");
  }

  private setupSocketHandlers(): void {
    this.io.on("connection", (socket: Socket) => {
      console.log(`[Connection] 🔌 New client connected: ${socket.id}`);

      const { imei } = socket.handshake.auth;
      if (imei && typeof imei === "string") {
        this.handleDeviceAutoRegistration(socket, imei);
      } else {
        console.log(
          `[Connection] 👤 Client ${socket.id} is a watcher/browser. Waiting for events.`
        );
      }

      // --- Event Listeners for this specific socket ---
      socket.on("subscribe_to_device", (data) =>
        this.handleSubscribeToDevice(socket, data)
      );
      socket.on("get_real_time_telemetry", (data) =>
        this.handleGetRealTimeTelemetry(socket, data)
      );
      socket.on("telemetry_data", (payload) =>
        this.handleTelemetryData(socket, payload)
      );
      socket.on("disconnect", (reason) =>
        this.handleDisconnection(socket, reason)
      );
    });
  }

  private handleDeviceAutoRegistration(socket: Socket, imei: string): void {
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

  private async handleGetRealTimeTelemetry(
    socket: Socket,
    data: any
  ): Promise<void> {
    try {
      const { imei } = data;
      if (!imei) {
        throw new CustomError("IMEI is required to fetch telemetry.", 400);
      }

      if (!this.deviceConnections.has(imei)) {
        throw new CustomError("Device is not currently connected.", 404);
      }

      console.log(
        `[Telemetry Fetch] 🙋 Watcher ${socket.id} requesting data for device ${imei}.`
      );

      const telemetryData =
        await this.telemetryService.getDeviceLatestTelemetry(imei);
      if (!telemetryData) {
        throw new CustomError(
          "No telemetry data available for this device yet.",
          404
        );
      }

      console.log(
        `[Telemetry Fetch] 📡 Fetched latest telemetry for ${imei}:`,
        telemetryData
      );

      socket.emit("real_time_telemetry", { imei, data: telemetryData });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get telemetry";
      console.error(`[Telemetry Fetch] ❌ Error: ${errorMessage}`);
      socket.emit("error", {
        message: "Failed to get real-time telemetry",
        details: errorMessage,
      });
    }
  }

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

      // Broadcast the update to the room of watchers for this specific IMEI
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

  private handleSubscribeToDevice(socket: Socket, data: any): void {
    try {
      const { imei } = data;
      if (!imei)
        throw new CustomError("IMEI is required for subscription.", 400);

      const watchRoom = `watch:${imei}`;
      socket.join(watchRoom);

      if (!this.imeiWatchers.has(imei)) {
        this.imeiWatchers.set(imei, new Set());
      }
      this.imeiWatchers.get(imei)!.add(socket.id);

      console.log(
        `[Subscribe] 👤 Watcher ${socket.id} is now monitoring device ${imei} in room '${watchRoom}'.`
      );
      socket.emit("device_subscribed", {
        message: `Successfully subscribed to updates for IMEI ${imei}.`,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Subscription failed";
      console.error(
        `[Subscribe] ❌ Error for watcher subscription: ${errorMessage}`
      );
      socket.emit("error", {
        message: "Failed to subscribe to device",
        details: errorMessage,
      });
    }
  }

  private handleDisconnection(socket: Socket, reason: string): void {
    console.log(
      `[Connection] 🔌 Client disconnected: ${socket.id}. Reason: ${reason}`
    );

    // Check if the disconnected socket was a registered device
    const deviceEntry = Array.from(this.deviceConnections.entries()).find(
      ([, conn]) => conn.socketId === socket.id
    );
    if (deviceEntry) {
      this.deviceConnections.delete(deviceEntry[0]);
      console.log(
        `[Connection] 📱 Device ${deviceEntry[0]} connection removed.`
      );
    }

    // Check if the disconnected socket was a watcher and remove it from all watch lists
    this.imeiWatchers.forEach((socketIds, imei) => {
      if (socketIds.has(socket.id)) {
        socketIds.delete(socket.id);
        console.log(
          `[Connection] 👤 Watcher ${socket.id} unsubscribed from ${imei}.`
        );
        if (socketIds.size === 0) {
          this.imeiWatchers.delete(imei);
          console.log(
            `[Connection] ოთახი ${imei} has no more watchers. Room removed.`
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
