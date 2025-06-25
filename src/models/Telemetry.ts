import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ITelemetry extends Document {
  imei: string;
  timestamp: number;
  tirePressure?: number;
  speed?: number;
  latlng?: string;
  altitude?: number;
  angle?: number;
  satellites?: number;
  event?: number;
  battery?: number;
  fuelLevel?: number;
  engineRpm?: number;
  engineOilTemp?: number;
  crashDetection?: number;
  engineLoad?: number;
  dtc?: number;
  externalVoltage?: number;
  totalMileage?: number;
  createdAt: Date;
  updatedAt: Date;
}

const TelemetrySchema = new Schema<ITelemetry>({
  imei: { type: String, required: true, index: true },
  timestamp: { type: Number, required: true, index: true },
  tirePressure: { type: Number },
  speed: { type: Number },
  latlng: { type: String },
  altitude: { type: Number },
  angle: { type: Number },
  satellites: { type: Number },
  event: { type: Number },
  battery: { type: Number },
  fuelLevel: { type: Number },
  engineRpm: { type: Number },
  engineOilTemp: { type: Number },
  crashDetection: { type: Number },
  engineLoad: { type: Number },
  dtc: { type: Number },
  externalVoltage: { type: Number },
  totalMileage: { type: Number }
}, { 
  timestamps: true,
  collection: 'telemetry'
});

// Compound index for IMEI and timestamp (for efficient queries)
TelemetrySchema.index({ imei: 1, timestamp: -1 });

// Index for latest telemetry queries
TelemetrySchema.index({ timestamp: -1 });

export const Telemetry = mongoose.model<ITelemetry>('Telemetry', TelemetrySchema); 