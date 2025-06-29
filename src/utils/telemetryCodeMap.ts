// export const telemetryCodeMap: Record<string, string> = {
//   "16": "totalMileage",
//   "24": "speed",
//   sp: "speed",
//   "31": "engineLoad",
//   "30": "dtc",
//   "36": "engineRpm",
//   "48": "fuelLevel",
//   "58": "engineOilTemp",
//   "66": "externalVoltage",
//   "67": "battery",
//   "247": "crashDetection",
//   pr: "tyrePressure",
//   latlng: "latlng",
//   alt: "altitude",
//   ang: "angle",
//   sat: "satellites",
//   evt: "event",
//   ts: "timestamp",
//   "256": "vin",
// };

export const telemetryCodeMap: Record<string, string> = {
  // --- Your Original Mappings ---
  "16": "totalMileage",
  "24": "speed", // Note: Your sample uses "sp" for speed
  "30": "dtc", // (Diagnostic Trouble Codes)
  "31": "engineLoad",
  "36": "engineRpm",
  "48": "fuelLevel",
  "58": "engineOilTemp",
  "66": "externalVoltage",
  "67": "battery", // (Internal Battery Level %)
  "247": "crashDetection",
  "256": "vin",
  pr: "tyrePressure", // Note: Value is often a bitmask or string
  latlng: "latlng",
  alt: "altitude",
  ang: "angle",
  sat: "satellites",
  evt: "eventCode", // Changed to be more descriptive
  sp: "speed",
  ts: "timestamp",

  // --- New Mappings Based on Your Sample Data ---
  "21": "gsmSignalStrength",
  "68": "engineFuelRate",
  "69": "gpsStatus",
  "181": "engineCoolantTemp",
  "182": "acceleratorPedalPosition",
  "200": "sleepMode",
  "239": "ignition",
  "240": "movement",
  "241": "gsmOperatorCode",
};
