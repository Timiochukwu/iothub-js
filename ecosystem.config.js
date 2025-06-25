// ecosystem.config.js
module.exports = {
  apps: [
    // Production App Configuration (no changes needed)
    {
      name: "iothub-js",
      script: "dist/index.js",
      instances: "max",
      exec_mode: "cluster",
      watch: false,
      env_production: {
        NODE_ENV: "production",
      },
    },

    // Development App Configuration (THE CORRECTED VERSION)
    {
      name: "iothub-js-dev",
      script: "src/index.ts", // The script we want to run
      watch: ["src"], // Watch the src directory
      exec_mode: "fork",
      // Tell Node.js to pre-load the ts-node/register module.
      // This is the most reliable way to run TypeScript with PM2.
      node_args: "-r ts-node/register",
      env: {
        NODE_ENV: "development",
        // Add development-specific environment variables here
        // PORT: 3000,
        // MONGO_URI: 'mongodb://localhost:27017/iothub_dev_db'
      },
    },
  ],
};
