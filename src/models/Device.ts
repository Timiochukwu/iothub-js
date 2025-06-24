import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDevice extends Document {
  imei: string;
  user: Types.ObjectId;
  name?: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceSchema = new Schema<IDevice>({
  imei: { type: String, required: true, unique: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String },
  description: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export const Device = mongoose.model<IDevice>('Device', DeviceSchema); 