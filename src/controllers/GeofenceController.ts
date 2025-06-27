// src/controllers/GeofenceController.ts
import { Request, Response } from 'express';
import { GeofenceService, CreateGeofenceRequest } from '../services/GeofenceService';
import { CustomError } from '../middleware/errorHandler';

export class GeofenceController {
  private geofenceService: GeofenceService;

  constructor() {
    this.geofenceService = new GeofenceService();
  }

  // POST /api/geofences - Create new geofence
  createGeofence = async (req: Request, res: Response): Promise<void> => {
    try {
      const geofenceData: CreateGeofenceRequest = req.body;
      const geofence = await this.geofenceService.createGeofence(geofenceData);
      
      res.status(201).json({
        success: true,
        message: 'Geofence created successfully',
        data: geofence
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // PUT /api/geofences/:id - Update geofence
  updateGeofence = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, message: 'Geofence id is required', error: 'MISSING_ID' });
        return;
      }
      const updateData: Partial<CreateGeofenceRequest> = req.body;
      
      const geofence = await this.geofenceService.updateGeofence(id, updateData);
      
      res.status(200).json({
        success: true,
        message: 'Geofence updated successfully',
        data: geofence
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/geofences - List geofences with optional filtering
  listGeofences = async (req: Request, res: Response): Promise<void> => {
    try {
      const query = {
        deviceImei: req.query.deviceImei as string,
        userEmail: req.query.userEmail as string,
        isActive: req.query.isActive ? req.query.isActive === 'true' : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
      };

      const result = await this.geofenceService.listGeofences(query);
      
      res.status(200).json({
        success: true,
        data: result.geofences,
        meta: {
          total: result.total,
          hasMore: result.hasMore,
          limit: query.limit || 50,
          offset: query.offset || 0
        }
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/geofences/:id - Get single geofence
  getGeofence = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, message: 'Geofence id is required', error: 'MISSING_ID' });
        return;
      }
      const geofence = await this.geofenceService.getGeofenceById(id);
      
      if (!geofence) {
        res.status(404).json({
          success: false,
          message: 'Geofence not found',
          error: 'NOT_FOUND'
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        data: geofence
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // DELETE /api/geofences/:id - Delete geofence
  deleteGeofence = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, message: 'Geofence id is required', error: 'MISSING_ID' });
        return;
      }
      await this.geofenceService.deleteGeofence(id);
      
      res.status(200).json({
        success: true,
        message: 'Geofence deleted successfully'
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // PATCH /api/geofences/:id/toggle - Toggle geofence active status
  toggleGeofence = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, message: 'Geofence id is required', error: 'MISSING_ID' });
        return;
      }
      const { isActive } = req.body;
      
      if (typeof isActive !== 'boolean') {
        res.status(400).json({
          success: false,
          message: 'isActive must be a boolean',
          error: 'INVALID_INPUT'
        });
        return;
      }
      
      const geofence = await this.geofenceService.toggleGeofence(id, isActive);
      
      res.status(200).json({
        success: true,
        message: `Geofence ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: geofence
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/geofences/events - Get geofence events
  getGeofenceEvents = async (req: Request, res: Response): Promise<void> => {
    try {
      const query = {
        imei: req.query.imei as string,
        geofenceId: req.query.geofenceId as string,
        type: req.query.type as 'entry' | 'exit',
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
      };

      // Validate dates
      if (query.startDate && isNaN(query.startDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid startDate format',
          error: 'INVALID_DATE'
        });
        return;
      }
      
      if (query.endDate && isNaN(query.endDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid endDate format',
          error: 'INVALID_DATE'
        });
        return;
      }

      const result = await this.geofenceService.getGeofenceEvents(query);
      
      res.status(200).json({
        success: true,
        data: result.events,
        meta: {
          total: result.total,
          hasMore: result.hasMore,
          limit: query.limit || 50,
          offset: query.offset || 0
        }
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/geofences/device/:imei - Get geofences for specific device
  getDeviceGeofences = async (req: Request, res: Response): Promise<void> => {
    try {
      const { imei } = req.params;
      if (!imei) {
        res.status(400).json({ success: false, message: 'Device IMEI is required', error: 'MISSING_IMEI' });
        return;
      }
      const geofences = await this.geofenceService.getActiveGeofencesForDevice(imei);
      
      res.status(200).json({
        success: true,
        data: geofences,
        meta: {
          total: geofences.length,
          imei
        }
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  // POST /api/geofences/check-point - Check if a point is inside any geofences
  checkPoint = async (req: Request, res: Response): Promise<void> => {
    try {
      const { lat, lng, deviceImei } = req.body;
      
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        res.status(400).json({
          success: false,
          message: 'lat and lng must be numbers',
          error: 'INVALID_COORDINATES'
        });
        return;
      }
      
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        res.status(400).json({
          success: false,
          message: 'Invalid coordinates range',
          error: 'INVALID_COORDINATES'
        });
        return;
      }
  
      let geofences;
      if (deviceImei) {
        geofences = await this.geofenceService.getActiveGeofencesForDevice(deviceImei);
      } else {
        const result = await this.geofenceService.listGeofences({ isActive: true });
        geofences = result.geofences;
      }
      
      const matches = [];
      for (const geofence of geofences) {
        let isInside = false;
        
        if (geofence.type === 'circle' && geofence.center && geofence.radius) {
          isInside = this.geofenceService.isPointInCircle(
            lat, lng, 
            geofence.center.lat, geofence.center.lng, 
            geofence.radius
          );
        } else if (geofence.type === 'polygon' && geofence.coordinates) {
          isInside = this.geofenceService.isPointInPolygon(
            lat, lng, 
            geofence.coordinates
          );
        }
        
        if (isInside) {
          matches.push({
            id: geofence.id,
            name: geofence.name,
            type: geofence.type,
            description: geofence.description
          });
        }
      }
      
      res.status(200).json({
        success: true,
        data: {
          point: { lat, lng },
          matches,
          matchCount: matches.length,
          deviceImei: deviceImei || null,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };
}