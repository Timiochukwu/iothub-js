import mongoose, { Schema, Types } from "mongoose";

const notificationSchema = new Schema({
  user: { type: Types.ObjectId, ref: "User", required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    required: true,
    default: "general",
  },
  read: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
});

const Notification = mongoose.model("Notification", notificationSchema);

export { Notification };
export type NotificationType = {
  user: Types.ObjectId;
  message: string;
  read?: boolean;
  type?: string; // e.g., "general", "alert", "warning", etc.
  timestamp?: Date;
};
