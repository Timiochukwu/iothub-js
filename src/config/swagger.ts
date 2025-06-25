import swaggerJSDoc from 'swagger-jsdoc';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'IoT Hub Backend API',
    version: '1.0.0',
    description: 'REST API documentation for the IoT Hub Backend (Node.js, TypeScript)'
  },
  servers: [
    {
      url: 'http://localhost:6162',
      description: 'Development server'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  },
  security: [{ bearerAuth: [] }]
};

const options = {
  swaggerDefinition,
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts',
    './src/models/*.ts',
    './src/types/*.ts'
  ]
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec; 