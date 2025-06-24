import { Request, Response, NextFunction } from 'express';
import { JwtUtils } from '../utils/jwt';
import { ApiResponse } from '../types';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

export const authenticateToken = (
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({
        success: false,
        message: 'Access token is required',
        error: 'MISSING_TOKEN'
      });
      return;
    }

    const token = JwtUtils.extractTokenFromHeader(authHeader);
    const decoded = JwtUtils.verifyToken(token);
    
    req.user = {
      userId: decoded.userId,
      email: decoded.email
    };
    
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
      error: 'INVALID_TOKEN'
    });
  }
};

export const optionalAuth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader) {
      const token = JwtUtils.extractTokenFromHeader(authHeader);
      const decoded = JwtUtils.verifyToken(token);
      
      req.user = {
        userId: decoded.userId,
        email: decoded.email
      };
    }
    
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
}; 