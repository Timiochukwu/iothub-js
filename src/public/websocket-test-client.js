const WebSocket = require('ws');
const axios = require('axios');

class GeofenceWebSocketTester {
  constructor(wsUrl, apiUrl) {
    this.wsUrl = wsUrl;
    this.apiUrl = apiUrl;
    this.ws = null;
    this.receivedMessages = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.on('open', () => {
        console.log('✅ WebSocket connected');
        resolve();
      });

      this.ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        console.log('📨 Received message:', message);
        this.receivedMessages.push({
          ...message,
          timestamp: new Date()
        });
      });

      this.ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('🔌 WebSocket disconnected');
      });
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }

  // Test geofence creation notification
  async testGeofenceCreation() {
    console.log('\n🧪 Testing Geofence Creation Notification...');
    
    const geofenceData = {
      name: 'WebSocket Test Geofence',
      type: 'circle',
      center: { lat: 40.7128, lng: -74.0060 },
      radius: 500,
      userEmail: 'test@example.com',
      deviceImei: '123456789012345',
      isActive: true
    };

    // Clear previous messages
    this.receivedMessages = [];

    // Create geofence via API
    const response = await axios.post(`${this.apiUrl}/geofences`, geofenceData, {
      headers: { 'Content-Type': 'application/json' }
    });

    // Wait for WebSocket notification
    await this.waitForMessage('geofence_created', 5000);
    
    const notification = this.getLastMessage('geofence_created');
    
    // Validate notification
    this.validateCreationNotification(notification, response.data.data);
    
    return response.data.data._id;
  }

  // Test geofence update notification
  async testGeofenceUpdate(geofenceId) {
    console.log('\n🧪 Testing Geofence Update Notification...');
    
    const updateData = {
      name: 'Updated WebSocket Test Geofence',
      description: 'Updated via WebSocket test'
    };

    this.receivedMessages = [];

    // Update geofence via API
    const response = await axios.put(`${this.apiUrl}/geofences/${geofenceId}`, updateData, {
      headers: { 'Content-Type': 'application/json' }
    });

    // Wait for WebSocket notification
    await this.waitForMessage('geofence_updated', 5000);
    
    const notification = this.getLastMessage('geofence_updated');
    this.validateUpdateNotification(notification, response.data.data);
  }

  // Test geofence toggle notification
  async testGeofenceToggle(geofenceId) {
    console.log('\n🧪 Testing Geofence Toggle Notification...');
    
    this.receivedMessages = [];

    // Toggle geofence via API
    const response = await axios.patch(`${this.apiUrl}/geofences/${geofenceId}/toggle`, 
      { isActive: false }, 
      { headers: { 'Content-Type': 'application/json' } }
    );

    // Wait for WebSocket notification
    await this.waitForMessage('geofence_toggled', 5000);
    
    const notification = this.getLastMessage('geofence_toggled');
    this.validateToggleNotification(notification, geofenceId, false);
  }

  // Test bulk operations notification
  async testBulkOperations(geofenceIds) {
    console.log('\n🧪 Testing Bulk Operations Notification...');
    
    this.receivedMessages = [];

    // Perform bulk activate operation
    await axios.post(`${this.apiUrl}/geofences/bulk`, {
      ids: geofenceIds,
      operation: 'activate'
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    // Wait for multiple notifications
    await this.waitForMultipleMessages('geofence_toggled', geofenceIds.length, 5000);
    
    const notifications = this.getMessages('geofence_toggled');
    this.validateBulkNotifications(notifications, geofenceIds, true);
  }

  // Test geofence deletion notification
  async testGeofenceDeletion(geofenceId) {
    console.log('\n🧪 Testing Geofence Deletion Notification...');
    
    this.receivedMessages = [];

    // Delete geofence via API
    await axios.delete(`${this.apiUrl}/geofences/${geofenceId}`);

    // Wait for WebSocket notification
    await this.waitForMessage('geofence_deleted', 5000);
    
    const notification = this.getLastMessage('geofence_deleted');
    this.validateDeletionNotification(notification, geofenceId);
  }

  // Helper methods
  waitForMessage(type, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkMessage = () => {
        const message = this.receivedMessages.find(msg => msg.type === type);
        if (message) {
          resolve(message);
        } else if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for message type: ${type}`));
        } else {
          setTimeout(checkMessage, 100);
        }
      };
      
      checkMessage();
    });
  }

  waitForMultipleMessages(type, count, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkMessages = () => {
        const messages = this.receivedMessages.filter(msg => msg.type === type);
        if (messages.length >= count) {
          resolve(messages);
        } else if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for ${count} messages of type: ${type}. Got ${messages.length}`));
        } else {
          setTimeout(checkMessages, 100);
        }
      };
      
      checkMessages();
    });
  }

  getLastMessage(type) {
    const messages = this.receivedMessages.filter(msg => msg.type === type);
    return messages[messages.length - 1];
  }

  getMessages(type) {
    return this.receivedMessages.filter(msg => msg.type === type);
  }

  // Validation methods
  validateCreationNotification(notification, geofenceData) {
    console.log('✅ Validating creation notification...');
    
    if (!notification) {
      throw new Error('No creation notification received');
    }

    if (notification.type !== 'geofence_created') {
      throw new Error(`Expected type 'geofence_created', got '${notification.type}'`);
    }

    if (notification.data.id !== geofenceData._id) {
      throw new Error(`ID mismatch: expected ${geofenceData._id}, got ${notification.data.id}`);
    }

    if (notification.data.name !== geofenceData.name) {
      throw new Error(`Name mismatch: expected ${geofenceData.name}, got ${notification.data.name}`);
    }

    console.log('✅ Creation notification validation passed');
  }

  validateUpdateNotification(notification, geofenceData) {
    console.log('✅ Validating update notification...');
    
    if (!notification) {
      throw new Error('No update notification received');
    }

    if (notification.type !== 'geofence_updated') {
      throw new Error(`Expected type 'geofence_updated', got '${notification.type}'`);
    }

    if (notification.data.id !== geofenceData._id) {
      throw new Error(`ID mismatch: expected ${geofenceData._id}, got ${notification.data.id}`);
    }

    console.log('✅ Update notification validation passed');
  }

  validateToggleNotification(notification, geofenceId, expectedStatus) {
    console.log('✅ Validating toggle notification...');
    
    if (!notification) {
      throw new Error('No toggle notification received');
    }

    if (notification.type !== 'geofence_toggled') {
      throw new Error(`Expected type 'geofence_toggled', got '${notification.type}'`);
    }

    if (notification.data.id !== geofenceId) {
      throw new Error(`ID mismatch: expected ${geofenceId}, got ${notification.data.id}`);
    }

    if (notification.data.isActive !== expectedStatus) {
      throw new Error(`Status mismatch: expected ${expectedStatus}, got ${notification.data.isActive}`);
    }

    console.log('✅ Toggle notification validation passed');
  }

  validateBulkNotifications(notifications, geofenceIds, expectedStatus) {
    console.log('✅ Validating bulk notifications...');
    
    if (notifications.length !== geofenceIds.length) {
      throw new Error(`Expected ${geofenceIds.length} notifications, got ${notifications.length}`);
    }

    notifications.forEach((notification, index) => {
      if (notification.type !== 'geofence_toggled') {
        throw new Error(`Expected type 'geofence_toggled', got '${notification.type}' for notification ${index}`);
      }

      if (notification.data.isActive !== expectedStatus) {
        throw new Error(`Status mismatch for notification ${index}: expected ${expectedStatus}, got ${notification.data.isActive}`);
      }
    });

    console.log('✅ Bulk notifications validation passed');
  }

  validateDeletionNotification(notification, geofenceId) {
    console.log('✅ Validating deletion notification...');
    
    if (!notification) {
      throw new Error('No deletion notification received');
    }

    if (notification.type !== 'geofence_deleted') {
      throw new Error(`Expected type 'geofence_deleted', got '${notification.type}'`);
    }

    if (notification.data.id !== geofenceId) {
      throw new Error(`ID mismatch: expected ${geofenceId}, got ${notification.data.id}`);
    }

    console.log('✅ Deletion notification validation passed');
  }
}

// Test runner
async function runWebSocketTests() {
  const tester = new GeofenceWebSocketTester(
    'ws://localhost:3000', // WebSocket URL
    'http://localhost:3000/api' // API URL
  );

  try {
    // Connect to WebSocket
    await tester.connect();
    
    console.log('🚀 Starting WebSocket tests...\n');

    // Test creation
    const geofenceId1 = await tester.testGeofenceCreation();
    
    // Test update
    await tester.testGeofenceUpdate(geofenceId1);
    
    // Test toggle
    await tester.testGeofenceToggle(geofenceId1);
    
    // Create another geofence for bulk testing
    const geofenceId2 = await tester.testGeofenceCreation();
    
    // Test bulk operations
    await tester.testBulkOperations([geofenceId1, geofenceId2]);
    
    // Test deletion
    await tester.testGeofenceDeletion(geofenceId1);
    await tester.testGeofenceDeletion(geofenceId2);
    
    console.log('\n🎉 All WebSocket tests passed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    tester.disconnect();
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runWebSocketTests();
}

module.exports = GeofenceWebSocketTester;