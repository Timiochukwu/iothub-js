import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IGeofenceEvent extends Document {
  _id: Types.ObjectId;
  imei: string;
  geofenceId: Types.ObjectId;
  type: 'entry' | 'exit';
  timestamp: number;
  latlng: string;
  altitude?: number;
  angle?: number;
  createdAt: Date;
  updatedAt: Date;
}

const GeofenceEventSchema = new Schema<IGeofenceEvent>({
  imei: { type: String, required: true },
  geofenceId: { type: Schema.Types.ObjectId, ref: 'Geofence', required: true },
  type: { type: String, enum: ['entry', 'exit'], required: true },
  timestamp: { type: Number, required: true },
  latlng: { type: String, required: true },
  altitude: { type: Number },
  angle: { type: Number },
}, {
  timestamps: true,
  collection: 'geofence_events'
});

export const GeofenceEvent = mongoose.model<IGeofenceEvent>('GeofenceEvent', GeofenceEventSchema);
 