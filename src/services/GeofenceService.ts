// src/services/GeofenceService.ts
import { Geofence, IGeofence } from '../models/Geofence';
import { GeofenceEvent, IGeofenceEvent } from '../models/GeofenceEvent';
import { Device } from '../models/Device';
import { CustomError } from '../middleware/errorHandler';
import mongoose from 'mongoose';

export interface CreateGeofenceRequest {
  name: string;
  description?: string;
  type: 'circle' | 'polygon';
  center?: { lat: number; lng: number };
  radius?: number;
  coordinates?: Array<{ lat: number; lng: number }>;
  deviceImei?: string;
  userEmail?: string;
  alertOnEntry?: boolean;
  alertOnExit?: boolean;
}

export interface GeofenceListQuery {
  deviceImei?: string;
  userEmail?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export interface GeofenceEventQuery {
  imei?: string;
  geofenceId?: string;
  type?: 'entry' | 'exit';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class GeofenceService {
  
  async createGeofence(data: CreateGeofenceRequest): Promise<IGeofence> {
    try {
      // Validate required fields
      if (!data.name || !data.type) {
        throw new CustomError('Name and type are required', 400);
      }

      // Validate type-specific requirements
      if (data.type === 'circle') {
        if (!data.center || !data.radius) {
          throw new CustomError('Circle geofence requires center coordinates and radius', 400);
        }
        if (data.radius < 10 || data.radius > 100000) {
          throw new CustomError('Radius must be between 10 meters and 100km', 400);
        }
      } else if (data.type === 'polygon') {
        if (!data.coordinates || data.coordinates.length < 3) {
          throw new CustomError('Polygon geofence requires at least 3 coordinates', 400);
        }
        if (data.coordinates.length > 100) {
          throw new CustomError('Polygon cannot have more than 100 coordinates', 400);
        }
      }

      // Validate device exists if deviceImei provided
      if (data.deviceImei) {
        const device = await Device.findOne({ imei: data.deviceImei });
        if (!device) {
          throw new CustomError('Device not found', 404);
        }
      }

      // Create geofence
      const geofenceData: Partial<IGeofence> = {
        name: data.name.trim(),
        description: data.description?.trim(),
        type: data.type,
        deviceImei: data.deviceImei,
        userEmail: data.userEmail?.toLowerCase(),
        alertOnEntry: data.alertOnEntry ?? true,
        alertOnExit: data.alertOnExit ?? true,
        isActive: true
      };

      if (data.type === 'circle') {
        geofenceData.center = data.center;
        geofenceData.radius = data.radius;
      } else {
        geofenceData.coordinates = data.coordinates;
      }

      const geofence = new Geofence(geofenceData);
      await geofence.save();
      
      return geofence;
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to create geofence', 500);
    }
  }

  async updateGeofence(id: string, data: Partial<CreateGeofenceRequest>): Promise<IGeofence> {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new CustomError('Invalid geofence ID', 400);
      }

      const geofence = await Geofence.findById(id);
      if (!geofence) {
        throw new CustomError('Geofence not found', 404);
      }

      // Validate device exists if deviceImei provided
      if (data.deviceImei) {
        const device = await Device.findOne({ imei: data.deviceImei });
        if (!device) {
          throw new CustomError('Device not found', 404);
        }
      }

      // Update fields
      if (data.name) geofence.name = data.name.trim();
      if (data.description !== undefined) geofence.description = data.description?.trim();
      if (data.deviceImei !== undefined) geofence.deviceImei = data.deviceImei;
      if (data.userEmail !== undefined) geofence.userEmail = data.userEmail?.toLowerCase();
      if (data.alertOnEntry !== undefined) geofence.alertOnEntry = data.alertOnEntry;
      if (data.alertOnExit !== undefined) geofence.alertOnExit = data.alertOnExit;

      // Handle geometry updates
      if (data.type && data.type !== geofence.type) {
        geofence.type = data.type;
        if (data.type === 'circle') {
          if (!data.center || !data.radius) {
            throw new CustomError('Circle geofence requires center and radius', 400);
          }
          geofence.center = data.center;
          geofence.radius = data.radius;
          geofence.coordinates = undefined;
        } else {
          if (!data.coordinates || data.coordinates.length < 3) {
            throw new CustomError('Polygon geofence requires at least 3 coordinates', 400);
          }
          geofence.coordinates = data.coordinates;
          geofence.center = undefined;
          geofence.radius = undefined;
        }
      } else {
        // Update geometry for existing type
        if (geofence.type === 'circle') {
          if (data.center) geofence.center = data.center;
          if (data.radius) geofence.radius = data.radius;
        } else if (geofence.type === 'polygon') {
          if (data.coordinates) geofence.coordinates = data.coordinates;
        }
      }

      await geofence.save();
      return geofence;
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to update geofence', 500);
    }
  }

  async listGeofences(query: GeofenceListQuery = {}): Promise<{
    geofences: IGeofence[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const filter: any = {};
      
      // Build filter
      if (query.deviceImei) filter.deviceImei = query.deviceImei;
      if (query.userEmail) filter.userEmail = query.userEmail.toLowerCase();
      if (query.isActive !== undefined) filter.isActive = query.isActive;

      const limit = Math.min(query.limit || 50, 100);
      const offset = query.offset || 0;

      const [geofences, total] = await Promise.all([
        Geofence.find(filter)
          .sort({ createdAt: -1 })
          .skip(offset)
          .limit(limit)
          .lean(),
        Geofence.countDocuments(filter)
      ]);

      return {
        geofences,
        total,
        hasMore: offset + limit < total
      };
    } catch (error) {
      throw new CustomError('Failed to fetch geofences', 500);
    }
  }

  async getGeofenceById(id: string): Promise<IGeofence | null> {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new CustomError('Invalid geofence ID', 400);
      }
      return await Geofence.findById(id);
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to fetch geofence', 500);
    }
  }

  async deleteGeofence(id: string): Promise<void> {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new CustomError('Invalid geofence ID', 400);
      }

      const geofence = await Geofence.findById(id);
      if (!geofence) {
        throw new CustomError('Geofence not found', 404);
      }

      // Delete geofence and related events
      await Promise.all([
        Geofence.findByIdAndDelete(id),
        GeofenceEvent.deleteMany({ geofenceId: id })
      ]);
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to delete geofence', 500);
    }
  }

  async toggleGeofence(id: string, isActive: boolean): Promise<IGeofence> {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new CustomError('Invalid geofence ID', 400);
      }

      const geofence = await Geofence.findByIdAndUpdate(
        id,
        { isActive },
        { new: true }
      );

      if (!geofence) {
        throw new CustomError('Geofence not found', 404);
      }

      return geofence;
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to toggle geofence', 500);
    }
  }

  // Geofence Events
  async getGeofenceEvents(query: GeofenceEventQuery = {}): Promise<{
    events: IGeofenceEvent[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const filter: any = {};
      
      if (query.imei) filter.imei = query.imei;
      if (query.geofenceId) {
        if (!mongoose.Types.ObjectId.isValid(query.geofenceId)) {
          throw new CustomError('Invalid geofence ID', 400);
        }
        filter.geofenceId = new mongoose.Types.ObjectId(query.geofenceId);
      }
      if (query.type) filter.type = query.type;
      
      if (query.startDate || query.endDate) {
        filter.timestamp = {};
        if (query.startDate) filter.timestamp.$gte = query.startDate.getTime();
        if (query.endDate) filter.timestamp.$lte = query.endDate.getTime();
      }

      const limit = Math.min(query.limit || 50, 100);
      const offset = query.offset || 0;

      const [events, total] = await Promise.all([
        GeofenceEvent.find(filter)
          .populate('geofenceId', 'name type')
          .sort({ timestamp: -1 })
          .skip(offset)
          .limit(limit)
          .lean(),
        GeofenceEvent.countDocuments(filter)
      ]);

      return {
        events,
        total,
        hasMore: offset + limit < total
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to fetch geofence events', 500);
    }
  }

  // Utility methods for geofence checking
  async getActiveGeofencesForDevice(imei: string): Promise<IGeofence[]> {
    try {
      const device = await Device.findOne({ imei });
      if (!device) {
        throw new CustomError('Device not found', 404);
      }

      return await Geofence.find({
        $and: [
          { isActive: true },
          {
            $or: [
              { deviceImei: imei },
              { userEmail: device.user },
              { deviceImei: { $exists: false }, userEmail: { $exists: false } }
            ]
          }
        ]
      });
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to fetch device geofences', 500);
    }
  }

  isPointInCircle(
    lat: number, 
    lng: number, 
    centerLat: number, 
    centerLng: number, 
    radius: number
  ): boolean {
    return this.haversineDistance(lat, lng, centerLat, centerLng) <= radius;
  }

  isPointInPolygon(
    lat: number, 
    lng: number, 
    polygon: Array<{ lat: number; lng: number }>
  ): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const pi = polygon[i];
      const pj = polygon[j];
      
      if (!pi || !pj || pi.lat == null || pi.lng == null || pj.lat == null || pj.lng == null) {
        continue;
      }
      
      const xi = pi.lat, yi = pi.lng;
      const xj = pj.lat, yj = pj.lng;
      
      const intersect = ((yi > lng) !== (yj > lng)) &&
        (lat < (xj - xi) * (lng - yi) / (yj - yi + 0.0000001) + xi);
      
      if (intersect) inside = !inside;
    }
    return inside;
  }

  private haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371000; // Earth's radius in meters
    
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  }
}