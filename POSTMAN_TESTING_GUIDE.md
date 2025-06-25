# IoT Hub API - Postman Testing Guide

## Setup Instructions

### 1. Import Collection and Environment

1. **Import the Collection:**
   - Open Postman
   - Click "Import" button
   - Select `IoT_Hub_API.postman_collection.json`
   - The collection will be imported with all endpoints

2. **Import the Environment:**
   - Click "Import" button again
   - Select `IoT_Hub_Environment.postman_environment.json`
   - Select the "IoT Hub Environment" from the environment dropdown

### 2. Configure Environment Variables

The environment includes these variables:
- `baseUrl`: `http://localhost:6162` (default)
- `accessToken`: Auto-populated after login
- `refreshToken`: Auto-populated after login
- `userId`: Auto-populated after user operations
- `deviceId`: Auto-populated after device operations
- `testEmail`: `test@example.com`
- `testPassword`: `password123`
- `testImei`: `123456789012345`

## Testing Workflow

### Step 1: Health Check
- **Endpoint:** `GET /health`
- **Purpose:** Verify the server is running
- **Expected Response:** `200 OK` with status message

### Step 2: Authentication Flow

#### 2.1 Register a New User
- **Endpoint:** `POST /api/auth/register`
- **Body:**
```json
{
  "email": "test@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890"
}
```
- **Expected Response:** `201 Created` with user data and tokens
- **Auto-saves:** `accessToken`, `refreshToken`, `userId`

#### 2.2 Login User
- **Endpoint:** `POST /api/auth/login`
- **Body:**
```json
{
  "email": "test@example.com",
  "password": "password123"
}
```
- **Expected Response:** `200 OK` with user data and tokens
- **Auto-saves:** `accessToken`, `refreshToken`, `userId`

#### 2.3 Refresh Token (Optional)
- **Endpoint:** `GET /user/refreshToken`
- **Headers:** `Authorization: Bearer {{accessToken}}`
- **Expected Response:** `200 OK` with new tokens

### Step 3: User Management

#### 3.1 Search User by Email
- **Endpoint:** `GET /user/search?email=test@example.com`
- **Expected Response:** `200 OK` with user data

#### 3.2 Create Additional User
- **Endpoint:** `POST /user/create`
- **Body:**
```json
{
  "email": "newuser@example.com",
  "password": "password123",
  "firstName": "Jane",
  "lastName": "Smith",
  "phone": "+1987654321"
}
```

#### 3.3 Update User
- **Endpoint:** `PUT /user/update`
- **Body:**
```json
{
  "email": "test@example.com",
  "firstName": "John Updated",
  "lastName": "Doe Updated",
  "phone": "+1234567890"
}
```

#### 3.4 Change Password
- **Endpoint:** `PUT /user/changePassword`
- **Body:**
```json
{
  "email": "test@example.com",
  "currentPassword": "password123",
  "newPassword": "newpassword123"
}
```

#### 3.5 Delete User
- **Endpoint:** `DELETE /user/delete?email=test@example.com`
- **Expected Response:** `200 OK` with deletion confirmation

### Step 4: Device Management (Authenticated)

**Note:** These endpoints require authentication. Make sure you have a valid `accessToken`.

#### 4.1 Register Device
- **Endpoint:** `POST /api/devices/register`
- **Headers:** `Authorization: Bearer {{accessToken}}`
- **Body:**
```json
{
  "imei": "123456789012345",
  "name": "My IoT Device",
  "description": "A test IoT device for monitoring"
}
```
- **Expected Response:** `201 Created` with device data
- **Auto-saves:** `deviceId`

#### 4.2 Get User Devices
- **Endpoint:** `GET /api/devices?page=1&limit=10`
- **Headers:** `Authorization: Bearer {{accessToken}}`
- **Expected Response:** `200 OK` with paginated device list

#### 4.3 Switch Active Device
- **Endpoint:** `POST /api/devices/switch`
- **Headers:** `Authorization: Bearer {{accessToken}}`
- **Body:**
```json
{
  "imei": "123456789012345"
}
```

#### 4.4 Get Active Device
- **Endpoint:** `GET /api/devices/active`
- **Headers:** `Authorization: Bearer {{accessToken}}`
- **Expected Response:** `200 OK` with active device data

#### 4.5 Update Device
- **Endpoint:** `PUT /api/devices/{{deviceId}}`
- **Headers:** `Authorization: Bearer {{accessToken}}`
- **Body:**
```json
{
  "name": "Updated Device Name",
  "description": "Updated device description",
  "isActive": true
}
```

#### 4.6 Delete Device
- **Endpoint:** `DELETE /api/devices/{{deviceId}}`
- **Headers:** `Authorization: Bearer {{accessToken}}`
- **Expected Response:** `200 OK` with deletion confirmation

### Step 5: Device Management (By Email)

These endpoints don't require authentication and work with email queries.

#### 5.1 Get Devices by Email
- **Endpoint:** `GET /api/devices/by-email?email=test@example.com&page=1&limit=10`
- **Expected Response:** `200 OK` with paginated device list

#### 5.2 Get Active Device by Email
- **Endpoint:** `GET /api/devices/active-by-email?email=test@example.com`
- **Expected Response:** `200 OK` with active device data

#### 5.3 Get Device by IMEI
- **Endpoint:** `GET /api/devices/imei/123456789012345`
- **Expected Response:** `200 OK` with device data

## Testing Scenarios

### Scenario 1: Complete User Journey
1. Register a new user
2. Login with the user
3. Register a device
4. Get user devices
5. Switch active device
6. Update device
7. Delete device
8. Delete user

### Scenario 2: Error Handling
1. Try to register with existing email (should fail)
2. Try to login with wrong password (should fail)
3. Try to access protected endpoints without token (should fail)
4. Try to register device with invalid IMEI (should fail)

### Scenario 3: Pagination Testing
1. Create multiple devices
2. Test pagination with different page and limit values
3. Verify pagination metadata

## Response Format

All successful responses follow this format:
```json
{
  "success": true,
  "message": "Operation successful",
  "data": {
    // Response data
  }
}
```

Error responses follow this format:
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error information"
}
```

## Environment Variables Auto-Population

The collection includes automatic scripts that:
- Extract and save `accessToken` from login/register responses
- Extract and save `refreshToken` from login/register responses
- Extract and save `userId` from user operations
- Extract and save `deviceId` from device operations

## Troubleshooting

### Common Issues:

1. **Connection Refused:**
   - Ensure the server is running on `http://localhost:6162`
   - Check if MongoDB is running and accessible

2. **Authentication Errors:**
   - Verify the `accessToken` is valid and not expired
   - Re-login to get a fresh token

3. **Validation Errors:**
   - Check request body format
   - Ensure all required fields are provided
   - Verify email format and password strength

4. **MongoDB Errors:**
   - Check MongoDB connection string in `.env` file
   - Ensure MongoDB service is running

### Debug Mode:
- Check the Postman console for detailed logs
- The collection includes logging scripts for debugging

## Performance Testing

For load testing, you can:
1. Use Postman's Runner feature
2. Set up iterations and delays
3. Monitor response times
4. Test concurrent requests

## Security Testing

Test security aspects:
1. JWT token expiration
2. Invalid token handling
3. SQL injection attempts
4. XSS prevention
5. Rate limiting (if implemented) 