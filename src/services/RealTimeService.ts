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
import { Geofence } from '../models/Geofence';
import { GeofenceEvent } from '../models/GeofenceEvent';

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
          console.log('🔍 Attempting to register device:', data);
          await this.registerDevice(socket, data.imei, data.userEmail);
        } catch (error) {
          console.error('❌ Device registration error:', error);
          socket.emit('error', { 
            message: 'Failed to register device',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

    

      socket.on('telemetry_data', async (payload: TelemetryPayload) => {
        try {
          // Validate payload structure
          if (!this.validateTelemetryPayload(payload)) {
            socket.emit('error', { 
              code: 'INVALID_PAYLOAD', 
              message: 'Invalid telemetry payload structure' 
            });
            return;
          }
          
          await this.processRealTimeTelemetry(socket, payload);
        } catch (error) {
          console.error(`Telemetry processing error for ${payload.imei}:`, error);
          socket.emit('error', { 
            code: 'PROCESSING_ERROR',
            message: 'Failed to process telemetry data',
            details: error instanceof CustomError ? error.message : 'Internal error'
          });
        }
      });

      

      // Handle heartbeat
      socket.on('heartbeat', (data: { imei: string }) => {
        this.updateHeartbeat(data.imei, socket.id);
      });

      // Handle user subscription
      socket.on('subscribe_user', async (data: { email: string }) => {
        try {
          console.log('🔍 Attempting to subscribe user:', data);
          await this.subscribeUser(socket, data.email);
        } catch (error) {
          console.error('❌ User subscription error:', error);
          socket.emit('error', { 
            message: 'Failed to subscribe user',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        this.handleDisconnection(socket);
      });
    });
  }

  private validateTelemetryPayload(payload: TelemetryPayload): boolean {
    return !!(
      payload &&
      payload.imei &&
      payload.payload &&
      payload.payload.state &&
      payload.payload.state.reported
    );
  }

  private async registerDevice(socket: Socket, imei: string, userEmail?: string) {
    console.log('🔍 Looking for device with IMEI:', imei);
    
    try {
      // Test database connection
      const device = await Device.findOne({ imei });
      console.log('🔍 Device query result:', device ? 'Found' : 'Not found');
      
      if (!device) {
        console.log('❌ Device not found in database');
        throw new CustomError('Device not found', 404);
      }
      
      console.log('✅ Device found:', { imei: device.imei, user: device.user });
      
      // Rest of your existing code...
    } catch (dbError) {
      console.error('❌ Database error:', dbError);
      throw dbError;
    }
  }

  private async processRealTimeTelemetry(socket: Socket, payload: TelemetryPayload) {
    const { imei } = payload;
  
  try {
    console.log('🔄 Processing telemetry for IMEI:', imei);
    
    // Store in database
    console.log('💾 Storing in database...');
    const result = await this.telemetryService.ingestTelemetry(payload);
    console.log('✅ Database storage completed:', result);
    
    // Get processed telemetry data
    console.log('📊 Fetching latest telemetry...');
    const telemetryData = await this.telemetryService.getLatestTelemetry();
    console.log('✅ Latest telemetry fetched:', telemetryData ? 'Found' : 'Not found');
    
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

      // --- Real-time car state event ---
      const carState = (telemetryData.engineRpm && telemetryData.engineRpm > 0) || (telemetryData.speed && telemetryData.speed > 0) ? 'on' : 'off';
      const carStatePayload = {
        imei,
        state: carState,
        engineRpm: telemetryData.engineRpm,
        speed: telemetryData.speed,
        timestamp: telemetryData.timestamp
      };
      this.io.to(`device:${imei}`).emit('car_state_changed', carStatePayload);
      if (connection?.userEmail) {
        this.io.to(`user:${connection.userEmail}`).emit('car_state_changed', carStatePayload);
      }

      // --- Real-time location event ---
      if (telemetryData.latlng) {
        const locationPayload = {
          imei,
          latlng: telemetryData.latlng,
          timestamp: telemetryData.timestamp,
          altitude: telemetryData.altitude,
          angle: telemetryData.angle
        };
        this.io.to(`device:${imei}`).emit('location_changed', locationPayload);
        if (connection?.userEmail) {
          this.io.to(`user:${connection.userEmail}`).emit('location_changed', locationPayload);
        }
      }

      // --- Geofence entry/exit detection ---
      if (telemetryData && telemetryData.latlng) {
        const [latStr, lngStr] = telemetryData.latlng.split(',');
        if (typeof latStr === 'string' && typeof lngStr === 'string') {
          const lat = parseFloat(latStr);
          const lng = parseFloat(lngStr);
          if (!isNaN(lat) && !isNaN(lng)) {
            const geofences = await Geofence.find({ $or: [
              { deviceImei: imei },
              { userEmail: connection?.userEmail },
              { deviceImei: { $exists: false } },
              { userEmail: { $exists: false } }
            ] });
            for (const geofence of geofences) {
              if (!geofence._id) continue; // skip if _id is null
              let inside = false;
              if (geofence.type === 'circle' && geofence.center && geofence.radius) {
                inside = haversineDistance(lat, lng, geofence.center.lat, geofence.center.lng) <= geofence.radius;
              } else if (geofence.type === 'polygon' && geofence.coordinates) {
                inside = pointInPolygon({ lat, lng }, geofence.coordinates);
              }
              const geofenceId = typeof geofence._id === 'object' && 'toString' in geofence._id
                ? geofence._id.toString()
                : String(geofence._id);
              const deviceState = lastGeofenceState[imei] = lastGeofenceState[imei] || {};
              const prevInside = deviceState[geofenceId] || false;
              if (inside !== prevInside) {
                // State changed: entry or exit
                const eventType = inside ? 'entry' : 'exit';
                // Store event
                await GeofenceEvent.create({
                  imei,
                  geofenceId: geofence._id,
                  type: eventType,
                  timestamp: telemetryData.timestamp,
                  latlng: telemetryData.latlng,
                  altitude: telemetryData.altitude,
                  angle: telemetryData.angle
                });
                // Emit event
                const geofenceEventPayload = {
                  imei,
                  geofenceId: geofence._id,
                  type: eventType,
                  timestamp: telemetryData.timestamp,
                  latlng: telemetryData.latlng,
                  altitude: telemetryData.altitude,
                  angle: telemetryData.angle
                };
                this.io.to(`device:${imei}`).emit('geofence_' + eventType, geofenceEventPayload);
                if (connection?.userEmail) {
                  this.io.to(`user:${connection.userEmail}`).emit('geofence_' + eventType, geofenceEventPayload);
                }
              }
              deviceState[geofenceId] = inside;
            }
          }
        }
      }

      console.log(`📊 Real-time telemetry: ${imei} - ${event.type}`);
    }

    socket.emit('telemetry_processed', result);
  } catch (error) {
    console.error('❌ Error in processRealTimeTelemetry:', error);
    throw error; // Re-throw to be caught by caller
  }
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

// Helper functions for geofence checks
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371000; // meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function pointInPolygon(point: { lat: number; lng: number }, polygon: Array<{ lat: number; lng: number }>) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (!pi || !pj || pi.lat == null || pi.lng == null || pj.lat == null || pj.lng == null) continue;
    const xi = pi.lat, yi = pi.lng;
    const xj = pj.lat, yj = pj.lng;
    const intersect = ((yi > point.lng) !== (yj > point.lng)) &&
      (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi + 0.0000001) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// In-memory cache for last geofence state per device/geofence
const lastGeofenceState: Record<string, Record<string, boolean>> = {}; 