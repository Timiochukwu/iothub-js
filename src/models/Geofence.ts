// src/models/Geofence.ts
import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IGeofence extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  type: 'circle' | 'polygon';
  
  // For circle geofences
  center?: {
    lat: number;
    lng: number;
  };
  radius?: number; // in meters
  
  // For polygon geofences
  coordinates?: Array<{
    lat: number;
    lng: number;
  }>;
  
  // Association
  deviceImei?: string;
  userEmail?: string;
  
  // Settings
  alertOnEntry: boolean;
  alertOnExit: boolean;
  isActive: boolean;
  
  // Additional properties (these were missing)
  address?: string;
  locationName?: string;
  color?: string;
  tags?: string[];
  lastActivity?: Date;
  isTemplate?: boolean;
  templateName?: string;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

const GeofenceSchema = new Schema<IGeofence>({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  type: {
    type: String,
    enum: ['circle', 'polygon'],
    required: true
  },
  center: {
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 }
  },
  radius: {
    type: Number,
    min: 1,
    max: 100000 // max 100km
  },
  coordinates: [{
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 }
  }],
  deviceImei: {
    type: String,
    trim: true
  },
  userEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  alertOnEntry: {
    type: Boolean,
    default: true
  },
  alertOnExit: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Add the missing schema fields
  address: {
    type: String,
    trim: true,
    maxlength: 200
  },
  locationName: {
    type: String,
    trim: true,
    maxlength: 100
  },
  color: {
    type: String,
    trim: true,
    default: '#3B82F6' // Default blue color
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  lastActivity: {
    type: Date,
    default: Date.now
  },
  isTemplate: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Validation middleware
GeofenceSchema.pre('save', function(next) {
  if (this.type === 'circle') {
    if (!this.center || !this.radius) {
      return next(new Error('Circle geofence requires center and radius'));
    }
    // Clear polygon data
    this.coordinates = undefined;
  } else if (this.type === 'polygon') {
    if (!this.coordinates || this.coordinates.length < 3) {
      return next(new Error('Polygon geofence requires at least 3 coordinates'));
    }
    // Clear circle data
    this.center = undefined;
    this.radius = undefined;
  }
  next();
});

// Indexes for performance
GeofenceSchema.index({ deviceImei: 1 });
GeofenceSchema.index({ userEmail: 1 });
GeofenceSchema.index({ isActive: 1 });
GeofenceSchema.index({ isTemplate: 1 });
GeofenceSchema.index({ tags: 1 });
GeofenceSchema.index({ lastActivity: -1 });
GeofenceSchema.index({ 'center.lat': 1, 'center.lng': 1 });

export const Geofence = mongoose.model<IGeofence>('Geofence', GeofenceSchema);