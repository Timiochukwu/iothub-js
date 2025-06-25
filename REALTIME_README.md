# Real-Time Telemetry System

This document describes the real-time telemetry system for the IoT Hub backend, which handles live data streaming from IoT devices using WebSocket connections.

## 🚀 Features

- **Real-time Data Streaming**: Live telemetry data from IoT devices
- **WebSocket Connections**: Bidirectional communication with devices and users
- **Automatic Alert Detection**: Real-time monitoring for vehicle alerts
- **Device Management**: Track connected devices and their status
- **User Subscriptions**: Users can subscribe to their device telemetry
- **Broadcast Capabilities**: Send messages to specific devices or all users

## 📡 WebSocket Events

### Device Events

#### `register_device`
Register a device for real-time communication.

```javascript
// Client -> Server
{
  "imei": "123456789012345",
  "userEmail": "user@example.com" // Optional
}

// Server -> Client
{
  "imei": "123456789012345",
  "message": "Device registered successfully"
}
```

#### `telemetry_data`
Send real-time telemetry data from device.

```javascript
// Client -> Server
{
  "imei": "123456789012345",
  "timestamp": 1703123456789,
  "data": {
    "engineRpm": 2500,
    "speed": 65,
    "fuelLevel": 75,
    "batteryVoltage": 12.5,
    "crashDetection": 0,
    "dtc": 0,
    "position": {
      "latitude": 40.7128,
      "longitude": -74.0060
    }
  }
}

// Server -> Client
{
  "success": true,
  "message": "Telemetry processed successfully"
}
```

#### `heartbeat`
Send periodic heartbeat to maintain connection.

```javascript
// Client -> Server
{
  "imei": "123456789012345"
}
```

### User Events

#### `subscribe_user`
Subscribe to real-time updates for user's devices.

```javascript
// Client -> Server
{
  "email": "user@example.com"
}

// Server -> Client
{
  "email": "user@example.com",
  "deviceCount": 2,
  "telemetries": [
    {
      "imei": "123456789012345",
      "data": { /* telemetry data */ }
    }
  ]
}
```

### Broadcast Events

#### `telemetry_update`
Real-time telemetry update broadcast.

```javascript
// Server -> Client
{
  "type": "telemetry_update",
  "imei": "123456789012345",
  "timestamp": 1703123456789,
  "data": {
    "engineRpm": 2500,
    "speed": 65,
    "fuelLevel": 75,
    "batteryVoltage": 12.5,
    "crashDetection": 0,
    "dtc": 0,
    "position": {
      "latitude": 40.7128,
      "longitude": -74.0060
    }
  }
}
```

#### `vehicle_alert`
Vehicle alert notification.

```javascript
// Server -> Client
{
  "type": "vehicle_alert",
  "imei": "123456789012345",
  "timestamp": 1703123456789,
  "data": { /* telemetry data */ },
  "alert": {
    "level": "warning",
    "message": "Low battery voltage detected",
    "code": "LOW_BATTERY"
  }
}
```

#### `crash_detected`
Crash detection alert.

```javascript
// Server -> Client
{
  "type": "crash_detected",
  "imei": "123456789012345",
  "timestamp": 1703123456789,
  "data": { /* telemetry data */ },
  "alert": {
    "level": "critical",
    "message": "Crash detected!",
    "code": "CRASH_DETECTED"
  }
}
```

## 🔌 WebSocket Connection

### Client Connection

```javascript
// Using Socket.IO client
import { io } from 'socket.io-client';

const socket = io('http://localhost:6162', {
  transports: ['websocket']
});

// Connection events
socket.on('connect', () => {
  console.log('Connected to WebSocket server');
});

socket.on('disconnect', () => {
  console.log('Disconnected from WebSocket server');
});

socket.on('error', (error) => {
  console.error('WebSocket error:', error);
});
```

### Device Connection Example

```javascript
// Register device
socket.emit('register_device', {
  imei: '123456789012345',
  userEmail: 'user@example.com'
});

// Send telemetry data
socket.emit('telemetry_data', {
  imei: '123456789012345',
  timestamp: Date.now(),
  data: {
    engineRpm: 2500,
    speed: 65,
    fuelLevel: 75,
    batteryVoltage: 12.5,
    crashDetection: 0,
    dtc: 0,
    position: {
      latitude: 40.7128,
      longitude: -74.0060
    }
  }
});

// Send heartbeat every 30 seconds
setInterval(() => {
  socket.emit('heartbeat', { imei: '123456789012345' });
}, 30000);
```

### User Connection Example

```javascript
// Subscribe to user updates
socket.emit('subscribe_user', {
  email: 'user@example.com'
});

// Listen for telemetry updates
socket.on('telemetry_update', (event) => {
  console.log('Telemetry update:', event);
});

// Listen for alerts
socket.on('vehicle_alert', (event) => {
  console.log('Vehicle alert:', event);
});

socket.on('crash_detected', (event) => {
  console.log('Crash detected:', event);
});
```

## 🛠️ API Endpoints

### Real-time Management

#### GET `/api/realtime/connections`
Get all active connections (requires authentication).

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:6162/api/realtime/connections
```

Response:
```json
{
  "success": true,
  "message": "Connection status retrieved successfully",
  "data": {
    "devices": [
      {
        "imei": "123456789012345",
        "socketId": "socket_id_123",
        "connectedAt": 1703123456789,
        "lastHeartbeat": 1703123456789,
        "userEmail": "user@example.com"
      }
    ],
    "users": ["user@example.com"],
    "totalConnections": 2,
    "timestamp": 1703123456789
  }
}
```

#### GET `/api/realtime/devices`
Get connected devices.

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:6162/api/realtime/devices
```

#### GET `/api/realtime/users`
Get connected users.

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:6162/api/realtime/users
```

#### POST `/api/realtime/broadcast`
Broadcast message to all connected clients.

```bash
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"event": "system_notification", "data": {"message": "System maintenance"}}' \
  http://localhost:6162/api/realtime/broadcast
```

#### POST `/api/realtime/device/:imei`
Send message to specific device.

```bash
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"event": "device_command", "data": {"command": "restart"}}' \
  http://localhost:6162/api/realtime/device/123456789012345
```

#### POST `/api/realtime/user/:email`
Send message to specific user.

```bash
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"event": "user_notification", "data": {"message": "Your device is offline"}}' \
  http://localhost:6162/api/realtime/user/user@example.com
```

## 🚨 Alert System

The real-time system automatically detects and broadcasts alerts based on telemetry data:

### Alert Types

1. **Low Battery** (`LOW_BATTERY`)
   - Triggered when battery voltage < 12.0V
   - Level: Warning

2. **Crash Detection** (`CRASH_DETECTED`)
   - Triggered when crash detection > 0
   - Level: Critical

3. **High Engine RPM** (`HIGH_RPM`)
   - Triggered when engine RPM > 4000
   - Level: Warning

4. **Diagnostic Trouble Code** (`DTC_DETECTED`)
   - Triggered when DTC > 0
   - Level: Warning

### Alert Structure

```javascript
{
  "type": "vehicle_alert" | "crash_detected" | "health_warning",
  "imei": "123456789012345",
  "timestamp": 1703123456789,
  "data": { /* telemetry data */ },
  "alert": {
    "level": "info" | "warning" | "critical",
    "message": "Alert description",
    "code": "ALERT_CODE"
  }
}
```

## 🔧 Configuration

### Environment Variables

```env
# WebSocket Configuration
FRONTEND_URL=http://localhost:3000

# Server Configuration
PORT=6162
NODE_ENV=development

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/iothub

# JWT Configuration
JWT_SECRET=your_jwt_secret
```

### Connection Management

- **Heartbeat Timeout**: 5 minutes
- **Cleanup Interval**: 5 minutes
- **Max Payload Size**: 10MB
- **CORS Origin**: Configurable via `FRONTEND_URL`

## 📊 Monitoring

### Health Check

```bash
curl http://localhost:6162/health
```

Response:
```json
{
  "status": "OK",
  "timestamp": "2023-12-21T10:30:45.789Z",
  "uptime": 3600.5,
  "connectedDevices": 5,
  "connectedUsers": 3
}
```

### Real-time Status

```bash
curl http://localhost:6162/api/realtime/status
```

## 🚀 Deployment

### Production Considerations

1. **Load Balancing**: Use sticky sessions for WebSocket connections
2. **Redis Adapter**: For horizontal scaling across multiple instances
3. **SSL/TLS**: Enable secure WebSocket connections (WSS)
4. **Rate Limiting**: Implement rate limiting for WebSocket events
5. **Monitoring**: Set up monitoring for connection counts and message rates

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 6162

CMD ["npm", "start"]
```

## 🔍 Troubleshooting

### Common Issues

1. **Connection Drops**
   - Check heartbeat implementation
   - Verify network stability
   - Monitor server resources

2. **High Memory Usage**
   - Check for memory leaks in event handlers
   - Monitor connection cleanup
   - Review payload sizes

3. **Authentication Issues**
   - Verify JWT token validity
   - Check user permissions
   - Review device registration

### Debug Mode

Enable debug logging by setting:

```env
DEBUG=socket.io:*
NODE_ENV=development
```

## 📚 Examples

### Complete Device Implementation

```javascript
import { io } from 'socket.io-client';

class IoTDevice {
  constructor(imei, userEmail) {
    this.imei = imei;
    this.userEmail = userEmail;
    this.socket = null;
    this.connected = false;
  }

  connect() {
    this.socket = io('http://localhost:6162', {
      transports: ['websocket']
    });

    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.connected = true;
      this.registerDevice();
      this.startHeartbeat();
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.connected = false;
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  registerDevice() {
    this.socket.emit('register_device', {
      imei: this.imei,
      userEmail: this.userEmail
    });
  }

  sendTelemetry(data) {
    if (this.connected) {
      this.socket.emit('telemetry_data', {
        imei: this.imei,
        timestamp: Date.now(),
        data: data
      });
    }
  }

  startHeartbeat() {
    setInterval(() => {
      if (this.connected) {
        this.socket.emit('heartbeat', { imei: this.imei });
      }
    }, 30000);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

// Usage
const device = new IoTDevice('123456789012345', 'user@example.com');
device.connect();

// Send telemetry data
setInterval(() => {
  device.sendTelemetry({
    engineRpm: Math.floor(Math.random() * 5000),
    speed: Math.floor(Math.random() * 120),
    fuelLevel: Math.floor(Math.random() * 100),
    batteryVoltage: 12 + Math.random() * 2,
    crashDetection: 0,
    dtc: 0,
    position: {
      latitude: 40.7128 + (Math.random() - 0.5) * 0.01,
      longitude: -74.0060 + (Math.random() - 0.5) * 0.01
    }
  });
}, 5000);
```

This real-time telemetry system provides a robust foundation for live IoT device monitoring and management, with automatic alert detection and scalable WebSocket communication. 