import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Global test setup
beforeAll(async () => {
  // Setup test database connections if needed
  console.log('Setting up test environment...');
});

afterAll(async () => {
  // Cleanup test database connections if needed
  console.log('Cleaning up test environment...');
});

// Global test timeout
jest.setTimeout(30000); 