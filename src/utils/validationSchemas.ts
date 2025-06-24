import Joi from 'joi';

export const userSchemas = {
  register: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
    password: Joi.string().min(8).required().messages({
      'string.min': 'Password must be at least 8 characters long',
      'any.required': 'Password is required'
    }),
    firstName: Joi.string().min(2).max(100).optional(),
    lastName: Joi.string().min(2).max(100).optional(),
    phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).optional().messages({
      'string.pattern.base': 'Please provide a valid phone number'
    })
  }),

  login: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
    password: Joi.string().required().messages({
      'any.required': 'Password is required'
    })
  }),

  changePassword: Joi.object({
    email: Joi.string().email().required(),
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).required().messages({
      'string.min': 'New password must be at least 8 characters long'
    })
  }),

  update: Joi.object({
    email: Joi.string().email().required(),
    firstName: Joi.string().min(2).max(100).optional(),
    lastName: Joi.string().min(2).max(100).optional(),
    phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).optional()
  })
};

export const deviceSchemas = {
  register: Joi.object({
    imei: Joi.string().length(15).pattern(/^\d+$/).required().messages({
      'string.length': 'IMEI must be exactly 15 digits',
      'string.pattern.base': 'IMEI must contain only digits'
    }),
    name: Joi.string().min(2).max(100).optional(),
    description: Joi.string().max(500).optional()
  }),

  update: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    description: Joi.string().max(500).optional(),
    isActive: Joi.boolean().optional()
  }),

  switch: Joi.object({
    imei: Joi.string().length(15).pattern(/^\d+$/).required()
  })
};

export const querySchemas = {
  email: Joi.object({
    email: Joi.string().email().required()
  }),

  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10)
  })
}; 