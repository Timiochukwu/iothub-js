# IoT Hub Backend

A comprehensive IoT backend system for vehicle telemetry and fleet management, built with Node.js, TypeScript, and MongoDB.

## 🚀 Features

- **User Authentication & Authorization**: JWT-based authentication with email verification
- **Device Management**: Register and manage IoT devices with detailed vehicle information
- **Real-time Telemetry**: Live data streaming via WebSocket connections
- **OBD2 Data Processing**: Comprehensive vehicle diagnostic data handling
- **Alert System**: Real-time monitoring and alert detection
- **Fleet Management**: Multi-device support with user associations
- **RESTful API**: Complete CRUD operations for all entities
- **Data Validation**: Robust input validation and error handling

## 📡 Real-time Features

- **WebSocket Support**: Bidirectional communication with devices and users
- **Live Telemetry**: Real-time vehicle data streaming
- **Automatic Alerts**: Battery, crash, engine, and health monitoring
- **Device Tracking**: Connection status and heartbeat monitoring
- **User Subscriptions**: Real-time updates for device owners
- **Broadcast Capabilities**: Send messages to specific devices or all users

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   IoT Devices   │    │   Web Clients   │    │   Mobile Apps   │
│   (OBD2 Data)   │    │   (Dashboard)   │    │   (Real-time)   │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────┴─────────────┐
                    │    WebSocket Server       │
                    │   (Real-time Service)     │
                    └─────────────┬─────────────┘
                                 │
                    ┌─────────────┴─────────────┐
                    │    Express API Server     │
                    │   (REST Endpoints)        │
                    └─────────────┬─────────────┘
                                 │
                    ┌─────────────┴─────────────┐
                    │      MongoDB Database     │
                    │   (Telemetry Storage)     │
                    └───────────────────────────┘
```

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Real-time**: Socket.IO
- **Authentication**: JWT
- **Validation**: Joi
- **Email**: Nodemailer
- **Testing**: Jest

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd iothub-js
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   
   Configure your `.env` file:
   ```env
   # Server Configuration
   PORT=6162
   NODE_ENV=development
   
   # Database Configuration
   MONGODB_URI=mongodb://localhost:27017/iothub
   
   # JWT Configuration
   JWT_SECRET=your_jwt_secret_here
   JWT_EXPIRES_IN=24h
   
   # Email Configuration
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_app_password
   
   # WebSocket Configuration
   FRONTEND_URL=http://localhost:3000
   ```

4. **Start the server**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## 🔌 Real-time Testing

### Quick Test
Run the real-time telemetry test:

```bash
node test-realtime.js
```

This will:
- Connect a simulated IoT device
- Connect a user client
- Send real-time telemetry data
- Display live updates and alerts

### Manual Testing
1. Start the server: `npm run dev`
2. Open browser console or use a WebSocket client
3. Connect to: `ws://localhost:6162`
4. Follow the WebSocket events in `REALTIME_README.md`

## 📚 API Documentation

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/verify-email` - Email verification

### Devices
- `GET /api/devices` - Get user devices
- `POST /api/devices` - Register new device
- `GET /api/devices/:id` - Get device details
- `PUT /api/devices/:id` - Update device
- `DELETE /api/devices/:id` - Delete device

### Telemetry
- `POST /api/telemetry/ingest` - Ingest telemetry data
- `GET /api/telemetry/latest` - Get latest telemetry
- `GET /api/telemetry/history` - Get telemetry history
- `GET /api/telemetry/vehicle-health` - Get vehicle health
- `GET /api/telemetry/position` - Get current position

### Real-time Management
- `GET /api/realtime/connections` - Get active connections
- `GET /api/realtime/devices` - Get connected devices
- `GET /api/realtime/users` - Get connected users
- `POST /api/realtime/broadcast` - Broadcast message
- `POST /api/realtime/device/:imei` - Send to device
- `POST /api/realtime/user/:email` - Send to user

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `POST /api/users/change-password` - Change password

## 🔌 WebSocket Events

### Device Events
- `register_device` - Register device for real-time communication
- `telemetry_data` - Send real-time telemetry data
- `heartbeat` - Send periodic heartbeat

### User Events
- `subscribe_user` - Subscribe to device updates

### Broadcast Events
- `telemetry_update` - Real-time telemetry updates
- `vehicle_alert` - Vehicle alert notifications
- `crash_detected` - Crash detection alerts

## 📊 Data Models

### Telemetry Data Structure
```typescript
{
  imei: string;
  timestamp: number;
  data: {
    engineRpm: number;
    speed: number;
    fuelLevel: number;
    batteryVoltage: number;
    crashDetection: number;
    dtc: number;
    position: {
      latitude: number;
      longitude: number;
    };
    // ... additional OBD2 parameters
  };
}
```

### Device Structure
```typescript
{
  imei: string;
  user: string;
  vehicleInfo: {
    make: string;
    model: string;
    year: number;
    vin: string;
  };
  status: 'active' | 'inactive';
  lastSeen: Date;
}
```

## 🚨 Alert System

The system automatically detects and broadcasts alerts:

- **Low Battery**: Battery voltage < 12.0V
- **Crash Detection**: Crash sensor triggered
- **High Engine RPM**: Engine RPM > 4000
- **Diagnostic Trouble Codes**: DTC > 0

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## 📖 Documentation

- [API Documentation](API.md) - Complete API reference
- [Real-time System](REALTIME_README.md) - WebSocket and real-time features
- [Telemetry System](TELEMETRY_README.md) - OBD2 data processing
- [Postman Collection](IoT_Hub_API.postman_collection.json) - API testing

## 🚀 Deployment

### Docker
```bash
# Build image
docker build -t iothub-backend .

# Run container
docker run -p 6162:6162 iothub-backend
```

### Environment Variables
Ensure all required environment variables are set in production:
- `MONGODB_URI`
- `JWT_SECRET`
- `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASS`
- `FRONTEND_URL`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Check the documentation
- Review the test files
- Open an issue on GitHub

---

**Note**: This is a conversion from a Java Spring Boot project to Node.js TypeScript, maintaining full compatibility with the original OBD2 telemetry system while adding modern real-time capabilities. 