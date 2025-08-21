import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { createServer } from "http";
import dotenv from "dotenv";
import { connectMongoDB } from "./config/database";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/authRoutes";
import analyticsRoutes from "./routes/analyticsRoutes";
import deviceRoutes from "./routes/deviceRoutes";
import userRoutes from "./routes/userRoutes";
import telemetryRoutes from "./routes/telemetryRoutes";
import realtimeRoutes, {
  initializeRealTimeRoutes,
} from "./routes/realtimeRoutes";
import { RealTimeService } from "./services/RealTimeService";
import { GeofenceService } from "./services/GeofenceService";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./config/swagger";
import geofenceRoutes from "./routes/geofenceRoutes";
import { collisionRoutes } from "./routes/collisionRoutes";
import { notificationRouter } from "./routes/notificationRoutes";
import workingHoursRouter from "./routes/workingHoursRouter";

import coreTelemetryRoutes from "./routes/coreTelemetryRoutes";
import combinedAnalyticsRoutes from "./routes/combinedAnalyticsRoutes";
import fuelAnalyticsRoutes from "./routes/fuelAnalyticsRoutes";
import engineHealthRoutes from "./routes/engineHealthRoutes";
import tirePressureRoutes from "./routes/tirePressureRoutes";
import drivingBehaviorRoutes from "./routes/drivingBehaviorRoutes";
import batteryAnalyticsRoutes from "./routes/batteryAnalyticsRoutes";
import speedAlertRoutes from "./routes/speedAlertRoutes";
import speedAnalyticsRoutes from "./routes/speedAnalyticsRoutes";

import serviceAlertsRoutes from "./routes/serviceAlertsRoutes";

import path from "path";

import { Notification } from "./models/Notification";
import { Telemetry } from "./models/Telemetry";

import cron from "node-cron";

cron.schedule("0 0 * * *", async () => {
  console.log("⏰ Running midnight cleanup job...");

  try {
    // Fetch documents sorted by createdAt (oldest first)
    const docs = await Notification.find().sort({ createdAt: 1 });

    if (docs.length > 10) {
      // Get IDs of the ones to delete (everything after the first 10)
      const idsToDelete = docs.slice(10).map((doc) => doc._id);

      await Notification.deleteMany({ _id: { $in: idsToDelete } });
      console.log(`✅ Cleanup done. Kept 10, deleted ${idsToDelete.length}`);
    } else {
      console.log("✅ Less than or equal to 10 docs, nothing deleted");
    }
  } catch (err) {
    console.error("❌ Cleanup job failed:", err);
  }
});

cron.schedule("0 0 * * *", async () => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 21); // 21 days ago

    const result = await Telemetry.deleteMany({
      createdAt: { $lt: cutoffDate }, // assuming you use createdAt timestamps
    });

    console.log(
      `🧹 Telemetry cleanup: ${result.deletedCount} records older than 21 days removed`
    );
  } catch (err) {
    console.error("❌ Error during telemetry cleanup:", err);
  }
});
// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Initialize real-time service
const realTimeService = new RealTimeService(httpServer);
const geofenceService = new GeofenceService(realTimeService);

(realTimeService as any).setGeofenceService?.(geofenceService);
// Initialize real-time routes with service instance
initializeRealTimeRoutes(realTimeService);

const PORT = process.env.PORT || 6162;

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
<<<<<<< HEAD
        ? [
            "https://your-frontend-domain.com",
            "http://localhost:5177",
            "https://scetruiothub.vercel.app",
            "*",
          ]
=======
        ? ["https://your-frontend-domain.com", "http://localhost:5177", "https://scetruiothub.vercel.app", "*"]
>>>>>>> 9898f18e85fb36a59c0b378c2b67177e2f2e0fbe
        : [
            "http://localhost:3000",
            "http://localhost:5177",
            "http://localhost:3001",
            "https://scetruiothub.vercel.app",
          ],
    credentials: true,
  })
);

// Logging middleware
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const clientRouter = express.Router();

// Apply a relaxed CSP specifically for the client.
clientRouter.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "https://cdn.socket.io"],
        "script-src-elem": [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.socket.io",
        ],
      },
    },
  })
);

// Serve the static files from the build output's 'public' directory.
clientRouter.use(express.static(path.join(__dirname, "public")));

// Explicitly handle the GET request for the root to serve index.html.
clientRouter.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Mount the entire client-serving logic on the root path.
app.use("/", clientRouter);

// --- 3. API Routes (with their OWN strict security policy) ---
// We create another router to group all API-related logic.

const apiRouter = express.Router();

// Apply the strict, default helmet policy ONLY to API routes.
apiRouter.use(helmet());

// Define all your API endpoints on this router.
apiRouter.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
apiRouter.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connectedDevices: realTimeService.getConnectedDevices().length,
    connectedUsers: realTimeService.getConnectedUsers().length,
  });
});
apiRouter.get("/realtime/status", (req, res) => {
  res.json({
    connectedDevices: realTimeService.getConnectedDevices(),
    connectedUsers: realTimeService.getConnectedUsers(),
    totalConnections:
      realTimeService.getConnectedDevices().length +
      realTimeService.getConnectedUsers().length,
  });
});

apiRouter.use("/auth", authRoutes);
apiRouter.use("/devices", deviceRoutes);
apiRouter.use("/users", userRoutes);
apiRouter.use("/telemetry", telemetryRoutes);
apiRouter.use("/analytics", analyticsRoutes);
apiRouter.use("/realtime", realtimeRoutes);
apiRouter.use("/geofences", geofenceRoutes);
apiRouter.use("/collisions", collisionRoutes);
apiRouter.use("/notifications", notificationRouter);
apiRouter.use("/working-hours", workingHoursRouter);
apiRouter.use("/telemetry", coreTelemetryRoutes);
apiRouter.use("/analytics", combinedAnalyticsRoutes);
apiRouter.use("/fuel", fuelAnalyticsRoutes);
apiRouter.use("/engine", engineHealthRoutes);
apiRouter.use("/tire-pressure", tirePressureRoutes);
apiRouter.use("/driving", drivingBehaviorRoutes);
apiRouter.use("/battery", batteryAnalyticsRoutes);
// apiRouter.use("/speed", speedAlertRoutes);
apiRouter.use("/speed", speedAnalyticsRoutes);
apiRouter.use("/service-alerts", serviceAlertsRoutes);

// Mount the entire API logic on the '/api' path.
app.use("/api", apiRouter);

// --- 4. Error Handlers at the VERY END ---
// These will catch any requests that didn't match the client or API routers.
app.use(notFoundHandler);
app.use(errorHandler);

// --- 5. Server Startup Logic ---
setInterval(() => {
  realTimeService.cleanupDisconnectedDevices();
}, 5 * 60 * 1000);

// Start server
const startServer = async (): Promise<void> => {
  try {
    // Initialize MongoDB
    await connectMongoDB();
    console.log(" Connected to MongoDB");

    // Start HTTP server with WebSocket support
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 WebSocket server ready for real-time telemetry`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(
        `📊 Real-time status: http://localhost:${PORT}/api/realtime/status`
      );
      console.log(`📖 Swagger API docs: http://localhost:${PORT}/api/docs`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("🛑 SIGTERM received, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("🛑 SIGINT received, shutting down gracefully...");
  process.exit(0);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

// Start the server
startServer();
