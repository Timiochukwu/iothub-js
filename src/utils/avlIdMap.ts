export const AVL_ID_MAP = {
    RPM: "36",
  
    // --- OBD & Vehicle Parameters ---
    TOTAL_ODOMETER: 16,
    DTC_COUNT: 30, // Number of Diagnostic Trouble Codes
    ENGINE_LOAD: 31,
    COOLANT_TEMPERATURE: 32, // in Celsius
    SHORT_FUEL_TRIM: 33, // as a percentage
    ENGINE_RPM: 36,
    SPEED: 37, // OBD reported speed in Kph
    TIMING_ADVANCE: 38,
    INTAKE_AIR_TEMPERATURE: 39,
    RUNTIME_SINCE_ENGINE_START: 42, // in Seconds
    DISTANCE_TRAVELED_MIL_ON: 43, // MIL = Malfunction Indicator Lamp
    FUEL_RAIL_PRESSURE: 45, // in kPa
    FUEL_LEVEL: 48, // Can be percentage or raw value (e.g., Liters, mL)
    DISTANCE_SINCE_CODES_CLEAR: 49,
    BAROMETRIC_PRESSURE: 50, // in kPa
    CONTROL_MODULE_VOLTAGE: 51, // in Millivolts (mV)
    ABSOLUTE_LOAD_VALUE: 52,
    AMBIENT_AIR_TEMPERATURE: 53,
    OBD_OEM_TOTAL_MILEAGE: 389,
    COMMANDED_EQUIVALENCE_RATIO: 541,
    FUEL_TYPE: 759,
  
    // --- Device & Power Parameters ---
    EXTERNAL_VOLTAGE: 66, // Vehicle battery voltage in Millivolts (mV)
    BATTERY_VOLTAGE: 67, // Device internal battery voltage in Millivolts (mV)
    BATTERY_CURRENT: 68,
  
    // --- GNSS (GPS) Parameters ---
    GNSS_STATUS: 69,
    GNSS_PDOP: 181, // Position Dilution of Precision
    GNSS_HDOP: 182, // Horizontal Dilution of Precision
    SATELLITES: "sat",
    LAT_LNG: "latlng",
    ALTITUDE: "alt",
    ANGLE: "ang",
  
    // --- Network & Device Status ---
    GSM_SIGNAL: 21, // Scale 1-5
    IGNITION: 239, // 1 for ON, 0 for OFF
    MOVEMENT: 240, // 1 for MOVING, 0 for STOPPED
    SLEEP_MODE: 200,
    ACTIVE_GSM_OPERATOR: 241,
  
    // --- Other Root-Level Parameters ---
    TIMESTAMP: "ts",
    EVENT_ID: "evt",
    TYRE_PRESSURE: "pr",
    VIN: 256, // Vehicle Identification Number
  };