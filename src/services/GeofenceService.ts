// src/services/GeofenceService.ts
import { Geofence, IGeofence } from "../models/Geofence";
import { GeofenceEvent, IGeofenceEvent } from "../models/GeofenceEvent";
import { Device } from "../models/Device";
import { CustomError } from "../middleware/errorHandler";
import { RealTimeService } from "./RealTimeService";
import mongoose from "mongoose";

export interface CreateGeofenceRequest {
  name: string;
  description?: string;
  type: "circle" | "polygon";
  center?: { lat: number; lng: number };
  radius?: number;
  coordinates?: Array<{ lat: number; lng: number }>;
  deviceImei?: string;
  userEmail?: string;
  alertOnEntry?: boolean;
  alertOnExit?: boolean;
  // New fields for enhanced functionality
  address?: string;
  locationName?: string;
  color?: string;
  isTemplate?: boolean;
  templateName?: string;
  tags?: string[];
}

export interface GeofenceListQuery {
  deviceImei?: string;
  userEmail?: string;
  isActive?: boolean;
  isTemplate?: boolean;
  tags?: string[];
  search?: string;
  sortBy?: "name" | "createdAt" | "lastActivity";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface GeofenceEventQuery {
  imei?: string;
  geofenceId?: string;
  type?: "entry" | "exit";
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface GeofenceStats {
  totalGeofences: number;
  activeGeofences: number;
  totalEvents: number;
  eventsToday: number;
  topGeofences: Array<{
    id: string;
    name: string;
    eventCount: number;
  }>;
}

export interface BulkOperation {
  ids: string[];
  operation: "activate" | "deactivate" | "delete";
}

export class GeofenceService {
  private realTimeService?: RealTimeService;

  constructor(realTimeService?: RealTimeService) {
    this.realTimeService = realTimeService;
  }

  async createGeofence(data: CreateGeofenceRequest): Promise<IGeofence> {
    try {
      // Enhanced validation
      this.validateGeofenceData(data);

      // Validate device exists if deviceImei provided
      if (data.deviceImei) {
        // Validate IMEI format
        if (!/^\d{15}$/.test(data.deviceImei)) {
          throw new CustomError("Invalid IMEI format. IMEI must be 15 digits", 400);
        }
        
        const device = await Device.findOne({ imei: data.deviceImei });
        if (!device) {
          throw new CustomError(
            "The specified device was not found. Please check the device IMEI and try again.",
            404
          );
        }
      }

      // Check for duplicate names within the same scope
      await this.checkDuplicateName(data.name, data.deviceImei, data.userEmail);

      // Create geofence
      const geofenceData: Partial<IGeofence> = {
        name: data.name.trim(),
        description: data.description?.trim(),
        type: data.type,
        deviceImei: data.deviceImei,
        userEmail: data.userEmail?.toLowerCase(),
        alertOnEntry: data.alertOnEntry ?? true,
        alertOnExit: data.alertOnExit ?? true,
        isActive: true,
        address: data.address?.trim(),
        locationName: data.locationName?.trim(),
        color: data.color || "#3B82F6",
        isTemplate: data.isTemplate || false,
        templateName: data.templateName?.trim(),
        tags: data.tags?.map((tag) => tag.trim().toLowerCase()) || [],
        lastActivity: new Date(),
      };

      if (data.type === "circle") {
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
      throw new CustomError(
        "Unable to create geofence. Please try again.",
        500
      );
    }
  }

  async updateGeofence(
    id: string,
    data: Partial<CreateGeofenceRequest>
  ): Promise<IGeofence> {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new CustomError("Invalid geofence ID format", 400);
      }

      const geofence = await Geofence.findById(id);
      if (!geofence) {
        throw new CustomError("Geofence not found", 404);
      }

      // Validate updates
      if (data.name) {
        this.validateName(data.name);
        // Check for duplicate names (excluding current geofence)
        await this.checkDuplicateName(
          data.name,
          data.deviceImei,
          data.userEmail,
          id
        );
      }

      // Validate device exists if deviceImei provided
      if (data.deviceImei) {
        const device = await Device.findOne({ imei: data.deviceImei });
        if (!device) {
          throw new CustomError("The specified device was not found", 404);
        }
      }

      // Update fields
      if (data.name) geofence.name = data.name.trim();
      if (data.description !== undefined)
        geofence.description = data.description?.trim();
      if (data.deviceImei !== undefined) geofence.deviceImei = data.deviceImei;
      if (data.userEmail !== undefined)
        geofence.userEmail = data.userEmail?.toLowerCase();
      if (data.alertOnEntry !== undefined)
        geofence.alertOnEntry = data.alertOnEntry;
      if (data.alertOnExit !== undefined)
        geofence.alertOnExit = data.alertOnExit;
      if (data.address !== undefined) geofence.address = data.address?.trim();
      if (data.locationName !== undefined)
        geofence.locationName = data.locationName?.trim();
      if (data.color !== undefined) geofence.color = data.color;
      if (data.tags !== undefined)
        geofence.tags = data.tags.map((tag) => tag.trim().toLowerCase());

      // Handle geometry updates
      if (data.type && data.type !== geofence.type) {
        geofence.type = data.type;
        if (data.type === "circle") {
          if (!data.center || !data.radius) {
            throw new CustomError(
              "Circle geofence requires center coordinates and radius",
              400
            );
          }
          this.validateCircleGeometry(data.center, data.radius);
          geofence.center = data.center;
          geofence.radius = data.radius;
          geofence.coordinates = undefined;
        } else {
          if (!data.coordinates || data.coordinates.length < 3) {
            throw new CustomError(
              "Polygon geofence requires at least 3 coordinates",
              400
            );
          }
          this.validatePolygonGeometry(data.coordinates);
          geofence.coordinates = data.coordinates;
          geofence.center = undefined;
          geofence.radius = undefined;
        }
      } else {
        // Update geometry for existing type
        if (geofence.type === "circle") {
          if (data.center) {
            this.validateCoordinates(data.center.lat, data.center.lng);
            geofence.center = data.center;
          }
          if (data.radius) {
            this.validateRadius(data.radius);
            geofence.radius = data.radius;
          }
        } else if (geofence.type === "polygon") {
          if (data.coordinates) {
            this.validatePolygonGeometry(data.coordinates);
            geofence.coordinates = data.coordinates;
          }
        }
      }

      geofence.lastActivity = new Date();
      await geofence.save();
      return geofence;
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError(
        "Unable to update geofence. Please try again.",
        500
      );
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
      if (query.isTemplate !== undefined) filter.isTemplate = query.isTemplate;
      if (query.tags && query.tags.length > 0) {
        filter.tags = { $in: query.tags.map((tag) => tag.toLowerCase()) };
      }
      if (query.search) {
        filter.$or = [
          { name: { $regex: query.search, $options: "i" } },
          { description: { $regex: query.search, $options: "i" } },
          { address: { $regex: query.search, $options: "i" } },
          { locationName: { $regex: query.search, $options: "i" } },
        ];
      }

      const limit = Math.min(query.limit || 50, 100);
      const offset = query.offset || 0;

      // Build sort
      const sortBy = query.sortBy || "createdAt";
      const sortOrder = query.sortOrder || "desc";
      const sort: any = {};
      sort[sortBy] = sortOrder === "asc" ? 1 : -1;

      const [geofences, total] = await Promise.all([
        Geofence.find(filter).sort(sort).skip(offset).limit(limit).lean(),
        Geofence.countDocuments(filter),
      ]);

      return {
        geofences,
        total,
        hasMore: offset + limit < total,
      };
    } catch (error) {
      throw new CustomError(
        "Unable to fetch geofences. Please try again.",
        500
      );
    }
  }

  async getGeofenceById(id: string): Promise<IGeofence | null> {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new CustomError("Invalid geofence ID format", 400);
      }
      return await Geofence.findById(id);
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError("Unable to fetch geofence. Please try again.", 500);
    }
  }

  async deleteGeofence(id: string): Promise<void> {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new CustomError("Invalid geofence ID format", 400);
      }

      const geofence = await Geofence.findById(id);
      if (!geofence) {
        throw new CustomError("Geofence not found", 404);
      }

      // Delete geofence and related events
      await Promise.all([
        Geofence.findByIdAndDelete(id),
        GeofenceEvent.deleteMany({ geofenceId: id }),
      ]);
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError(
        "Unable to delete geofence. Please try again.",
        500
      );
    }
  }

  async toggleGeofence(id: string, isActive: boolean): Promise<IGeofence> {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new CustomError("Invalid geofence ID format", 400);
      }

      const geofence = await Geofence.findByIdAndUpdate(
        id,
        {
          isActive,
          lastActivity: new Date(),
        },
        { new: true }
      );

      if (!geofence) {
        throw new CustomError("Geofence not found", 404);
      }

      return geofence;
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError(
        "Unable to toggle geofence status. Please try again.",
        500
      );
    }
  }

  // New: Bulk operations
  async bulkOperation(operation: BulkOperation): Promise<{
    success: number;
    failed: number;
    errors: Array<{ id: string; error: string }>;
  }> {
    try {
      const results = {
        success: 0,
        failed: 0,
        errors: [] as Array<{ id: string; error: string }>,
      };

      for (const id of operation.ids) {
        try {
          switch (operation.operation) {
            case "activate":
              await this.toggleGeofence(id, true);
              break;
            case "deactivate":
              await this.toggleGeofence(id, false);
              break;
            case "delete":
              await this.deleteGeofence(id);
              break;
          }
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            id,
            error:
              error instanceof CustomError ? error.message : "Unknown error",
          });
        }
      }

      return results;
    } catch (error) {
      throw new CustomError("Bulk operation failed. Please try again.", 500);
    }
  }

  // New: Create from template
  async createFromTemplate(
    templateId: string,
    overrides: Partial<CreateGeofenceRequest>
  ): Promise<IGeofence> {
    try {
      const template = await this.getGeofenceById(templateId);
      if (!template || !template.isTemplate) {
        throw new CustomError("Template not found", 404);
      }

      const geofenceData: CreateGeofenceRequest = {
        name: overrides.name || `${template.name} Copy`,
        description: overrides.description || template.description,
        type: template.type,
        center: template.center,
        radius: template.radius,
        coordinates: template.coordinates,
        deviceImei: overrides.deviceImei,
        userEmail: overrides.userEmail,
        alertOnEntry: overrides.alertOnEntry ?? template.alertOnEntry,
        alertOnExit: overrides.alertOnExit ?? template.alertOnExit,
        address: overrides.address || template.address,
        locationName: overrides.locationName || template.locationName,
        color: overrides.color || template.color,
        tags: overrides.tags || template.tags,
        isTemplate: false,
      };

      return await this.createGeofence(geofenceData);
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError(
        "Unable to create geofence from template. Please try again.",
        500
      );
    }
  }

  // New: Get analytics/stats
  async getGeofenceStats(
    userEmail?: string,
    deviceImei?: string
  ): Promise<GeofenceStats> {
    try {
      const filter: any = {};
      if (userEmail) filter.userEmail = userEmail.toLowerCase();
      if (deviceImei) filter.deviceImei = deviceImei;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        totalGeofences,
        activeGeofences,
        totalEvents,
        eventsToday,
        topGeofencesData,
      ] = await Promise.all([
        Geofence.countDocuments(filter),
        Geofence.countDocuments({ ...filter, isActive: true }),
        GeofenceEvent.countDocuments(),
        GeofenceEvent.countDocuments({ timestamp: { $gte: today.getTime() } }),
        GeofenceEvent.aggregate([
          { $group: { _id: "$geofenceId", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: "geofences",
              localField: "_id",
              foreignField: "_id",
              as: "geofence",
            },
          },
        ]),
      ]);

      const topGeofences = topGeofencesData.map((item) => ({
        id: item._id.toString(),
        name: item.geofence[0]?.name || "Unknown",
        eventCount: item.count,
      }));

      return {
        totalGeofences,
        activeGeofences,
        totalEvents,
        eventsToday,
        topGeofences,
      };
    } catch (error) {
      throw new CustomError(
        "Unable to fetch geofence statistics. Please try again.",
        500
      );
    }
  }

  // Geofence Events (enhanced)
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
          throw new CustomError("Invalid geofence ID format", 400);
        }
        filter.geofenceId = new mongoose.Types.ObjectId(query.geofenceId);
      }
      if (query.type) filter.type = query.type;

      if (query.startDate || query.endDate) {
        filter.timestamp = {};
        if (query.startDate) {
          if (isNaN(query.startDate.getTime())) {
            throw new CustomError("Invalid start date format", 400);
          }
          filter.timestamp.$gte = query.startDate.getTime();
        }
        if (query.endDate) {
          if (isNaN(query.endDate.getTime())) {
            throw new CustomError("Invalid end date format", 400);
          }
          filter.timestamp.$lte = query.endDate.getTime();
        }
      }

      const limit = Math.min(query.limit || 50, 100);
      const offset = query.offset || 0;

      const [events, total] = await Promise.all([
        GeofenceEvent.find(filter)
          .populate("geofenceId", "name type color")
          .sort({ timestamp: -1 })
          .skip(offset)
          .limit(limit)
          .lean(),
        GeofenceEvent.countDocuments(filter),
      ]);

      return {
        events,
        total,
        hasMore: offset + limit < total,
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError(
        "Unable to fetch geofence events. Please try again.",
        500
      );
    }
  }

  // Utility methods for geofence checking (enhanced)
  async getActiveGeofencesForDevice(imei: string): Promise<IGeofence[]> {
    try {
      const device = await Device.findOne({ imei });
      if (!device) {
        throw new CustomError("Device not found", 404);
      }

      return await Geofence.find({
        $and: [
          { isActive: true },
          { isTemplate: { $ne: true } },
          {
            $or: [
              { deviceImei: imei },
              { userEmail: device.user },
              { deviceImei: { $exists: false }, userEmail: { $exists: false } },
            ],
          },
        ],
      }).sort({ lastActivity: -1 });
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError(
        "Unable to fetch device geofences. Please try again.",
        500
      );
    }
  }

  async getGeofencesByImei(imei: string): Promise<IGeofence[]> {
    try {
      // Verify device exists
      const device = await Device.findOne({ imei });
      if (!device) {
        throw new CustomError("Device not found", 404);
      }
  
      // Get all geofences for this IMEI (active and inactive)
      return await Geofence.find({ deviceImei: imei })
        .sort({ createdAt: -1 });
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError(
        "Unable to fetch geofences for device. Please try again.",
        500
      );
    }
  } 

  // Method to broadcast geofence events
  // private broadcastGeofenceEvent(
  //   type: 'entry' | 'exit',
  //   deviceImei: string,
  //   geofence: IGeofence,
  //   coordinates: { lat: number; lng: number }
  // ): void {
  //   if (this.realTimeService) {
  //     this.realTimeService.broadcastGeofenceEvent({
  //       type,
  //       deviceImei,
  //       geofenceId: geofence._id.toString(),
  //       geofenceName: geofence.name,
  //       timestamp: Date.now(),
  //       coordinates,
  //       userEmail: geofence.userEmail
  //     });
  //   }
  // }

  // // Call this method when processing telemetry data
  // public async checkGeofenceEvents(
  //   deviceImei: string,
  //   coordinates: { lat: number; lng: number }
  // ): Promise<void> {
  //   try {
  //     // Get active geofences for this device
  //     const geofences = await Geofence.find({
  //       $or: [
  //         { deviceImei },
  //         { userEmail: { $exists: true } } // For user-level geofences
  //       ],
  //       isActive: true
  //     });

  //     for (const geofence of geofences) {
  //       const isInside = this.isPointInGeofence(coordinates, geofence);

  //       // Check if this is a state change (entry/exit)
  //       const wasInside = await this.getLastGeofenceState(deviceImei, geofence._id.toString());

  //       if (isInside && !wasInside && geofence.alertOnEntry) {
  //         // Device entered geofence
  //         this.broadcastGeofenceEvent('entry', deviceImei, geofence, coordinates);
  //         await this.saveGeofenceEvent(deviceImei, geofence._id.toString(), 'entry', coordinates);
  //       } else if (!isInside && wasInside && geofence.alertOnExit) {
  //         // Device exited geofence
  //         this.broadcastGeofenceEvent('exit', deviceImei, geofence, coordinates);
  //         await this.saveGeofenceEvent(deviceImei, geofence._id.toString(), 'exit', coordinates);
  //       }

  //       // Update the state
  //       await this.updateGeofenceState(deviceImei, geofence._id.toString(), isInside);
  //     }
  //   } catch (error) {
  //     console.error('Error checking geofence events:', error);
  //   }
  // }

  // // Helper methods (implement these based on your needs)
  // private isPointInGeofence(point: { lat: number; lng: number }, geofence: IGeofence): boolean {
  //   if (geofence.type === 'circle') {
  //     return this.isPointInCircle(point, geofence.center!, geofence.radius!);
  //   } else {
  //     return this.isPointInPolygon(point, geofence.coordinates!);
  //   }
  // }

  // Enhanced validation methods
  private validateGeofenceData(data: CreateGeofenceRequest): void {
    this.validateName(data.name);

    if (data.type === "circle") {
      if (!data.center || !data.radius) {
        throw new CustomError(
          "Circle geofence requires center coordinates and radius",
          400
        );
      }
      this.validateCircleGeometry(data.center, data.radius);
    } else if (data.type === "polygon") {
      if (!data.coordinates || data.coordinates.length < 3) {
        throw new CustomError(
          "Polygon geofence requires at least 3 coordinates",
          400
        );
      }
      this.validatePolygonGeometry(data.coordinates);
    }

    if (data.tags && data.tags.length > 10) {
      throw new CustomError("Maximum 10 tags allowed per geofence", 400);
    }
  }

  private validateName(name: string): void {
    if (!name || name.trim().length < 3) {
      throw new CustomError(
        "Geofence name must be at least 3 characters long",
        400
      );
    }
    if (name.trim().length > 50) {
      throw new CustomError("Geofence name cannot exceed 50 characters", 400);
    }
  }

  private validateCircleGeometry(
    center: { lat: number; lng: number },
    radius: number
  ): void {
    this.validateCoordinates(center.lat, center.lng);
    this.validateRadius(radius);
  }

  private validatePolygonGeometry(
    coordinates: Array<{ lat: number; lng: number }>
  ): void {
    if (coordinates.length > 100) {
      throw new CustomError(
        "Polygon cannot have more than 100 coordinates",
        400
      );
    }

    for (const coord of coordinates) {
      this.validateCoordinates(coord.lat, coord.lng);
    }
  }

  private validateCoordinates(lat: number, lng: number): void {
    if (typeof lat !== "number" || typeof lng !== "number") {
      throw new CustomError(
        "Invalid coordinate format. Latitude and longitude must be numbers",
        400
      );
    }
    if (lat < -90 || lat > 90) {
      throw new CustomError("Latitude must be between -90 and 90 degrees", 400);
    }
    if (lng < -180 || lng > 180) {
      throw new CustomError(
        "Longitude must be between -180 and 180 degrees",
        400
      );
    }
  }

  private validateRadius(radius: number): void {
    if (typeof radius !== "number" || radius < 10 || radius > 100000) {
      throw new CustomError(
        "Radius must be between 10 meters and 100 kilometers",
        400
      );
    }
  }

  private async checkDuplicateName(
    name: string,
    deviceImei?: string,
    userEmail?: string,
    excludeId?: string
  ): Promise<void> {
    const filter: any = {
      name: { $regex: `^${name.trim()}$`, $options: "i" },
    };

    if (deviceImei) filter.deviceImei = deviceImei;
    if (userEmail) filter.userEmail = userEmail.toLowerCase();
    if (excludeId) filter._id = { $ne: excludeId };

    const existing = await Geofence.findOne(filter);
    if (existing) {
      throw new CustomError("A geofence with this name already exists", 409);
    }
  }

  private haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371000; // Earth's radius in meters

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Track geofence states to detect entry/exit events
   */
  private geofenceStates: Map<string, boolean> = new Map(); // Key: `${deviceImei}-${geofenceId}`, Value: isInside

  /**
   * Get the last known state of a device relative to a geofence
   */
  private async getLastGeofenceState(
    deviceImei: string,
    geofenceId: string
  ): Promise<boolean> {
    const key = `${deviceImei}-${geofenceId}`;

    // Check in-memory cache first
    if (this.geofenceStates.has(key)) {
      return this.geofenceStates.get(key)!;
    }

    // Check database for last event
    try {
      const lastEvent = await GeofenceEvent.findOne({
        imei: deviceImei,
        geofenceId: new mongoose.Types.ObjectId(geofenceId),
      }).sort({ timestamp: -1 });

      if (lastEvent) {
        const wasInside = lastEvent.type === "entry";
        this.geofenceStates.set(key, wasInside);
        return wasInside;
      }

      // No previous state found, assume outside
      this.geofenceStates.set(key, false);
      return false;
    } catch (error) {
      console.error("Error getting last geofence state:", error);
      return false;
    }
  }

  /**
   * Save geofence event to database
   */
  private async saveGeofenceEvent(
    deviceImei: string,
    geofenceId: string,
    type: "entry" | "exit",
    coordinates: { lat: number; lng: number }
  ): Promise<void> {
    try {
      const event = new GeofenceEvent({
        imei: deviceImei,
        geofenceId: new mongoose.Types.ObjectId(geofenceId),
        type,
        timestamp: Date.now(),
        latlng: `${coordinates.lat},${coordinates.lng}`,
      });

      await event.save();
      console.log(`[Geofence] 💾 Saved ${type} event for device ${deviceImei}`);
    } catch (error) {
      console.error("Error saving geofence event:", error);
    }
  }

  /**
   * Update the current state of a device relative to a geofence
   */
  private async updateGeofenceState(
    deviceImei: string,
    geofenceId: string,
    isInside: boolean
  ): Promise<void> {
    const key = `${deviceImei}-${geofenceId}`;
    this.geofenceStates.set(key, isInside);

    // Also update the geofence's lastActivity
    try {
      await Geofence.findByIdAndUpdate(geofenceId, {
        lastActivity: new Date(),
      });
    } catch (error) {
      console.error("Error updating geofence activity:", error);
    }
  }

  /**
   * Check if a point is inside a geofence
   */
  private isPointInGeofence(
    point: { lat: number; lng: number },
    geofence: IGeofence
  ): boolean {
    if (geofence.type === "circle") {
      if (!geofence.center || !geofence.radius) {
        console.warn("Circle geofence missing center or radius");
        return false;
      }
      return this.isPointInCircle(
        point.lat,
        point.lng,
        geofence.center.lat,
        geofence.center.lng,
        geofence.radius
      );
    } else {
      if (!geofence.coordinates || geofence.coordinates.length < 3) {
        console.warn("Polygon geofence missing coordinates");
        return false;
      }
      return this.isPointInPolygon(point.lat, point.lng, geofence.coordinates);
    }
  }

  /**
   * Check if a point is inside a circle
   */
  public isPointInCircle(
    pointLat: number,
    pointLng: number,
    centerLat: number,
    centerLng: number,
    radiusMeters: number
  ): boolean {
    // Calculate distance using Haversine formula
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (pointLat * Math.PI) / 180;
    const φ2 = (centerLat * Math.PI) / 180;
    const Δφ = ((centerLat - pointLat) * Math.PI) / 180;
    const Δλ = ((centerLng - pointLng) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c; // Distance in meters

    return distance <= radiusMeters;
  }

  /**
   * Check if a point is inside a polygon using ray casting algorithm
   */
  public isPointInPolygon(
    pointLat: number,
    pointLng: number,
    polygon: Array<{ lat: number; lng: number }>
  ): boolean {
    if (polygon.length < 3) return false;

    let inside = false;
    const x = pointLng;
    const y = pointLat;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      // Add null/undefined checks to fix TypeScript errors
      const currentPoint = polygon[i];
      const previousPoint = polygon[j];

      // Skip if either point is undefined/null
      if (!currentPoint || !previousPoint) {
        continue;
      }

      // Additional checks for lat/lng properties
      if (
        currentPoint.lat === undefined ||
        currentPoint.lng === undefined ||
        previousPoint.lat === undefined ||
        previousPoint.lng === undefined
      ) {
        continue;
      }

      const xi = currentPoint.lng;
      const yi = currentPoint.lat;
      const xj = previousPoint.lng;
      const yj = previousPoint.lat;

      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Main method to check geofence events for a device location
   */
  public async checkGeofenceEvents(
    deviceImei: string,
    coordinates: { lat: number; lng: number }
  ): Promise<void> {
    try {
      // Get active geofences for this device
      const geofences = await Geofence.find({
        $or: [
          { deviceImei },
          { userEmail: { $exists: true } }, // For user-level geofences
        ],
        isActive: true,
      });

      for (const geofence of geofences) {
        const isInside = this.isPointInGeofence(coordinates, geofence);

        // Check if this is a state change (entry/exit)
        const wasInside = await this.getLastGeofenceState(
          deviceImei,
          geofence._id.toString()
        );

        if (isInside && !wasInside && geofence.alertOnEntry) {
          // Device entered geofence
          this.broadcastGeofenceEvent(
            "entry",
            deviceImei,
            geofence,
            coordinates
          );
          await this.saveGeofenceEvent(
            deviceImei,
            geofence._id.toString(),
            "entry",
            coordinates
          );
        } else if (!isInside && wasInside && geofence.alertOnExit) {
          // Device exited geofence
          this.broadcastGeofenceEvent(
            "exit",
            deviceImei,
            geofence,
            coordinates
          );
          await this.saveGeofenceEvent(
            deviceImei,
            geofence._id.toString(),
            "exit",
            coordinates
          );
        }

        // Update the state
        await this.updateGeofenceState(
          deviceImei,
          geofence._id.toString(),
          isInside
        );
      }
    } catch (error) {
      console.error("Error checking geofence events:", error);
    }
  }

  /**
   * Broadcast geofence event using RealTimeService
   */
  private broadcastGeofenceEvent(
    type: "entry" | "exit",
    deviceImei: string,
    geofence: IGeofence,
    coordinates: { lat: number; lng: number }
  ): void {
    if (this.realTimeService) {
      this.realTimeService.broadcastGeofenceEvent({
        type,
        deviceImei,
        geofenceId: geofence._id.toString(),
        geofenceName: geofence.name,
        timestamp: Date.now(),
        coordinates,
        userEmail: geofence.userEmail,
      });
    }
  }

  /**
   * Clear geofence state cache (useful for testing or cleanup)
   */
  public clearGeofenceStates(): void {
    this.geofenceStates.clear();
    console.log("[Geofence] 🧹 Cleared geofence state cache");
  }

  /**
   * Get current geofence states (for debugging)
   */
  public getGeofenceStates(): Map<string, boolean> {
    return new Map(this.geofenceStates);
  }
}
