import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDevice extends Document {
  imei: string;
  user: Types.ObjectId;
  deviceType?: string;
  vin?: string;
  make?: string;
  modelYear?: string;
  plateNumber?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceSchema = new Schema<IDevice>({
  imei: { type: String, required: true, unique: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  deviceType: { type: String },
  vin: { type: String },
  make: { type: String },
  modelYear: { type: String },
  plateNumber: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Compound index for IMEI and VIN (like in Java)
DeviceSchema.index({ imei: 1, vin: 1 }, { unique: true });

export const Device = mongoose.model<IDevice>('Device', DeviceSchema); 