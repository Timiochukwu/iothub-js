import mongoose, { Schema, Document, Types } from "mongoose";

export interface IDeviceType extends Document {
  name: string;
  description?: string;
}

const DeviceTypeSchema = new Schema<IDeviceType>(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String },
  },
  { timestamps: true }
);

export const DeviceType = mongoose.model<IDeviceType>(
  "DeviceType",
  DeviceTypeSchema
);
