const { io } = require('socket.io-client');

// Test configuration
const SERVER_URL = 'http://localhost:6162';
const TEST_IMEI = '123456789012345';
const TEST_EMAIL = 'test@example.com';

console.log('🚀 Starting Real-time Telemetry Test...\n');

// Create device socket
const deviceSocket = io(SERVER_URL, {
  transports: ['websocket']
});

// Create user socket
const userSocket = io(SERVER_URL, {
  transports: ['websocket']
});

// Device connection events
deviceSocket.on('connect', () => {
  console.log('📱 Device connected to server');
  
  // Register device
  deviceSocket.emit('register_device', {
    imei: TEST_IMEI,
    userEmail: TEST_EMAIL
  });
});

deviceSocket.on('device_registered', (data) => {
  console.log('✅ Device registered:', data.message);
  
  // Start sending telemetry data
  startTelemetrySimulation();
});

deviceSocket.on('telemetry_processed', (result) => {
  console.log('📊 Telemetry processed:', result.message);
});

deviceSocket.on('error', (error) => {
  console.error('❌ Device error:', error);
});

// User connection events
userSocket.on('connect', () => {
  console.log('👤 User connected to server');
  
  // Subscribe to user updates
  userSocket.emit('subscribe_user', {
    email: TEST_EMAIL
  });
});

userSocket.on('user_subscribed', (data) => {
  console.log('✅ User subscribed:', data.email, `(${data.deviceCount} devices)`);
});

userSocket.on('telemetry_update', (event) => {
  console.log('📡 Telemetry update received:', {
    type: event.type,
    imei: event.imei,
    speed: event.data.speed,
    engineRpm: event.data.engineRpm
  });
});

userSocket.on('vehicle_alert', (event) => {
  console.log('🚨 Vehicle alert:', event.alert.message);
});

userSocket.on('crash_detected', (event) => {
  console.log('💥 Crash detected:', event.alert.message);
});

userSocket.on('error', (error) => {
  console.error('❌ User error:', error);
});

// Disconnection events
deviceSocket.on('disconnect', () => {
  console.log('📱 Device disconnected');
});

userSocket.on('disconnect', () => {
  console.log('👤 User disconnected');
});

// Simulate telemetry data
function startTelemetrySimulation() {
  console.log('🔄 Starting telemetry simulation...\n');
  
  setInterval(() => {
    const telemetryData = {
      imei: TEST_IMEI,
      timestamp: Date.now(),
      data: {
        engineRpm: Math.floor(Math.random() * 5000) + 500,
        speed: Math.floor(Math.random() * 120),
        fuelLevel: Math.floor(Math.random() * 100),
        batteryVoltage: 12 + Math.random() * 2,
        crashDetection: Math.random() > 0.95 ? 1 : 0, // 5% chance of crash
        dtc: Math.random() > 0.9 ? Math.floor(Math.random() * 10) : 0, // 10% chance of DTC
        position: {
          latitude: 40.7128 + (Math.random() - 0.5) * 0.01,
          longitude: -74.0060 + (Math.random() - 0.5) * 0.01
        },
        externalVoltage: Math.floor((12 + Math.random() * 2) * 1000), // Convert to mV
        engineLoad: Math.floor(Math.random() * 100),
        engineOilTemp: Math.floor(Math.random() * 50) + 80,
        totalMileage: Math.floor(Math.random() * 100000) + 50000,
        tirePressure: {
          frontLeft: Math.floor(Math.random() * 10) + 30,
          frontRight: Math.floor(Math.random() * 10) + 30,
          rearLeft: Math.floor(Math.random() * 10) + 30,
          rearRight: Math.floor(Math.random() * 10) + 30
        }
      }
    };
    
    deviceSocket.emit('telemetry_data', telemetryData);
  }, 5000); // Send every 5 seconds
  
  // Send heartbeat every 30 seconds
  setInterval(() => {
    deviceSocket.emit('heartbeat', { imei: TEST_IMEI });
  }, 30000);
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down test...');
  deviceSocket.disconnect();
  userSocket.disconnect();
  process.exit(0);
});

console.log('📋 Test Instructions:');
console.log('1. Make sure the server is running on port 6162');
console.log('2. Watch for real-time telemetry updates');
console.log('3. Monitor for alerts (low battery, high RPM, etc.)');
console.log('4. Press Ctrl+C to stop the test\n'); 