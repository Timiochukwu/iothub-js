// CollisionDetectionService.ts
import { CustomError } from "../middleware/errorHandler";

export interface CollisionEvent {
  id: string;
  imei: string;
  timestamp: number;
  severity: 'minor' | 'moderate' | 'severe';
  location: {
    latlng: string;
    address?: string;
  };
  vehicleInfo: {
    speed: number;
    rpm: number;
    direction: number;
  };
  accelerometerData: {
    x: number;
    y: number;
    z: number;
  };
  status: 'pending' | 'confirmed' | 'false_alarm';
  responseTime?: number;
  emergencyContacted?: boolean;
}

export interface CollisionAlert {
  id: string;
  imei: string;
  timestamp: number;
  message: string;
  severity: 'minor' | 'moderate' | 'severe';
  location: string;
  vehicleStatus: string;
  requiresResponse: boolean;
}

export class CollisionDetectionService {
  private readonly COLLISION_THRESHOLD = {
    MINOR: 2.0,    // G-force threshold for minor collision
    MODERATE: 4.0, // G-force threshold for moderate collision
    SEVERE: 6.0    // G-force threshold for severe collision
  };

  private readonly SPEED_THRESHOLD = 10; // km/h - minimum speed for collision detection
  private collisionHistory: Map<string, CollisionEvent[]> = new Map();

  /**
   * Analyze telemetry data for potential collision events
   */
  async analyzeForCollision(telemetryData: any): Promise<CollisionAlert | null> {
    try {
      const { imei, state: { reported } } = telemetryData;
      
      // Extract relevant collision detection parameters
      const crashDetectionCode = reported["247"] || 0; // Crash detection from your existing code
      const speed = reported.sp || reported["24"] || 0;
      const rpm = reported["36"] || 0;
      const acceleration = this.calculateAcceleration(reported);
      const timestamp = reported.ts?.$numberLong ? 
        parseInt(reported.ts.$numberLong) : Date.now();

      // Check if collision detection is triggered
      if (crashDetectionCode > 0 || this.isCollisionDetected(acceleration, speed)) {
        const collisionEvent = await this.createCollisionEvent(
          imei, 
          reported, 
          crashDetectionCode,
          acceleration,
          timestamp
        );

        // Store collision event
        this.storeCollisionEvent(imei, collisionEvent);

        // Create alert for real-time notification
        return this.createCollisionAlert(collisionEvent);
      }

      return null;
    } catch (error) {
      console.error('Error analyzing collision data:', error);
      throw new CustomError('Failed to analyze collision data', 500);
    }
  }

  /**
   * Get recent collision events for a device
   */
  async getRecentCollisions(imei: string, limit: number = 10): Promise<CollisionEvent[]> {
    try {
      const collisions = this.collisionHistory.get(imei) || [];
      return collisions
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    } catch (error) {
      throw new CustomError('Failed to fetch collision history', 500);
    }
  }

  /**
   * Get collision statistics for a device
   */
  async getCollisionStats(imei: string, days: number = 30): Promise<{
    total: number;
    byDay: Array<{ date: string; count: number }>;
    bySeverity: { minor: number; moderate: number; severe: number };
  }> {
    try {
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
      const collisions = (this.collisionHistory.get(imei) || [])
        .filter(c => c.timestamp >= cutoffTime);

      const byDay = this.groupCollisionsByDay(collisions, days);
      const bySeverity = this.groupCollisionsBySeverity(collisions);

      return {
        total: collisions.length,
        byDay,
        bySeverity
      };
    } catch (error) {
      throw new CustomError('Failed to fetch collision statistics', 500);
    }
  }

  /**
   * Update collision status (confirmed/false alarm)
   */
  async updateCollisionStatus(
    imei: string, 
    collisionId: string, 
    status: 'confirmed' | 'false_alarm',
    responseTime?: number
  ): Promise<void> {
    try {
      const collisions = this.collisionHistory.get(imei) || [];
      const collision = collisions.find(c => c.id === collisionId);
      
      if (!collision) {
        throw new CustomError('Collision event not found', 404);
      }

      collision.status = status;
      if (responseTime) {
        collision.responseTime = responseTime;
      }

      console.log(`Collision ${collisionId} status updated to: ${status}`);
    } catch (error) {
      throw new CustomError('Failed to update collision status', 500);
    }
  }

  private calculateAcceleration(reported: any): { x: number; y: number; z: number } {
    // Extract accelerometer data from telemetry
    // These field mappings may need adjustment based on your device's data format
    return {
      x: reported["181"] || 0,  // Acceleration X-axis
      y: reported["182"] || 0,  // Acceleration Y-axis  
      z: reported["200"] || 0   // Acceleration Z-axis
    };
  }

  private isCollisionDetected(acceleration: { x: number; y: number; z: number }, speed: number): boolean {
    // Calculate total G-force
    const totalGForce = Math.sqrt(
      Math.pow(acceleration.x, 2) + 
      Math.pow(acceleration.y, 2) + 
      Math.pow(acceleration.z, 2)
    ) / 10; // Convert to G-force (assuming data is in m/s²)

    // Only detect collisions if vehicle is moving above threshold speed
    return speed > this.SPEED_THRESHOLD && totalGForce > this.COLLISION_THRESHOLD.MINOR;
  }

  private async createCollisionEvent(
    imei: string, 
    reported: any, 
    crashDetectionCode: number,
    acceleration: { x: number; y: number; z: number },
    timestamp: number
  ): Promise<CollisionEvent> {
    const totalGForce = Math.sqrt(
      Math.pow(acceleration.x, 2) + 
      Math.pow(acceleration.y, 2) + 
      Math.pow(acceleration.z, 2)
    ) / 10;

    const severity = this.determineSeverity(totalGForce, crashDetectionCode);
    
    return {
      id: `collision_${imei}_${timestamp}`,
      imei,
      timestamp,
      severity,
      location: {
        latlng: reported.latlng || '0,0',
        address: await this.getAddressFromLatLng(reported.latlng)
      },
      vehicleInfo: {
        speed: reported.sp || reported["24"] || 0,
        rpm: reported["36"] || 0,
        direction: reported.ang || 0
      },
      accelerometerData: acceleration,
      status: 'pending',
      emergencyContacted: severity === 'severe'
    };
  }

  private createCollisionAlert(event: CollisionEvent): CollisionAlert {
    const locationText = event.location.address || event.location.latlng;
    
    return {
      id: event.id,
      imei: event.imei,
      timestamp: event.timestamp,
      message: this.getCollisionMessage(event.severity, locationText),
      severity: event.severity,
      location: locationText,
      vehicleStatus: this.getVehicleStatus(event.vehicleInfo),
      requiresResponse: event.severity !== 'minor'
    };
  }

  private determineSeverity(gForce: number, crashCode: number): 'minor' | 'moderate' | 'severe' {
    // Use crash detection code if available
    if (crashCode > 0) {
      switch (crashCode) {
        case 1:
        case 6:
          return 'severe'; // Real crash detected
        case 4:
        case 5:
          return 'moderate'; // Full crash trace
        case 2:
        case 3:
          return 'minor'; // Limited crash trace
        default:
          break;
      }
    }

    // Fall back to G-force analysis
    if (gForce >= this.COLLISION_THRESHOLD.SEVERE) return 'severe';
    if (gForce >= this.COLLISION_THRESHOLD.MODERATE) return 'moderate';
    return 'minor';
  }

  private getCollisionMessage(severity: string, location: string): string {
    const messages = {
      minor: `Minor collision detected at ${location}`,
      moderate: `Moderate collision detected at ${location}. Please check vehicle status.`,
      severe: `SEVERE COLLISION DETECTED at ${location}. Emergency services may be required.`
    };
    return messages[severity as keyof typeof messages] || 'Collision detected';
  }

  private getVehicleStatus(vehicleInfo: { speed: number; rpm: number; direction: number }): string {
    if (vehicleInfo.speed === 0 && vehicleInfo.rpm === 0) {
      return 'Vehicle stopped';
    } else if (vehicleInfo.speed > 0) {
      return `Moving at ${vehicleInfo.speed} km/h`;
    } else {
      return 'Engine running, stationary';
    }
  }

  private storeCollisionEvent(imei: string, event: CollisionEvent): void {
    if (!this.collisionHistory.has(imei)) {
      this.collisionHistory.set(imei, []);
    }
    
    const events = this.collisionHistory.get(imei)!;
    events.push(event);
    
    // Keep only last 100 events per device
    if (events.length > 100) {
      events.splice(0, events.length - 100);
    }
  }

  private groupCollisionsByDay(collisions: CollisionEvent[], days: number) {
    const dayGroups: Array<{ date: string; count: number }> = [];
    const now = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const count = collisions.filter(c => {
        const collisionDate = new Date(c.timestamp).toISOString().split('T')[0];
        return collisionDate === dateStr;
      }).length;
      
      dayGroups.unshift({ date: dateStr ?? '', count });
    }
    
    return dayGroups;
  }

  private groupCollisionsBySeverity(collisions: CollisionEvent[]) {
    return collisions.reduce(
      (acc, collision) => {
        acc[collision.severity]++;
        return acc;
      },
      { minor: 0, moderate: 0, severe: 0 }
    );
  }

  private async getAddressFromLatLng(latlng?: string): Promise<string | undefined> {
    if (!latlng) return undefined;
    
    try {
      // Implement reverse geocoding here
      // This is a placeholder - you'd integrate with a geocoding service
      return `Location: ${latlng}`;
    } catch (error) {
      console.error('Failed to get address from coordinates:', error);
      return undefined;
    }
  }
}