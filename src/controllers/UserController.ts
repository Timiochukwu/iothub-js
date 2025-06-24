import { Request, Response } from 'express';
import { UserService } from '../services/UserService';
import { validateRequest, validateQuery } from '../middleware/validation';
import { userSchemas, querySchemas } from '../utils/validationSchemas';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import { CustomError } from '../middleware/errorHandler';

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  register = async (req: Request, res: Response<ApiResponse>): Promise<void> => {
    try {
      const result = await this.userService.register(req.body);
      res.status(201).json(result);
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  login = async (req: Request, res: Response<ApiResponse>): Promise<void> => {
    try {
      const result = await this.userService.login(req.body);
      res.status(200).json(result);
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  refreshToken = async (req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated',
          error: 'UNAUTHORIZED'
        });
        return;
      }

      const result = await this.userService.refreshToken(req.user.userId, req.user.email);
      res.status(200).json(result);
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  searchUser = async (req: Request, res: Response<ApiResponse>): Promise<void> => {
    try {
      const { email } = req.query as { email: string };
      const result = await this.userService.searchUser(email);
      res.status(200).json(result);
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  updateUser = async (req: Request, res: Response<ApiResponse>): Promise<void> => {
    try {
      const result = await this.userService.updateUser(req.body);
      res.status(200).json(result);
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  changePassword = async (req: Request, res: Response<ApiResponse>): Promise<void> => {
    try {
      const result = await this.userService.changePassword(req.body);
      res.status(200).json(result);
    } catch (error) {
      const customError = error as CustomError;
      res.status(customError.statusCode || 500).json({
        success: false,
        message: customError.message,
        error: customError.statusCode ? undefined : 'INTERNAL_ERROR'
      });
    }
  };

  deleteUser = async (req: Request, res: Response<ApiResponse>): Promise<void> => {
    try {
      const { email } = req.query as { email: string };
      const result = await this.userService.deleteUser(email);
      res.status(200).json(result);
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