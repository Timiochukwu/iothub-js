import { Request, Response } from 'express';
import { RealTimeService } from '../services/RealTimeService';
import { ApiResponse } from '../types';

export class RealTimeController {
  private realTimeService: RealTimeService;

  constructor(realTimeService: RealTimeService) {
    this.realTimeService = realTimeService;
  }

  // GET /api/realtime/connections - Get all active connections
  getConnections = async (req: Request, res: Response<ApiResponse>): Promise<void> => {
    try {
      const connectedDevices = this.realTimeService.getConnectedDevices();
      const connectedUsers = this.realTimeService.getConnectedUsers();

      res.status(200).json({
        success: true,
        message: 'Connection status retrieved successfully',
        data: {
          devices: connectedDevices,
          users: connectedUsers,
          totalConnections: connectedDevices.length + connectedUsers.length,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get connection status',
        error: 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/realtime/devices - Get connected devices
  getConnectedDevices = async (req: Request, res: Response<ApiResponse>): Promise<void> => {
    try {
      const devices = this.realTimeService.getConnectedDevices();
      
      res.status(200).json({
        success: true,
        message: 'Connected devices retrieved successfully',
        data: {
          devices,
          count: devices.length,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get connected devices',
        error: 'INTERNAL_ERROR'
      });
    }
  };

  // GET /api/realtime/users - Get connected users
  getConnectedUsers = async (req: Request, res: Response<ApiResponse>): Promise<void> => {
    try {
      const users = this.realTimeService.getConnectedUsers();
      
      res.status(200).json({
        success: true,
        message: 'Connected users retrieved successfully',
        data: {
          users,
          count: users.length,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get connected users',
        error: 'INTERNAL_ERROR'
      });
    }
  };

  // POST /api/realtime/broadcast - Broadcast message to all connected clients
  broadcastMessage = async (req: Request, res: Response<ApiResponse>): Promise<void> => {
    try {
      const { event, data } = req.body;
      
      if (!event || !data) {
        res.status(400).json({
          success: false,
          message: 'Event and data are required',
          error: 'MISSING_PARAMETERS'
        });
        return;
      }

      this.realTimeService.broadcastToAll(event, data);
      
      res.status(200).json({
        success: true,
        message: 'Message broadcasted successfully',
        data: { event, timestamp: Date.now() }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to broadcast message',
        error: 'INTERNAL_ERROR'
      });
    }
  };

  // POST /api/realtime/device/:imei - Send message to specific device
  sendToDevice = async (req: Request, res: Response<ApiResponse>): Promise<void> => {
    try {
      const { imei } = req.params;
      const { event, data } = req.body;
      
      if (!imei) {
        res.status(400).json({
          success: false,
          message: 'Device IMEI is required',
          error: 'MISSING_PARAMETERS'
        });
        return;
      }
      
      if (!event || !data) {
        res.status(400).json({
          success: false,
          message: 'Event and data are required',
          error: 'MISSING_PARAMETERS'
        });
        return;
      }

      this.realTimeService.broadcastToDevice(imei, event, data);
      
      res.status(200).json({
        success: true,
        message: `Message sent to device ${imei}`,
        data: { imei, event, timestamp: Date.now() }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to send message to device',
        error: 'INTERNAL_ERROR'
      });
    }
  };

  // POST /api/realtime/user/:email - Send message to specific user
  sendToUser = async (req: Request, res: Response<ApiResponse>): Promise<void> => {
    try {
      const { email } = req.params;
      const { event, data } = req.body;
      
      if (!email) {
        res.status(400).json({
          success: false,
          message: 'User email is required',
          error: 'MISSING_PARAMETERS'
        });
        return;
      }
      
      if (!event || !data) {
        res.status(400).json({
          success: false,
          message: 'Event and data are required',
          error: 'MISSING_PARAMETERS'
        });
        return;
      }

      this.realTimeService.broadcastToUser(email, event, data);
      
      res.status(200).json({
        success: true,
        message: `Message sent to user ${email}`,
        data: { email, event, timestamp: Date.now() }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to send message to user',
        error: 'INTERNAL_ERROR'
      });
    }
  };
} 