// src/controllers/GeofenceController.ts
import { Request, Response } from 'express';
import { GeofenceService, CreateGeofenceRequest, BulkOperation } from '../services/GeofenceService';
import { WebSocketService } from '../services/WebSocketService';
import { CustomError } from '../middleware/errorHandler';

export class GeofenceController {
  private geofenceService: GeofenceService;
  private webSocketService: WebSocketService;

  constructor(webSocketService: WebSocketService) {
    this.geofenceService = new GeofenceService();
    this.webSocketService = webSocketService;
  }

  // POST /api/geofences - Create new geofence
  createGeofence = async (req: Request, res: Response): Promise<void> => {
    try {
      const geofenceData: CreateGeofenceRequest = req.body;
      const geofence = await this.geofenceService.createGeofence(geofenceData);
      
      // Notify WebSocket clients
      this.webSocketService.notifyGeofenceCreated(geofence);
      
      res.status(201).json({
        success: true,
        message: 'Geofence created successfully',
        data: geofence
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  // PUT /api/geofences/:id - Update geofence
  updateGeofence = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ 
          success: false, 
          message: 'Geofence ID is required', 
          error: 'MISSING_ID' 
        });
        return;
      }

      const updateData: Partial<CreateGeofenceRequest> = req.body;
      const geofence = await this.geofenceService.updateGeofence(id, updateData);
      
      // Notify WebSocket clients
      this.webSocketService.notifyGeofenceUpdated(geofence);
      
      res.status(200).json({
        success: true,
        message: 'Geofence updated successfully',
        data: geofence
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  // GET /api/geofences - List geofences with enhanced filtering
  listGeofences = async (req: Request, res: Response): Promise<void> => {
    try {
      const query = {
        deviceImei: req.query.deviceImei as string,
        userEmail: req.query.userEmail as string,
        isActive: req.query.isActive ? req.query.isActive === 'true' : undefined,
        isTemplate: req.query.isTemplate ? req.query.isTemplate === 'true' : undefined,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        search: req.query.search as string,
        sortBy: req.query.sortBy as 'name' | 'createdAt' | 'lastActivity',
        sortOrder: req.query.sortOrder as 'asc' | 'desc',
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
      };

      // Validate pagination parameters
      if (query.limit && (query.limit < 1 || query.limit > 100)) {
        res.status(400).json({
          success: false,
          message: 'Limit must be between 1 and 100',
          error: 'INVALID_LIMIT'
        });
        return;
      }

      if (query.offset && query.offset < 0) {
        res.status(400).json({
          success: false,
          message: 'Offset must be non-negative',
          error: 'INVALID_OFFSET'
        });
        return;
      }

      const result = await this.geofenceService.listGeofences(query);
      
      res.status(200).json({
        success: true,
        data: result.geofences,
        meta: {
          total: result.total,
          hasMore: result.hasMore,
          limit: query.limit || 50,
          offset: query.offset || 0,
          filters: {
            deviceImei: query.deviceImei,
            userEmail: query.userEmail,
            isActive: query.isActive,
            isTemplate: query.isTemplate,
            tags: query.tags,
            search: query.search
          }
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  // GET /api/geofences/:id - Get single geofence
  getGeofence = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ 
          success: false, 
          message: 'Geofence ID is required', 
          error: 'MISSING_ID' 
        });
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
      this.handleError(res, error);
    }
  };

  // DELETE /api/geofences/:id - Delete geofence
  deleteGeofence = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ 
          success: false, 
          message: 'Geofence ID is required', 
          error: 'MISSING_ID' 
        });
        return;
      }

      // Get geofence data before deletion for notification
      const geofence = await this.geofenceService.getGeofenceById(id);
      if (!geofence) {
        res.status(404).json({
          success: false,
          message: 'Geofence not found',
          error: 'NOT_FOUND'
        });
        return;
      }

      await this.geofenceService.deleteGeofence(id);
      
      // Notify WebSocket clients
      this.webSocketService.notifyGeofenceDeleted(
        id, 
        geofence.name, 
        geofence.userEmail, 
        geofence.deviceImei
      );
      
      res.status(200).json({
        success: true,
        message: 'Geofence deleted successfully'
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  // PATCH /api/geofences/:id/toggle - Toggle geofence active status
  toggleGeofence = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      if (!id) {
        res.status(400).json({ 
          success: false, 
          message: 'Geofence ID is required', 
          error: 'MISSING_ID' 
        });
        return;
      }

      if (typeof isActive !== 'boolean') {
        res.status(400).json({
          success: false,
          message: 'isActive must be a boolean value',
          error: 'INVALID_ACTIVE_STATUS'
        });
        return;
      }

      const geofence = await this.geofenceService.toggleGeofence(id, isActive);
      
      // Notify WebSocket clients
      this.webSocketService.notifyGeofenceToggled(
        id, 
        geofence.name, 
        isActive, 
        geofence.userEmail, 
        geofence.deviceImei
      );
      
      res.status(200).json({
        success: true,
        message: `Geofence ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: geofence
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  // POST /api/geofences/bulk - Bulk operations
  bulkOperation = async (req: Request, res: Response): Promise<void> => {
    try {
      const { ids, operation } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({
          success: false,
          message: 'IDs array is required and must not be empty',
          error: 'MISSING_IDS'
        });
        return;
      }

      if (!operation || !['activate', 'deactivate', 'delete'].includes(operation)) {
        res.status(400).json({
          success: false,
          message: 'Operation must be one of: activate, deactivate, delete',
          error: 'INVALID_OPERATION'
        });
        return;
      }

      // Get geofence data before bulk operation for notifications
      const geofences = await Promise.all(
        ids.map(id => this.geofenceService.getGeofenceById(id))
      );

      const bulkOp: BulkOperation = { ids, operation };
      const result = await this.geofenceService.bulkOperation(bulkOp);
      
      // Notify WebSocket clients for successful operations
      geofences.forEach((geofence, index) => {
        if (geofence && !result.errors.find(err => err.id === ids[index])) {
          switch (operation) {
            case 'activate':
            case 'deactivate':
              this.webSocketService.notifyGeofenceToggled(
                geofence._id.toString(),
                geofence.name,
                operation === 'activate',
                geofence.userEmail,
                geofence.deviceImei
              );
              break;
            case 'delete':
              this.webSocketService.notifyGeofenceDeleted(
                geofence._id.toString(),
                geofence.name,
                geofence.userEmail,
                geofence.deviceImei
              );
              break;
          }
        }
      });
      
      res.status(200).json({
        success: true,
        message: `Bulk ${operation} operation completed`,
        data: result
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  // POST /api/geofences/template/:templateId - Create from template
  createFromTemplate = async (req: Request, res: Response): Promise<void> => {
    try {
      const { templateId } = req.params;
      const overrides: Partial<CreateGeofenceRequest> = req.body;

      if (!templateId) {
        res.status(400).json({ 
          success: false, 
          message: 'Template ID is required', 
          error: 'MISSING_TEMPLATE_ID' 
        });
        return;
      }

      const geofence = await this.geofenceService.createFromTemplate(templateId, overrides);
      
      // Notify WebSocket clients
      this.webSocketService.notifyGeofenceCreated(geofence);
      
      res.status(201).json({
        success: true,
        message: 'Geofence created from template successfully',
        data: geofence
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  // GET /api/geofences/stats - Get geofence statistics
  getStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const userEmail = req.query.userEmail as string;
      const deviceImei = req.query.deviceImei as string;

      const stats = await this.geofenceService.getGeofenceStats(userEmail, deviceImei);
      
      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  // GET /api/geofences/events - Get geofence events
  getEvents = async (req: Request, res: Response): Promise<void> => {
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

      // Validate pagination parameters
      if (query.limit && (query.limit < 1 || query.limit > 100)) {
        res.status(400).json({
          success: false,
          message: 'Limit must be between 1 and 100',
          error: 'INVALID_LIMIT'
        });
        return;
      }

      if (query.offset && query.offset < 0) {
        res.status(400).json({
          success: false,
          message: 'Offset must be non-negative',
          error: 'INVALID_OFFSET'
        });
        return;
      }

      // Validate date parameters
      if (query.startDate && isNaN(query.startDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid start date format',
          error: 'INVALID_START_DATE'
        });
        return;
      }

      if (query.endDate && isNaN(query.endDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid end date format',
          error: 'INVALID_END_DATE'
        });
        return;
      }

      // Validate date range
      if (query.startDate && query.endDate && query.startDate > query.endDate) {
        res.status(400).json({
          success: false,
          message: 'Start date cannot be after end date',
          error: 'INVALID_DATE_RANGE'
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
          offset: query.offset || 0,
          filters: {
            imei: query.imei,
            geofenceId: query.geofenceId,
            type: query.type,
            startDate: query.startDate,
            endDate: query.endDate
          }
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  // GET /api/geofences/device/:imei - Get active geofences for a device
  getDeviceGeofences = async (req: Request, res: Response): Promise<void> => {
    try {
      const { imei } = req.params;
      
      if (!imei) {
        res.status(400).json({
          success: false,
          message: 'Device IMEI is required',
          error: 'MISSING_IMEI'
        });
        return;
      }

      const geofences = await this.geofenceService.getActiveGeofencesForDevice(imei);
      
      res.status(200).json({
        success: true,
        data: geofences,
        meta: {
          count: geofences.length,
          deviceImei: imei
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  // POST /api/geofences/check - Check if point is inside geofences
  checkPoint = async (req: Request, res: Response): Promise<void> => {
    try {
      const { lat, lng, imei } = req.body;

      if (typeof lat !== 'number' || typeof lng !== 'number') {
        res.status(400).json({
          success: false,
          message: 'Latitude and longitude must be numbers',
          error: 'INVALID_COORDINATES'
        });
        return;
      }

      if (lat < -90 || lat > 90) {
        res.status(400).json({
          success: false,
          message: 'Latitude must be between -90 and 90 degrees',
          error: 'INVALID_LATITUDE'
        });
        return;
      }

      if (lng < -180 || lng > 180) {
        res.status(400).json({
          success: false,
          message: 'Longitude must be between -180 and 180 degrees',
          error: 'INVALID_LONGITUDE'
        });
        return;
      }

      if (!imei) {
        res.status(400).json({
          success: false,
          message: 'Device IMEI is required',
          error: 'MISSING_IMEI'
        });
        return;
      }

      const geofences = await this.geofenceService.getActiveGeofencesForDevice(imei);
      const insideGeofences = [];

      for (const geofence of geofences) {
        let isInside = false;
        
        if (geofence.type === 'circle' && geofence.center && geofence.radius) {
          isInside = this.geofenceService.isPointInCircle(
            lat, lng, 
            geofence.center.lat, 
            geofence.center.lng, 
            geofence.radius
          );
        } else if (geofence.type === 'polygon' && geofence.coordinates) {
          isInside = this.geofenceService.isPointInPolygon(lat, lng, geofence.coordinates);
        }

        if (isInside) {
          insideGeofences.push({
            id: geofence._id,
            name: geofence.name,
            type: geofence.type,
            alertOnEntry: geofence.alertOnEntry,
            alertOnExit: geofence.alertOnExit,
            color: geofence.color,
            tags: geofence.tags
          });
        }
      }

      res.status(200).json({
        success: true,
        data: {
          point: { lat, lng },
          insideGeofences,
          count: insideGeofences.length
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  // POST /api/geofences/duplicate/:id - Duplicate a geofence
  duplicateGeofence = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { name, deviceImei, userEmail } = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Geofence ID is required',
          error: 'MISSING_ID'
        });
        return;
      }

      const originalGeofence = await this.geofenceService.getGeofenceById(id);
      if (!originalGeofence) {
        res.status(404).json({
          success: false,
          message: 'Geofence not found',
          error: 'NOT_FOUND'
        });
        return;
      }

      const duplicateData: CreateGeofenceRequest = {
        name: name || `${originalGeofence.name} Copy`,
        description: originalGeofence.description,
        type: originalGeofence.type,
        center: originalGeofence.center,
        radius: originalGeofence.radius,
        coordinates: originalGeofence.coordinates,
        deviceImei: deviceImei || originalGeofence.deviceImei,
        userEmail: userEmail || originalGeofence.userEmail,
        alertOnEntry: originalGeofence.alertOnEntry,
        alertOnExit: originalGeofence.alertOnExit,
        address: originalGeofence.address,
        locationName: originalGeofence.locationName,
        color: originalGeofence.color,
        tags: originalGeofence.tags,
        isTemplate: false
      };

      const duplicatedGeofence = await this.geofenceService.createGeofence(duplicateData);
      
      // Notify WebSocket clients
      this.webSocketService.notifyGeofenceCreated(duplicatedGeofence);
      
      res.status(201).json({
        success: true,
        message: 'Geofence duplicated successfully',
        data: duplicatedGeofence
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  // GET /api/geofences/export - Export geofences
  exportGeofences = async (req: Request, res: Response): Promise<void> => {
    try {
      const { format = 'json', deviceImei, userEmail } = req.query;

      if (!['json', 'csv'].includes(format as string)) {
        res.status(400).json({
          success: false,
          message: 'Format must be either json or csv',
          error: 'INVALID_FORMAT'
        });
        return;
      }

      const query = {
        deviceImei: deviceImei as string,
        userEmail: userEmail as string,
        isTemplate: false,
        limit: 1000 // Export limit
      };

      const result = await this.geofenceService.listGeofences(query);
      
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="geofences.json"');
        res.status(200).json(result.geofences);
      } else {
        // CSV format
        const csvHeaders = 'Name,Type,Description,Center Lat,Center Lng,Radius,Active,Created At\n';
        const csvData = result.geofences.map(g => {
          const centerLat = g.center?.lat || '';
          const centerLng = g.center?.lng || '';
          const radius = g.radius || '';
          return `"${g.name}","${g.type}","${g.description || ''}","${centerLat}","${centerLng}","${radius}","${g.isActive}","${g.createdAt}"`;
        }).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="geofences.csv"');
        res.status(200).send(csvHeaders + csvData);
      }
    } catch (error) {
      this.handleError(res, error);
    }
  };

  // Private helper method for error handling
  private handleError(res: Response, error: any): void {
    console.error('GeofenceController Error:', error);
    
    if (error instanceof CustomError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        error: error.code || 'CUSTOM_ERROR'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'An unexpected error occurred. Please try again later.',
        error: 'INTERNAL_SERVER_ERROR'
      });
    }
  }
}