import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { createServer } from "http";
import dotenv from "dotenv";
import { connectMongoDB } from "./config/database";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/authRoutes";
import deviceRoutes from "./routes/deviceRoutes";
import userRoutes from "./routes/userRoutes";
import telemetryRoutes from "./routes/telemetryRoutes";
import realtimeRoutes, {
  initializeRealTimeRoutes,
} from "./routes/realtimeRoutes";
import { RealTimeService } from "./services/RealTimeService";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./config/swagger";
import geofenceRoutes from "./routes/geofenceRoutes";

import path from "path";

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Initialize real-time service
const realTimeService = new RealTimeService(httpServer);

// Initialize real-time routes with service instance
initializeRealTimeRoutes(realTimeService);

const PORT = process.env.PORT || 6162;

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? ["https://your-frontend-domain.com"]
        : ["http://localhost:3000", "http://localhost:3001"],
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

app.use(
  "/",
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

// Serve static files from the "public" directory in your build output (dist/public)
// This lets the browser request other files like CSS or JS if you add them.
app.use(express.static(path.join(__dirname, "public")));

// Explicitly define the handler for the root path AFTER the static middleware.
app.get("/", (req, res) => {
  // IMPORTANT: The path should be relative to where the script is running (dist folder).
  // Don't use "src/public" in production.
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Swagger API docs
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connectedDevices: realTimeService.getConnectedDevices().length,
    connectedUsers: realTimeService.getConnectedUsers().length,
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/users", userRoutes);
app.use("/api/telemetry", telemetryRoutes);
app.use("/api/realtime", realtimeRoutes);
app.use("/api/geofences", geofenceRoutes);

// Real-time status endpoint
app.get("/api/realtime/status", (req, res) => {
  res.json({
    connectedDevices: realTimeService.getConnectedDevices(),
    connectedUsers: realTimeService.getConnectedUsers(),
    totalConnections:
      realTimeService.getConnectedDevices().length +
      realTimeService.getConnectedUsers().length,
  });
});

// Serve static files from the "public" directory

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Cleanup disconnected devices every 5 minutes
setInterval(
  () => {
    realTimeService.cleanupDisconnectedDevices();
  },
  5 * 60 * 1000
);

// Start server
const startServer = async (): Promise<void> => {
  try {
    // Initialize MongoDB
    await connectMongoDB();
    console.log("✅ Connected to MongoDB");

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
