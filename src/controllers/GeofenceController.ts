// src/controllers/GeofenceController.ts
import { Request, Response } from 'express';
import { GeofenceService, CreateGeofenceRequest, BulkOperation } from '../services/GeofenceService';
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

      await this.geofenceService.deleteGeofence(id);
      
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

      const bulkOp: BulkOperation = { ids, operation };
      const result = await this.geofenceService.bulkOperation(bulkOp);
      
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

  // GET /api/geofences/device/:imei - Get active geofences for device
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
          total: geofences.length,
          deviceImei: imei
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };


  // GET /api/geofences/imei/:imei - Get all geofences for specific IMEI
getGeofencesByImei = async (req: Request, res: Response): Promise<void> => {
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

    // Validate IMEI format
    if (!/^\d{15}$/.test(imei)) {
      res.status(400).json({
        success: false,
        message: 'Invalid IMEI format. IMEI must be 15 digits',
        error: 'INVALID_IMEI'
      });
      return;
    }

    const geofences = await this.geofenceService.getGeofencesByImei(imei);
    
    res.status(200).json({
      success: true,
      data: geofences,
      meta: {
        total: geofences.length,
        deviceImei: imei
      }
    });
  } catch (error) {
    this.handleError(res, error);
  }
};

  // Error handling utility
  private handleError(res: Response, error: any): void {
    if (error instanceof CustomError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        error: error.code || 'CUSTOM_ERROR'
      });
    } else {
      console.error('Unexpected error:', error);
      res.status(500).json({
        success: false,
        message: 'An unexpected error occurred',
        error: 'INTERNAL_SERVER_ERROR'
      });
    }
  }
}