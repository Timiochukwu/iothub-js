import Joi from "joi";

export const userSchemas = {
  register: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Please provide a valid email address",
      "any.required": "Email is required",
    }),
    password: Joi.string().min(8).required().messages({
      "string.min": "Password must be at least 8 characters long",
      "any.required": "Password is required",
    }),
    firstName: Joi.string().min(2).max(100).optional(),
    lastName: Joi.string().min(2).max(100).optional(),
    phone: Joi.string()
      .pattern(/^\+?[\d\s\-\(\)]+$/)
      .optional(),
  }),

  login: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Please provide a valid email address",
      "any.required": "Email is required",
    }),
    password: Joi.string().required().messages({
      "any.required": "Password is required",
    }),
  }),

  changePassword: Joi.object({
    email: Joi.string().email().required(),
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).required().messages({
      "string.min": "New password must be at least 8 characters long",
    }),
  }),

  update: Joi.object({
    email: Joi.string().email().required(),
    firstName: Joi.string().min(2).max(100).optional(),
    lastName: Joi.string().min(2).max(100).optional(),
    phone: Joi.string()
      .pattern(/^\+?[\d\s\-\(\)]+$/)
      .optional(),
  }),
};

export const deviceTypeSchemas = {
  create: Joi.object({
    name: Joi.string().min(2).max(100).required().messages({
      "string.min": "Name must be at least 2 characters long",
      "string.max": "Name must be at most 100 characters long",
      "any.required": "Name is required",
    }),
    description: Joi.string().max(500).optional().messages({
      "string.max": "Description must be at most 500 characters long",
    }),
  }),

  update: Joi.object({
    name: Joi.string().min(2).max(100).optional().messages({
      "string.min": "Name must be at least 2 characters long",
      "string.max": "Name must be at most 100 characters long",
    }),
    description: Joi.string().max(500).optional().messages({
      "string.max": "Description must be at most 500 characters long",
    }),
  }),
};

export const deviceSchemas = {
  register: Joi.object({
    imei: Joi.string().length(15).pattern(/^\d+$/).required().messages({
      "string.length": "IMEI must be exactly 15 digits",
      "string.pattern.base": "IMEI must contain only digits",
    }),
    deviceType: Joi.string().optional(),
    vin: Joi.string().optional(),
    make: Joi.string().optional(),
    modelYear: Joi.string().optional(),
    plateNumber: Joi.string().optional(),
  }),

  update: Joi.object({
    deviceType: Joi.string().optional(),
    vin: Joi.string().optional(),
    make: Joi.string().optional(),
    modelYear: Joi.string().optional(),
    plateNumber: Joi.string().optional(),
    isActive: Joi.boolean().optional(),
  }),

  switch: Joi.object({
    // email: Joi.string().email().required(),
    // userId: Joi.string().required(),
    imei: Joi.string().length(15).pattern(/^\d+$/).required(),
  }),
};

export const querySchemas = {
  email: Joi.object({
    email: Joi.string().email().required(),
  }),

  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
  }),
};

export const telemetrySchemas = {
  ingest: Joi.object({
    imei: Joi.string().required().messages({
      "any.required": "IMEI is required",
    }),
    payload: Joi.object({
      state: Joi.object({
        reported: Joi.object().required(),
      }).required(),
    }).required(),
  }),

  userQuery: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Please provide a valid email address",
      "any.required": "Email is required",
    }),
  }),
};
