const { io } = require('socket.io-client');

// Test configuration
const SERVER_URL = 'http://localhost:6162';
const TEST_IMEI = '864636069379085';
const TEST_EMAIL = '685ec93712868631b10410d8';

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
  console.log('📊 Telemetry processed:', result.message || 'Success');
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
    speed: event.data?.speed || 'N/A',
    engineRpm: event.data?.engineRpm || 'N/A',
    voltage: event.data?.externalVoltage ? (event.data.externalVoltage * 0.001).toFixed(2) + 'V' : 'N/A'
  });
});

userSocket.on('car_state_changed', (data) => {
  console.log('🚗 Car state changed:', {
    state: data.state,
    speed: data.speed,
    rpm: data.engineRpm
  });
});

userSocket.on('location_changed', (data) => {
  console.log('📍 Location updated:', data.latlng);
});

userSocket.on('vehicle_alert', (event) => {
  console.log('🚨 Vehicle alert:', event.alert?.message || event.message);
});

userSocket.on('crash_detected', (event) => {
  console.log('💥 CRASH DETECTED:', event.alert?.message || event.message);
});

userSocket.on('health_warning', (event) => {
  console.log('⚠️ Health warning:', event.alert?.message || event.message);
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

// Simulate telemetry data with CORRECT FORMAT
function startTelemetrySimulation() {
  console.log('🔄 Starting telemetry simulation...\n');
  
  let counter = 0;
  
  const telemetryInterval = setInterval(() => {
    counter++;
    
    // Generate random but realistic data
    const speed = Math.floor(Math.random() * 80) + 10;
    const engineRpm = speed > 0 ? Math.floor(Math.random() * 3000) + 1000 : 0;
    const isLowBattery = counter % 10 === 0; // Low battery every 10th reading
    const isCrash = counter % 25 === 0; // Crash every 25th reading
    const hasDTC = counter % 15 === 0; // DTC every 15th reading
    
    // CORRECT payload structure for your server
    const telemetryPayload = {
      imei: TEST_IMEI,
      payload: {
        state: {
          reported: {
            timestamp: Date.now(),
            latlng: `${(40.7128 + (Math.random() - 0.5) * 0.01).toFixed(6)},${(-74.0060 + (Math.random() - 0.5) * 0.01).toFixed(6)}`,
            speed: speed,
            engineRpm: engineRpm,
            externalVoltage: isLowBattery ? 11500 : Math.floor(Math.random() * 1000) + 12000, // mV
            altitude: Math.floor(Math.random() * 50) + 10,
            angle: Math.floor(Math.random() * 360),
            crashDetection: isCrash ? 1 : 0,
            dtc: hasDTC ? Math.floor(Math.random() * 10) + 1 : 0,
            fuelLevel: Math.floor(Math.random() * 100),
            engineLoad: Math.floor(Math.random() * 100),
            engineOilTemp: Math.floor(Math.random() * 50) + 80,
            totalMileage: Math.floor(Math.random() * 1000) + 50000
          }
        }
      }
    };
    
    console.log(`📊 Sending telemetry #${counter}:`, {
      speed: telemetryPayload.payload.state.reported.speed,
      rpm: telemetryPayload.payload.state.reported.engineRpm,
      voltage: (telemetryPayload.payload.state.reported.externalVoltage * 0.001).toFixed(2) + 'V',
      location: telemetryPayload.payload.state.reported.latlng,
      alerts: {
        lowBattery: isLowBattery,
        crash: isCrash,
        dtc: hasDTC
      }
    });
    
    deviceSocket.emit('telemetry_data', telemetryPayload);
    
    // Stop after 50 readings for demo
    if (counter >= 50) {
      clearInterval(telemetryInterval);
      console.log('🏁 Telemetry simulation completed');
    }
    
  }, 3000); // Send every 3 seconds
  
  // Send heartbeat every 30 seconds
  const heartbeatInterval = setInterval(() => {
    if (deviceSocket.connected) {
      deviceSocket.emit('heartbeat', { imei: TEST_IMEI });
      console.log('💓 Heartbeat sent');
    }
  }, 30000);
  
  // Cleanup on disconnect
  deviceSocket.on('disconnect', () => {
    clearInterval(telemetryInterval);
    clearInterval(heartbeatInterval);
  });
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
console.log('3. Monitor for alerts (low battery, crash, DTC)');
console.log('4. Press Ctrl+C to stop the test\n');