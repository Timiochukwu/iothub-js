// src/models/WorkingHours.ts
import mongoose, { Schema, Types } from "mongoose";

const WorkingHoursSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true },
  // date: { type: Date, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  triggered: { type: Boolean, default: false },
  startLocation: {
    lat: Number,
    lng: Number,
  },
  endLocation: {
    lat: Number,
    lng: Number,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  // overworked: { type: Boolean, default: false },
});

const WorkingHourAlertSchema = new Schema({
  device: { type: Types.ObjectId, ref: "Device", required: true },
  timestamp: { type: Date, required: true },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  message: { type: String, required: true },
  status: {
    type: String,
    enum: ["danger", "warning", "info", "success", "pending"],
    default: "pending",
  },
  data: {
    type: Schema.Types.Mixed,
  },
});

export const WorkingHours = mongoose.model("WorkingHours", WorkingHoursSchema);
export const WorkingHourAlert = mongoose.model(
  "WorkingHourAlert",
  WorkingHourAlertSchema
);
