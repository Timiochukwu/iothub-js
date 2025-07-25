// src/models/Collision.ts
import mongoose, { Schema, Types } from "mongoose";

const CollisionAlertSchema = new mongoose.Schema({
  device: { type: Types.ObjectId, ref: "Device", required: true },
  timestamp: { type: Date, required: true },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  message: { type: String, required: true },
  speed: { type: Number },
  rpm: { type: Number },
  data: {
    type: Schema.Types.Mixed,
    default: {},
  },
});

const CollisionAlertSettingsSchema = new mongoose.Schema({
  device: { type: Types.ObjectId, ref: "Device", required: true },
  timestamp: { type: Date, required: true },
  status: { type: Boolean, default: true },
});

export const CollisionAlert = mongoose.model(
  "CollisionAlert",
  CollisionAlertSchema
);

export const CollisionAlertSettings = mongoose.model(
  "CollisionAlertSettings",
  CollisionAlertSettingsSchema
);
