import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { TelemetryService } from './TelemetryService';
import { Device } from '../models/Device';
import { 
  RealTimeTelemetryEvent, 
  WebSocketMessage, 
  DeviceConnection,
  TelemetryData,
  TelemetryPayload
} from '../types';
import { CustomError } from '../middleware/errorHandler';

export class RealTimeService {
  private io: SocketIOServer;
  private telemetryService: TelemetryService;
  private deviceConnections: Map<string, DeviceConnection> = new Map();
  private userRooms: Map<string, Set<string>> = new Map(); // email -> Set<socketId>

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    });
    this.telemetryService = new TelemetryService();
    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`🔌 Client connected: ${socket.id}`);

      // Handle device registration
      socket.on('register_device', async (data: { imei: string; userEmail?: string }) => {
        try {
          await this.registerDevice(socket, data.imei, data.userEmail);
        } catch (error) {
          socket.emit('error', { message: 'Failed to register device' });
        }
      });

      // Handle real-time telemetry ingestion
      socket.on('telemetry_data', async (payload: TelemetryPayload) => {
        try {
          await this.processRealTimeTelemetry(socket, payload);
        } catch (error) {
          socket.emit('error', { message: 'Failed to process telemetry data' });
        }
      });

      // Handle heartbeat
      socket.on('heartbeat', (data: { imei: string }) => {
        this.updateHeartbeat(data.imei, socket.id);
      });

      // Handle user subscription
      socket.on('subscribe_user', async (data: { email: string }) => {
        try {
          await this.subscribeUser(socket, data.email);
        } catch (error) {
          socket.emit('error', { message: 'Failed to subscribe user' });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        this.handleDisconnection(socket);
      });
    });
  }

  private async registerDevice(socket: Socket, imei: string, userEmail?: string) {
    // Verify device exists in database
    const device = await Device.findOne({ imei });
    if (!device) {
      throw new CustomError('Device not found', 404);
    }

    // Store connection info
    const connection: DeviceConnection = {
      imei,
      socketId: socket.id,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
      userEmail: userEmail || device.user.toString()
    };

    this.deviceConnections.set(imei, connection);

    // Join device room
    socket.join(`device:${imei}`);
    
    // Join user room if email provided
    if (userEmail) {
      socket.join(`user:${userEmail}`);
      this.addUserToRoom(userEmail, socket.id);
    }

    socket.emit('device_registered', { 
      imei, 
      message: 'Device registered successfully' 
    });

    console.log(`📱 Device registered: ${imei} (${socket.id})`);
  }

  private async processRealTimeTelemetry(socket: Socket, payload: TelemetryPayload) {
    const { imei } = payload;
    
    // Store in database
    const result = await this.telemetryService.ingestTelemetry(payload);
    
    // Get processed telemetry data
    const telemetryData = await this.telemetryService.getLatestTelemetry();
    
    if (telemetryData) {
      // Create real-time event
      const event: RealTimeTelemetryEvent = {
        type: 'telemetry_update',
        imei,
        timestamp: Date.now(),
        data: telemetryData
      };

      // Check for alerts
      const alert = this.checkForAlerts(telemetryData);
      if (alert) {
        event.type = alert.type as any;
        event.alert = alert;
      }

      // Broadcast to device room
      this.io.to(`device:${imei}`).emit('telemetry_update', event);

      // Broadcast to user room
      const connection = this.deviceConnections.get(imei);
      if (connection?.userEmail) {
        this.io.to(`user:${connection.userEmail}`).emit('telemetry_update', event);
      }

      // Broadcast to all connected clients (for dashboard)
      this.io.emit('telemetry_broadcast', event);

      console.log(`📊 Real-time telemetry: ${imei} - ${event.type}`);
    }

    socket.emit('telemetry_processed', result);
  }

  private checkForAlerts(telemetryData: TelemetryData): any {
    const alerts = [];

    // Battery alert
    if (telemetryData.externalVoltage && telemetryData.externalVoltage * 0.001 < 12.0) {
      alerts.push({
        type: 'vehicle_alert',
        level: 'warning',
        message: 'Low battery voltage detected',
        code: 'LOW_BATTERY'
      });
    }

    // Crash detection alert
    if (telemetryData.crashDetection && telemetryData.crashDetection > 0) {
      alerts.push({
        type: 'crash_detected',
        level: 'critical',
        message: 'Crash detected!',
        code: 'CRASH_DETECTED'
      });
    }

    // Engine RPM alert
    if (telemetryData.engineRpm && telemetryData.engineRpm > 4000) {
      alerts.push({
        type: 'vehicle_alert',
        level: 'warning',
        message: 'High engine RPM detected',
        code: 'HIGH_RPM'
      });
    }

    // DTC alert
    if (telemetryData.dtc && telemetryData.dtc > 0) {
      alerts.push({
        type: 'health_warning',
        level: 'warning',
        message: 'Diagnostic trouble code detected',
        code: 'DTC_DETECTED'
      });
    }

    return alerts.length > 0 ? alerts[0] : null;
  }

  private async subscribeUser(socket: Socket, email: string) {
    // Verify user has devices
    const devices = await Device.find({ user: email });
    if (devices.length === 0) {
      throw new CustomError('No devices found for user', 404);
    }

    // Join user room
    socket.join(`user:${email}`);
    this.addUserToRoom(email, socket.id);

    // Send current telemetry for all user devices
    const telemetries = await this.telemetryService.getTelemetryForUser(email);
    socket.emit('user_subscribed', { 
      email, 
      deviceCount: devices.length,
      telemetries 
    });

    console.log(`👤 User subscribed: ${email} (${socket.id})`);
  }

  private addUserToRoom(email: string, socketId: string) {
    if (!this.userRooms.has(email)) {
      this.userRooms.set(email, new Set());
    }
    this.userRooms.get(email)!.add(socketId);
  }

  private updateHeartbeat(imei: string, socketId: string) {
    const connection = this.deviceConnections.get(imei);
    if (connection && connection.socketId === socketId) {
      connection.lastHeartbeat = Date.now();
      this.deviceConnections.set(imei, connection);
    }
  }

  private handleDisconnection(socket: Socket) {
    // Remove from device connections
    for (const [imei, connection] of this.deviceConnections.entries()) {
      if (connection.socketId === socket.id) {
        this.deviceConnections.delete(imei);
        console.log(`📱 Device disconnected: ${imei}`);
        break;
      }
    }

    // Remove from user rooms
    for (const [email, socketIds] of this.userRooms.entries()) {
      if (socketIds.has(socket.id)) {
        socketIds.delete(socket.id);
        if (socketIds.size === 0) {
          this.userRooms.delete(email);
        }
        console.log(`👤 User disconnected: ${email}`);
        break;
      }
    }

    console.log(`🔌 Client disconnected: ${socket.id}`);
  }

  // Public methods for external use
  public getConnectedDevices(): DeviceConnection[] {
    return Array.from(this.deviceConnections.values());
  }

  public getConnectedUsers(): string[] {
    return Array.from(this.userRooms.keys());
  }

  public broadcastToDevice(imei: string, event: string, data: any) {
    this.io.to(`device:${imei}`).emit(event, data);
  }

  public broadcastToUser(email: string, event: string, data: any) {
    this.io.to(`user:${email}`).emit(event, data);
  }

  public broadcastToAll(event: string, data: any) {
    this.io.emit(event, data);
  }

  // Cleanup disconnected devices (run periodically)
  public cleanupDisconnectedDevices() {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes

    for (const [imei, connection] of this.deviceConnections.entries()) {
      if (now - connection.lastHeartbeat > timeout) {
        this.deviceConnections.delete(imei);
        console.log(`🧹 Cleaned up disconnected device: ${imei}`);
      }
    }
  }
} 