# IoT Hub Backend - Node.js TypeScript

A modern, scalable IoT backend system built with Node.js, TypeScript, and Express. This project provides REST APIs for user authentication, device management, and telemetry data handling.

## 🚀 Features

- **Authentication & Authorization**: JWT-based authentication with refresh tokens
- **User Management**: Registration, login, profile updates, password management
- **Device Management**: Register, list, switch active devices, update device info
- **Database Support**: PostgreSQL (users/devices) + MongoDB (telemetry)
- **Type Safety**: Full TypeScript implementation with strict type checking
- **Validation**: Request validation using Joi schemas
- **Error Handling**: Comprehensive error handling with custom error classes
- **Security**: Helmet, CORS, rate limiting, input validation
- **Logging**: Morgan HTTP logging with environment-specific configurations
- **Testing**: Jest testing framework with TypeScript support

## 🏗️ Architecture

```
src/
├── config/          # Database and app configuration
├── controllers/     # Request handlers
├── middleware/      # Custom middleware (auth, validation, error handling)
├── models/          # TypeORM entities
├── routes/          # Express route definitions
├── services/        # Business logic layer
├── types/           # TypeScript type definitions
├── utils/           # Utility functions (JWT, validation schemas)
└── index.ts         # Application entry point
```

## 📋 Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0
- PostgreSQL >= 12
- MongoDB >= 4.4

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd iothub-js
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment setup**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. **Database setup**
   - Create PostgreSQL database named `iothub`
   - Ensure MongoDB connection string is configured

5. **Build the project**
   ```bash
   npm run build
   ```

## 🚀 Running the Application

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

### Testing
```bash
npm test
npm run test:watch
npm run test:coverage
```

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login

### User Management
- `GET /user/refreshToken` - Refresh JWT token
- `GET /user/search` - Search user by email
- `POST /user/create` - Create new user
- `PUT /user/update` - Update user profile
- `PUT /user/changePassword` - Change password
- `DELETE /user/delete` - Delete user

### Device Management
- `POST /api/devices/register` - Register new device
- `GET /api/devices` - Get user's devices
- `POST /api/devices/switch` - Switch active device
- `GET /api/devices/active` - Get active device
- `PUT /api/devices/:deviceId` - Update device
- `DELETE /api/devices/:deviceId` - Delete device

### Device Routes (by email)
- `GET /api/devices/by-email` - Get devices by user email
- `GET /api/devices/active-by-email` - Get active device by email
- `GET /api/devices/imei/:imei` - Get device by IMEI

## 🔧 Configuration

### Environment Variables

```env
# Server Configuration
NODE_ENV=development
PORT=6162
API_VERSION=v1

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=3h
JWT_REFRESH_EXPIRES_IN=7d

# Database Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=iothub
POSTGRES_USER=db_user
POSTGRES_PASSWORD=db_password

MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/iothub
MONGODB_DATABASE=iothub

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 🧪 Testing

The project includes comprehensive testing setup with Jest:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## 📊 Database Schema

### Users Table (PostgreSQL)
- `id` (UUID, Primary Key)
- `email` (VARCHAR, Unique)
- `password` (VARCHAR, Hashed)
- `firstName` (VARCHAR, Optional)
- `lastName` (VARCHAR, Optional)
- `phone` (VARCHAR, Optional)
- `isActive` (BOOLEAN, Default: true)
- `createdAt` (TIMESTAMP)
- `updatedAt` (TIMESTAMP)

### Devices Table (PostgreSQL)
- `id` (UUID, Primary Key)
- `imei` (VARCHAR, Unique)
- `userId` (UUID, Foreign Key)
- `name` (VARCHAR, Optional)
- `description` (TEXT, Optional)
- `isActive` (BOOLEAN, Default: true)
- `createdAt` (TIMESTAMP)
- `updatedAt` (TIMESTAMP)

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt with salt rounds
- **Input Validation**: Joi schema validation
- **CORS Protection**: Configurable CORS policies
- **Helmet Security**: Security headers
- **Rate Limiting**: Request rate limiting
- **SQL Injection Protection**: TypeORM parameterized queries

## 📈 Scalability Features

- **Connection Pooling**: Database connection management
- **Error Handling**: Comprehensive error handling
- **Logging**: Structured logging for monitoring
- **Type Safety**: TypeScript for better code quality
- **Modular Architecture**: Separation of concerns
- **Middleware Pattern**: Reusable middleware components

## 🚀 Deployment

### Docker (Recommended)
```bash
# Build Docker image
docker build -t iothub-backend .

# Run container
docker run -p 6162:6162 --env-file .env iothub-backend
```

### PM2
```bash
npm install -g pm2
pm2 start dist/index.js --name iothub-backend
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

For support and questions, please open an issue in the repository. 