import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class CustomError extends Error {
  public statusCode: number;
  public code: string; // Add this property
  public isOperational: boolean;

  constructor(
    message: string, 
    statusCode: number = 500, 
    code: string = 'INTERNAL_ERROR', // Add code parameter
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code; // Set the code property
    this.isOperational = isOperational;
    
    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response<ApiResponse>,
  next: NextFunction
): void => {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal Server Error';

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  } else if (error.name === 'MongoError' && (error as any).code === 11000) {
    statusCode = 409;
    message = 'Duplicate field value';
  }

  // Log error in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', {
      message: error.message,
      stack: error.stack,
      statusCode,
      url: req.url,
      method: req.method,
      body: req.body,
      query: req.query,
      params: req.params,
    });
  }

  res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
  });
};

export const createValidationError = (message: string): CustomError => {
  return new CustomError(message, 400, 'VALIDATION_ERROR');
};

export const createNotFoundError = (message: string): CustomError => {
  return new CustomError(message, 404, 'NOT_FOUND');
};

export const createUnauthorizedError = (message: string): CustomError => {
  return new CustomError(message, 401, 'UNAUTHORIZED');
};

export const createForbiddenError = (message: string): CustomError => {
  return new CustomError(message, 403, 'FORBIDDEN');
};

export const createConflictError = (message: string): CustomError => {
  return new CustomError(message, 409, 'CONFLICT');
};

export const createInternalError = (message: string): CustomError => {
  return new CustomError(message, 500, 'INTERNAL_ERROR');
};

export const notFoundHandler = (
  req: Request,
  res: Response<ApiResponse>,
  next: NextFunction
): void => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    error: 'NOT_FOUND'
  });
}; 