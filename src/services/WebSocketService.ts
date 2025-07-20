// src/services/WebSocketService.ts
import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import jwt from "jsonwebtoken";
import { GeofenceService } from "./GeofenceService";
import { IGeofence } from "../models/Geofence";
import { Notification from "../models/Notification";}
import { User } from "../models/User";

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
  deviceImei?: string;
}

export interface LocationUpdate {
  imei: string;
  lat: number;
  lng: number;
  timestamp: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
}

export interface GeofenceAlert {
  type: "entry" | "exit";
  device: {
    imei: string;
    name?: string;
  };
  geofence: {
    id: string;
    name: string;
    type: "circle" | "polygon";
    color?: string;
  };
  location: {
    lat: number;
    lng: number;
  };
  timestamp: number;
}

export interface WebSocketEvents {
  // Client to Server
  "join:user": (userEmail: string) => void;
  "join:device": (deviceImei: string) => void;
  "location:update": (data: LocationUpdate) => void;
  "geofence:test": (data: {
    geofenceId: string;
    location: { lat: number; lng: number };
  }) => void;

  // Server to Client
  "geofence:alert": (data: GeofenceAlert) => void;
  "geofence:created": (data: IGeofence) => void;
  "geofence:updated": (data: IGeofence) => void;
  "geofence:deleted": (data: { id: string; name: string }) => void;
  "geofence:toggled": (data: {
    id: string;
    name: string;
    isActive: boolean;
  }) => void;
  "device:location": (data: LocationUpdate) => void;
  "device:online": (data: { imei: string; timestamp: number }) => void;
  "device:offline": (data: { imei: string; timestamp: number }) => void;
  error: (data: { message: string; code?: string }) => void;
  success: (data: { message: string; data?: any }) => void;
}

export class WebSocketService {
  private io: SocketIOServer;
  private geofenceService: GeofenceService;
  private connectedClients: Map<string, AuthenticatedSocket[]> = new Map();
  private deviceLocations: Map<string, LocationUpdate> = new Map();
  private deviceLastSeen: Map<string, number> = new Map();
  private readonly OFFLINE_THRESHOLD = 30000; // 30 seconds

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
    });

    this.geofenceService = new GeofenceService();
    this.setupMiddleware();
    this.setupEventHandlers();
    this.startOfflineChecker();
  }

  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token =
          socket.handshake.auth.token ||
          socket.handshake.headers.authorization?.split(" ")[1];

        if (!token) {
          return next(new Error("Authentication token required"));
        }

        const decoded = jwt.verify(
          token,
          process.env.JWT_SECRET || "your-secret-key"
        ) as any;

        socket.userId = decoded.userId;
        socket.userEmail = decoded.email;
        socket.deviceImei = decoded.deviceImei; // For device connections

        next();
      } catch (error) {
        next(new Error("Invalid authentication token"));
      }
    });

    // Rate limiting middleware
    this.io.use((socket, next) => {
      const rateLimitMap = new Map<string, number[]>();
      const maxRequests = 100;
      const windowMs = 60000; // 1 minute

      const now = Date.now();
      const requests = rateLimitMap.get(socket.id) || [];
      const recentRequests = requests.filter((time) => now - time < windowMs);

      if (recentRequests.length >= maxRequests) {
        return next(new Error("Rate limit exceeded"));
      }

      recentRequests.push(now);
      rateLimitMap.set(socket.id, recentRequests);
      next();
    });
  }

  private setupEventHandlers(): void {
    this.io.on("connection", (socket: AuthenticatedSocket) => {
      console.log(
        `Client connected: ${socket.id} (User: ${socket.userEmail}, Device: ${socket.deviceImei})`
      );

      // Handle user room joining
      socket.on("join:user", (userEmail: string) => {
        if (socket.userEmail !== userEmail) {
          socket.emit("error", {
            message: "Unauthorized to join this user room",
            code: "UNAUTHORIZED",
          });
          return;
        }

        socket.join(`user:${userEmail}`);
        this.addClientToRoom(`user:${userEmail}`, socket);

        socket.emit("success", { message: `Joined user room: ${userEmail}` });
        console.log(`Socket ${socket.id} joined user room: ${userEmail}`);
      });

      // Handle device room joining
      socket.on("join:device", (deviceImei: string) => {
        socket.join(`device:${deviceImei}`);
        this.addClientToRoom(`device:${deviceImei}`, socket);

        socket.emit("success", {
          message: `Joined device room: ${deviceImei}`,
        });
        console.log(`Socket ${socket.id} joined device room: ${deviceImei}`);
      });

      // Handle location updates from devices
      socket.on("location:update", async (data: LocationUpdate) => {
        try {
          // Validate location data
          if (!this.isValidLocation(data)) {
            socket.emit("error", {
              message: "Invalid location data",
              code: "INVALID_LOCATION",
            });
            return;
          }

          // Store location and update last seen
          this.deviceLocations.set(data.imei, data);
          this.deviceLastSeen.set(data.imei, Date.now());

          // Broadcast location to device room
          this.io.to(`device:${data.imei}`).emit("device:location", data);

          // Check geofences for this location
          await this.checkGeofences(data);

          // Mark device as online if it was offline
          if (!this.deviceLastSeen.has(data.imei)) {
            this.io.to(`device:${data.imei}`).emit("device:online", {
              imei: data.imei,
              timestamp: Date.now(),
            });
          }
        } catch (error) {
          console.error("Error processing location update:", error);
          socket.emit("error", {
            message: "Failed to process location update",
            code: "LOCATION_ERROR",
          });
        }
      });

      // Handle geofence testing
      socket.on(
        "geofence:test",
        async (data: {
          geofenceId: string;
          location: { lat: number; lng: number };
        }) => {
          try {
            const geofence = await this.geofenceService.getGeofenceById(
              data.geofenceId
            );
            if (!geofence) {
              socket.emit("error", {
                message: "Geofence not found",
                code: "NOT_FOUND",
              });
              return;
            }

            const isInside = this.isPointInGeofence(
              data.location.lat,
              data.location.lng,
              geofence
            );

            socket.emit("success", {
              message: `Point is ${isInside ? "inside" : "outside"} geofence`,
              data: { isInside, geofence: geofence.name },
            });
          } catch (error) {
            console.error("Error testing geofence:", error);
            socket.emit("error", {
              message: "Failed to test geofence",
              code: "TEST_ERROR",
            });
          }
        }
      );

      // Handle disconnection
      socket.on("disconnect", (reason) => {
        console.log(`Client disconnected: ${socket.id} (Reason: ${reason})`);
        this.removeClientFromAllRooms(socket);
      });

      // Handle connection errors
      socket.on("error", (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
      });
    });
  }

  // Check if location triggers any geofences
  private async checkGeofences(location: LocationUpdate): Promise<void> {
    try {
      const geofences = await this.geofenceService.getActiveGeofencesForDevice(
        location.imei
      );

      for (const geofence of geofences) {
        const isInside = this.isPointInGeofence(
          location.lat,
          location.lng,
          geofence
        );
        const wasInside = this.wasDeviceInGeofence(
          location.imei,
          geofence._id.toString()
        );

        // Check for entry
        if (isInside && !wasInside && geofence.alertOnEntry) {
          await this.handleGeofenceEvent("entry", location, geofence);
        }

        // Check for exit
        if (!isInside && wasInside && geofence.alertOnExit) {
          await this.handleGeofenceEvent("exit", location, geofence);
        }

        // Update device state
        this.updateDeviceGeofenceState(
          location.imei,
          geofence._id.toString(),
          isInside
        );
      }
    } catch (error) {
      console.error("Error checking geofences:", error);
    }
  }

  // Handle geofence entry/exit events
  private async handleGeofenceEvent(
    type: "entry" | "exit",
    location: LocationUpdate,
    geofence: IGeofence
  ): Promise<void> {
    try {
      // Create alert data
      const alert: GeofenceAlert = {
        type,
        device: {
          imei: location.imei,
          name: `Device ${location.imei}`, // You might want to get actual device name
        },
        geofence: {
          id: geofence._id.toString(),
          name: geofence.name,
          type: geofence.type,
          color: geofence.color,
        },
        location: {
          lat: location.lat,
          lng: location.lng,
        },
        timestamp: location.timestamp,
      };

      // get user date 
      const user = await User.findOne({ email: geofence.userEmail });
      if (!user) {
        console.error(`User not found for geofence ${geofence._id}`);
        return;
      }

      // if (type === "entry") {
      const message = `Device ${location.imei} ${type === "entry" ? "entered" : "exited"} geofence ${geofence.name}`;
        Notification.create({
          user: user._id,
          data: {
            geofence: {
              id: geofence._id.toString(),
              name: geofence.name,
              type: geofence.type,
              color: geofence.color,
            },
            location: {
              lat: location.lat,
              lng: location.lng,
            },
          },
          message,
          type: "geofence_alert",
          read: false,
          timestamp: location.timestamp,
        });
      // }

      // Emit to device room
      this.io.to(`device:${location.imei}`).emit("geofence:alert", alert);

      // Emit to user room if geofence has userEmail
      if (geofence.userEmail) {
        this.io.to(`user:${geofence.userEmail}`).emit("geofence:alert", alert);
      }

      console.log(
        `Geofence ${type} alert: Device ${location.imei} ${type === "entry" ? "entered" : "exited"} ${geofence.name}`
      );
    } catch (error) {
      console.error("Error handling geofence event:", error);
    }
  }

  // Geofence CRUD event notifications
  public notifyGeofenceCreated(geofence: IGeofence): void {
    this.io.to(`user:${geofence.userEmail}`).emit("geofence:created", geofence);
    if (geofence.deviceImei) {
      this.io
        .to(`device:${geofence.deviceImei}`)
        .emit("geofence:created", geofence);
    }
  }

  public notifyGeofenceUpdated(geofence: IGeofence): void {
    this.io.to(`user:${geofence.userEmail}`).emit("geofence:updated", geofence);
    if (geofence.deviceImei) {
      this.io
        .to(`device:${geofence.deviceImei}`)
        .emit("geofence:updated", geofence);
    }
  }

  public notifyGeofenceDeleted(
    geofenceId: string,
    name: string,
    userEmail?: string,
    deviceImei?: string
  ): void {
    const deleteData = { id: geofenceId, name };

    if (userEmail) {
      this.io.to(`user:${userEmail}`).emit("geofence:deleted", deleteData);
    }
    if (deviceImei) {
      this.io.to(`device:${deviceImei}`).emit("geofence:deleted", deleteData);
    }
  }

  public notifyGeofenceToggled(
    geofenceId: string,
    name: string,
    isActive: boolean,
    userEmail?: string,
    deviceImei?: string
  ): void {
    const toggleData = { id: geofenceId, name, isActive };

    if (userEmail) {
      this.io.to(`user:${userEmail}`).emit("geofence:toggled", toggleData);
    }
    if (deviceImei) {
      this.io.to(`device:${deviceImei}`).emit("geofence:toggled", toggleData);
    }
  }

  // Utility methods
  private isValidLocation(location: LocationUpdate): boolean {
    return (
      location &&
      typeof location.lat === "number" &&
      typeof location.lng === "number" &&
      typeof location.imei === "string" &&
      typeof location.timestamp === "number" &&
      location.lat >= -90 &&
      location.lat <= 90 &&
      location.lng >= -180 &&
      location.lng <= 180 &&
      location.imei.length > 0
    );
  }

  private isPointInGeofence(
    lat: number,
    lng: number,
    geofence: IGeofence
  ): boolean {
    if (geofence.type === "circle" && geofence.center && geofence.radius) {
      return this.geofenceService.isPointInCircle(
        lat,
        lng,
        geofence.center.lat,
        geofence.center.lng,
        geofence.radius
      );
    } else if (geofence.type === "polygon" && geofence.coordinates) {
      return this.geofenceService.isPointInPolygon(
        lat,
        lng,
        geofence.coordinates
      );
    }
    return false;
  }

  private deviceGeofenceStates: Map<string, Set<string>> = new Map();

  private wasDeviceInGeofence(imei: string, geofenceId: string): boolean {
    const deviceStates = this.deviceGeofenceStates.get(imei) || new Set();
    return deviceStates.has(geofenceId);
  }

  private updateDeviceGeofenceState(
    imei: string,
    geofenceId: string,
    isInside: boolean
  ): void {
    if (!this.deviceGeofenceStates.has(imei)) {
      this.deviceGeofenceStates.set(imei, new Set());
    }

    const deviceStates = this.deviceGeofenceStates.get(imei)!;
    if (isInside) {
      deviceStates.add(geofenceId);
    } else {
      deviceStates.delete(geofenceId);
    }
  }

  private addClientToRoom(room: string, socket: AuthenticatedSocket): void {
    if (!this.connectedClients.has(room)) {
      this.connectedClients.set(room, []);
    }
    this.connectedClients.get(room)!.push(socket);
  }

  private removeClientFromAllRooms(socket: AuthenticatedSocket): void {
    this.connectedClients.forEach((clients, room) => {
      const index = clients.indexOf(socket);
      if (index !== -1) {
        clients.splice(index, 1);
        if (clients.length === 0) {
          this.connectedClients.delete(room);
        }
      }
    });
  }

  private startOfflineChecker(): void {
    setInterval(() => {
      const now = Date.now();

      this.deviceLastSeen.forEach((lastSeen, imei) => {
        if (now - lastSeen > this.OFFLINE_THRESHOLD) {
          this.io.to(`device:${imei}`).emit("device:offline", {
            imei,
            timestamp: now,
          });
          this.deviceLastSeen.delete(imei);
          this.deviceLocations.delete(imei);
        }
      });
    }, 10000); // Check every 10 seconds
  }

  // Get connected clients info
  public getConnectedClients(): { room: string; count: number }[] {
    const result: { room: string; count: number }[] = [];
    this.connectedClients.forEach((clients, room) => {
      result.push({ room, count: clients.length });
    });
    return result;
  }

  // Get device locations
  public getDeviceLocations(): Map<string, LocationUpdate> {
    return new Map(this.deviceLocations);
  }

  // Broadcast to all connected clients
  public broadcast(event: string, data: any): void {
    this.io.emit(event, data);
  }

  // Send to specific room
  public sendToRoom(room: string, event: string, data: any): void {
    this.io.to(room).emit(event, data);
  }
}
