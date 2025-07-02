# 🚗 IoT Telemetry System - Node.js Implementation

This document describes the complete telemetry system implementation that matches the Java Spring Boot version.

## 📊 Overview

The telemetry system processes **OBD2 (On-Board Diagnostics) data** from IoT vehicle tracking devices. It extracts vehicle performance metrics from standard automotive diagnostic codes and provides real-time vehicle monitoring capabilities.

## 🔧 OBD2 Parameter IDs (PIDs)

The system processes these standard OBD2 codes:

| PID | Description | Unit | Example |
|-----|-------------|------|---------|
| `16` | Total Distance Traveled | km | 594,865 |
| `24` | Vehicle Speed | m/s | 67 |
| `30` | Number of DTCs | count | 0 |
| `31` | Engine Load | % | 31 |
| `36` | Engine RPM | rpm | 1,797 |
| `48` | Fuel Level | % | 14 |
| `58` | Engine Oil Temperature | °C | 29 |
| `66` | External Voltage | mV | 14,278 |
| `67` | Battery Voltage | mV | 4,098 |
| `247` | Crash Detection | code | 1 |

## 🏗️ Architecture

```
IoT Device → POST /api/telemetry/ingest → MongoDB → GET /api/telemetry/* → Frontend
```

### Data Flow:
1. **IoT Device** sends OBD2 data via HTTP POST
2. **Backend** processes and stores data in MongoDB
3. **Frontend** retrieves processed data via authenticated GET requests
4. **Real-time** vehicle monitoring and health assessment

## 📡 API Endpoints

### Data Ingestion (No Auth Required)
```http
POST /api/telemetry/ingest
Content-Type: application/json

{
  "imei": "123456789012345",
  "payload": {
    "state": {
      "reported": {
        "16": 594865,
        "36": 1797,
        "48": 14,
        "67": 4098,
        "ts": 1750705898000,
        "latlng": "6.431572,3.473048"
      }
    }
  }
}
```

### Data Retrieval (JWT Auth Required)

#### General Telemetry
- `GET /api/telemetry/all` - All telemetry records
- `GET /api/telemetry/latest` - Latest telemetry snapshot
- `GET /api/telemetry/user?email=user@example.com` - User-specific telemetry

#### Vehicle Metrics
- `GET /api/telemetry/tire-pressure` - Tire pressure status
- `GET /api/telemetry/position` - GPS coordinates
- `GET /api/telemetry/speed-info` - Current speed
- `GET /api/telemetry/battery-voltage` - Battery status
- `GET /api/telemetry/fuel` - Fuel level
- `GET /api/telemetry/engine-rpm` - Engine RPM
- `GET /api/telemetry/engine-oil-temp` - Oil temperature
- `GET /api/telemetry/crash` - Crash detection status
- `GET /api/telemetry/engine-load` - Engine load percentage
- `GET /api/telemetry/dtc` - Diagnostic trouble codes
- `GET /api/telemetry/power-stats` - Battery & alternator stats
- `GET /api/telemetry/mileage` - Total distance traveled
- `GET /api/telemetry/vehicle-health` - Overall vehicle health

## 🗄️ Database Schema

### Telemetry Collection
```typescript
interface ITelemetry {
  imei: string;           // Device identifier
  timestamp: number;      // Unix timestamp
  tirePressure?: number;  // PSI
  speed?: number;         // m/s
  latlng?: string;        // "lat,lng"
  altitude?: number;      // meters
  angle?: number;         // degrees
  satellites?: number;    // GPS satellites
  event?: number;         // Event code
  battery?: number;       // mV
  fuelLevel?: number;     // %
  engineRpm?: number;     // RPM
  engineOilTemp?: number; // °C
  crashDetection?: number; // Code
  engineLoad?: number;    // %
  dtc?: number;           // Diagnostic code
  externalVoltage?: number; // mV
  totalMileage?: number;  // km
  createdAt: Date;
  updatedAt: Date;
}
```

## 🔍 Business Logic

### Vehicle Health Assessment
- **Battery Health**: Good (≥13.0V), Fair (≥12.4V), Bad (<12.4V)
- **Engine Health**: Idle (<600 RPM), Normal (600-4000 RPM), High Load (>4000 RPM)
- **Crash Detection**: 6 different crash detection states
- **DTC Monitoring**: Real-time diagnostic trouble code tracking

### Data Processing
- **Unit Conversion**: mV to V, raw values to meaningful units
- **Timestamp Formatting**: Unix to human-readable format
- **Message Generation**: Context-aware status messages
- **Data Validation**: Safe number conversion and null handling

## 🚀 Usage Examples

### 1. Send Telemetry Data
```bash
curl -X POST http://localhost:6162/api/telemetry/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "imei": "123456789012345",
    "payload": {
      "state": {
        "reported": {
          "16": 594865,
          "36": 1797,
          "48": 14,
          "67": 4098,
          "ts": 1750705898000,
          "latlng": "6.431572,3.473048"
        }
      }
    }
  }'
```

### 2. Get Vehicle Health
```bash
curl -X GET http://localhost:6162/api/telemetry/vehicle-health \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 3. Get Latest Battery Status
```bash
curl -X GET http://localhost:6162/api/telemetry/battery-voltage \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🔐 Security

- **Data Ingestion**: No authentication required (IoT devices)
- **Data Retrieval**: JWT token authentication required
- **Input Validation**: Comprehensive request validation
- **Error Handling**: Graceful error responses
- **Rate Limiting**: Built-in request throttling

## 📈 Performance Features

- **Database Indexing**: Optimized queries on IMEI and timestamp
- **Efficient Queries**: Latest data retrieval with proper sorting
- **Memory Management**: Safe data conversion and null handling
- **Response Caching**: Ready for Redis integration

## 🧪 Testing

### Test Data Ingestion
```bash
# Test with sample OBD2 data
curl -X POST http://localhost:6162/api/telemetry/ingest \
  -H "Content-Type: application/json" \
  -d @test-telemetry.json
```

### Test Data Retrieval
```bash
# Get all telemetry
curl -X GET http://localhost:6162/api/telemetry/all \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get specific metrics
curl -X GET http://localhost:6162/api/telemetry/speed-info \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🔄 Migration from Java

This Node.js implementation provides **100% compatibility** with the Java version:

✅ **Same OBD2 PID processing**  
✅ **Identical API endpoints**  
✅ **Matching response formats**  
✅ **Same business logic**  
✅ **Equivalent error handling**  
✅ **Database schema compatibility**  

## 🎯 Key Features

- **Real-time Processing**: Instant OBD2 data ingestion
- **Vehicle Monitoring**: Comprehensive vehicle health tracking
- **Fleet Management**: Multi-device support with IMEI tracking
- **Diagnostic Support**: DTC monitoring and crash detection
- **Performance Metrics**: Speed, RPM, fuel, battery monitoring
- **GPS Tracking**: Location and movement tracking
- **Health Assessment**: Automated vehicle health evaluation

## 🚀 Next Steps

1. **Deploy** the Node.js backend
2. **Configure** IoT devices to send data to `/api/telemetry/ingest`
3. **Test** with real vehicle data
4. **Monitor** vehicle health in real-time
5. **Scale** for fleet management

---

**🎉 Your IoT telemetry system is now ready for production!** 