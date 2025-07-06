// src/models/WorkingHours.ts
import mongoose, { Schema, Types } from "mongoose";

const WorkingHoursSchema = new mongoose.Schema({
  imei: { type: String, required: true },
  date: { type: Date, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  durationSeconds: { type: Number, required: true },
  startLocation: {
    lat: Number,
    lng: Number,
  },
  endLocation: {
    lat: Number,
    lng: Number,
  },
  overworked: { type: Boolean, default: false },
});

const WorkingHourAlertSchema = new Schema({
  user: { type: Types.ObjectId, ref: "User", required: true },
  device: { type: Types.ObjectId, ref: "Device", required: true },
  schedule: {
    startTime: { type: String, required: true }, // e.g., "09:00 AM"
    endTime: { type: String, required: true },   // e.g., "05:00 PM"
  },
  location: { type: String },
  status: { type: String, enum: ["active", "expired", "disabled"], default: "active" },
  violations: [
    {
      timestamp: { type: Date, required: true },
      location: {
        lat: Number,
        lng: Number,
      },
      durationSeconds: { type: Number },
      status: { type: String, enum: ["active", "resolved"], default: "active" },
    }
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const WorkingHours = mongoose.model("WorkingHours", WorkingHoursSchema);
export const WorkingHourAlert = mongoose.model("WorkingHourAlert", WorkingHourAlertSchema);
