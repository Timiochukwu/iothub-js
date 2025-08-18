import { Telemetry } from "../models/Telemetry";
import { AVL_ID_MAP } from "../utils/avlIdMap";

export interface ServiceAlert {
  id: string;
  type: "DTC" | "Battery" | "Fuel" | "Engine" | "Tire" | "Safety";
  severity: "Critical" | "Warning" | "Info";
  title: string;
  description: string;
  detectedTime: Date;
  imei: string;
  value?: number;
  unit?: string;
  threshold?: number;
}

export interface ServiceAlertsSummary {
  totalFaults: number;
  critical: number;
  warning: number;
  info: number;
}

export class ServiceAlertsService {
  
  async getServiceAlertsSummary(imei: string): Promise<ServiceAlertsSummary> {
    const alerts = await this.getRecentAlerts(imei);
    
    const summary: ServiceAlertsSummary = {
      totalFaults: alerts.length,
      critical: alerts.filter(a => a.severity === "Critical").length,
      warning: alerts.filter(a => a.severity === "Warning").length,
      info: alerts.filter(a => a.severity === "Info").length,
    };

    return summary;
  }

  async getRecentAlerts(imei: string, type?: string, limit: number = 20): Promise<ServiceAlert[]> {
    // Get recent telemetry data - access fields directly, not through state.reported
    const recentData = await Telemetry.find({ imei })
      .sort({ timestamp: -1 })  // Use timestamp instead of state.reported.ts
      .limit(100)
      .select({
        timestamp: 1,
        dtc: 1,
        externalVoltage: 1,
        engineOilTemp: 1,
        fuelLevel: 1,
        engineRpm: 1,
        speed: 1,
        tirePressure: 1,
      });
  
    const alerts: ServiceAlert[] = [];
  
    for (const data of recentData) {
      const timestamp = new Date(data.timestamp || (data as any).lastTs);

      if (isNaN(timestamp.getTime())) {
        console.warn(`Invalid timestamp for record ${data._id}`);
        continue;
      }
      const alertBase = {
        imei,
        detectedTime: timestamp,
      };
  
      // DTC Alerts
      const dtcCount = data.dtc || 0;
      if (dtcCount > 0) {
        alerts.push({
          ...alertBase,
          id: `dtc-${data._id}`,
          type: "DTC",
          severity: dtcCount > 5 ? "Critical" : "Warning",
          title: "System Too Lean",
          description: `${dtcCount} diagnostic trouble codes detected`,
          value: dtcCount,
          unit: "codes",
        });
      }
  
      // Battery Alerts
      const batteryVoltage = (data.externalVoltage || 0) / 1000;
      if (batteryVoltage > 0 && batteryVoltage < 12.0) {
        alerts.push({
          ...alertBase,
          id: `battery-${data._id}`,
          type: "Battery",
          severity: batteryVoltage < 11.5 ? "Critical" : "Warning",
          title: "Low Battery Voltage",
          description: `Battery voltage dropped to ${batteryVoltage.toFixed(1)}V`,
          value: batteryVoltage,
          unit: "V",
          threshold: 12.0,
        });
      }
  
      // Engine Temperature Alerts
      const engineTemp = data.engineOilTemp || 0;
      if (engineTemp > 105) {
        alerts.push({
          ...alertBase,
          id: `engine-temp-${data._id}`,
          type: "Engine",
          severity: engineTemp > 115 ? "Critical" : "Warning",
          title: "Engine temperature too high",
          description: `Engine temperature reached ${engineTemp}°C`,
          value: engineTemp,
          unit: "°C",
          threshold: 105,
        });
      }
  
      // Fuel Alerts
      const fuelLevel = data.fuelLevel || 0;
      if (fuelLevel < 15) {
        alerts.push({
          ...alertBase,
          id: `fuel-${data._id}`,
          type: "Fuel",
          severity: fuelLevel < 10 ? "Critical" : "Warning",
          title: "Fuel Consumption Spike",
          description: `Fuel level is low at ${fuelLevel}%`,
          value: fuelLevel,
          unit: "%",
          threshold: 15,
        });
      }
  
      // Engine RPM Alerts
      const engineRpm = data.engineRpm || 0;
      if (engineRpm > 4000) {
        alerts.push({
          ...alertBase,
          id: `rpm-${data._id}`,
          type: "Engine",
          severity: engineRpm > 5000 ? "Critical" : "Warning",
          title: "Speed vs RPM Anomaly",
          description: `Engine RPM at ${engineRpm} detected`,
          value: engineRpm,
          unit: "rpm",
          threshold: 4000,
        });
      }
  
      // Speed Alerts
      const speed = data.speed || 0;
      if (speed > 120) {
        alerts.push({
          ...alertBase,
          id: `speed-${data._id}`,
          type: "Safety",
          severity: speed > 140 ? "Critical" : "Warning",
          title: "Speed Limit Exceeded",
          description: `Vehicle speed at ${speed} km/h detected`,
          value: speed,
          unit: "km/h",
          threshold: 120,
        });
      }
  
      // Tire Pressure Alerts
      const tirePressure = data.tirePressure || 0;
      if (tirePressure > 0 && tirePressure < 30) {
        alerts.push({
          ...alertBase,
          id: `tire-${data._id}`,
          type: "Tire",
          severity: tirePressure < 25 ? "Critical" : "Warning",
          title: "Low Tire Pressure",
          description: `Tire pressure is low at ${tirePressure} PSI`,
          value: tirePressure,
          unit: "PSI",
          threshold: 30,
        });
      }
    }
  
    // Remove duplicates and sort by time
    const uniqueAlerts = this.removeDuplicateAlerts(alerts);
    
    // Filter by type if specified
    let filteredAlerts = uniqueAlerts;
    if (type && type !== "All") {
      filteredAlerts = uniqueAlerts.filter(alert => 
        alert.type.toLowerCase() === type.toLowerCase()
      );
    }
  
    // Sort by detection time (most recent first) and limit
    return filteredAlerts
      .sort((a, b) => b.detectedTime.getTime() - a.detectedTime.getTime())
      .slice(0, limit);
  }

  private removeDuplicateAlerts(alerts: ServiceAlert[]): ServiceAlert[] {
    const seen = new Set<string>();
    return alerts.filter(alert => {
      const key = `${alert.type}-${alert.title}-${alert.imei}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  async getAlertsByType(imei: string, type: string): Promise<ServiceAlert[]> {
    return this.getRecentAlerts(imei, type);
  }

  async getAlertDetails(imei: string, alertId: string): Promise<ServiceAlert | null> {
    const alerts = await this.getRecentAlerts(imei);
    return alerts.find(alert => alert.id === alertId) || null;
  }

  private normalizeAlertType(type: string): string {
    return type.trim().toLowerCase();
  }

  private ensureDateObject(date: Date | string): Date {
    return typeof date === 'string' ? new Date(date) : date;
  }

  private formatDateToYYYYMMDD(date: Date): string {
    const isoString = date.toISOString();
    const datePart = isoString.split('T')[0];
    
    if (!datePart) {
      throw new Error(`Invalid date format: ${isoString}`);
    }
    
    return datePart;
  }

  async getAlertStatistics(
    imei: string,
    days: number = 7
  ): Promise<{
    totalAlerts: number;
    criticalAlerts: number;
    warningAlerts: number;
    alertsByType: Record<string, number>;
    alertTrend: { date: string; count: number }[];
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setUTCHours(0, 0, 0, 0);
  
    // Get all alerts without limit and include resolved ones
    const alerts = await this.getRecentAlerts(imei, undefined, 1000);
    
    const recentAlerts = alerts.filter(alert => {
      const detectedDate = this.ensureDateObject(alert.detectedTime);
      return detectedDate >= startDate;
    });
  
    // Generate statistics
    const alertsByType: Record<string, number> = {};
    recentAlerts.forEach(alert => {
      const type = this.normalizeAlertType(alert.type);
      alertsByType[type] = (alertsByType[type] || 0) + 1;
    });
  
    // Generate trend data
    const alertTrend = this.generateAlertTrend(recentAlerts, days);
  
    return {
      totalAlerts: recentAlerts.length,
      criticalAlerts: recentAlerts.filter(a => a.severity === "Critical").length,
      warningAlerts: recentAlerts.filter(a => a.severity === "Warning").length,
      alertsByType,
      alertTrend,
    };
  }
  
  private generateAlertTrend(alerts: ServiceAlert[], days: number): { date: string; count: number }[] {
    const trend: { date: string; count: number }[] = [];
    const now = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - (days - 1 - i));
      date.setUTCHours(0, 0, 0, 0);
      
      // Safely get date string
      const dateParts = date.toISOString().split('T');
      if (!dateParts[0]) continue; // Skip if date format is invalid
      
      const dateStr = dateParts[0];
      const count = alerts.filter(alert => {
        const alertDateParts = this.ensureDateObject(alert.detectedTime).toISOString().split('T');
        return alertDateParts[0] === dateStr;
      }).length;
      
      trend.push({ date: dateStr, count });
    }
    
    return trend;
  }

  

  async testAlertGeneration(): Promise<ServiceAlert[]> {
    const mockData = {
      _id: "test-id",
      state: {
        reported: {
          ts: Date.now(),
          [AVL_ID_MAP.EXTERNAL_VOLTAGE]: 11000, // 11V - should trigger low battery
          [AVL_ID_MAP.COOLANT_TEMPERATURE]: 120, // 120°C - should trigger high temp
          [AVL_ID_MAP.FUEL_LEVEL]: 5, // 5% - should trigger low fuel
          [AVL_ID_MAP.SPEED]: 150, // 150 km/h - should trigger speed alert
        }
      }
    };
  
    // Test the alert generation logic with mock data
    const alerts: ServiceAlert[] = [];
    const reported = mockData.state.reported;
    const timestamp = new Date(reported.ts);
    const alertBase = {
      imei: "test-imei",
      detectedTime: timestamp,
    };
  
    // Test battery alert
    const batteryVoltage = (reported[AVL_ID_MAP.EXTERNAL_VOLTAGE] || 0) / 1000;
    if (batteryVoltage > 0 && batteryVoltage < 12.0) {
      alerts.push({
        ...alertBase,
        id: `battery-${mockData._id}`,
        type: "Battery",
        severity: batteryVoltage < 11.5 ? "Critical" : "Warning",
        title: "Low Battery Voltage",
        description: `Battery voltage dropped to ${batteryVoltage.toFixed(1)}V`,
        value: batteryVoltage,
        unit: "V",
        threshold: 12.0,
      });
    }
  
    // Add other alert tests...
    return alerts;
  }
}