import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { validateRequest } from '../middleware/validation';
import { userSchemas } from '../utils/validationSchemas';

const router = Router();
const userController = new UserController();

// Authentication routes
router.post('/register', validateRequest(userSchemas.register), userController.register);
router.post('/login', validateRequest(userSchemas.login), userController.login);

export default router; 