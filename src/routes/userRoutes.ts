import { Router } from "express";
import { UserController } from "../controllers/UserController";
import { validateRequest, validateQuery } from "../middleware/validation";
import { userSchemas, querySchemas } from "../utils/validationSchemas";
import { authenticateToken } from "../middleware/auth";

const router = Router();
const userController = new UserController();

// User management routes
router.get("/refreshToken", authenticateToken, userController.refreshToken);
router.get(
  "/search",
  validateQuery(querySchemas.email),
  userController.searchUser
);
// router.post('/create', validateRequest(userSchemas.register), userController.register);
router.put(
  "/update",
  validateRequest(userSchemas.update),
  userController.updateUser
);
router.put(
  "/changePassword",
  validateRequest(userSchemas.changePassword),
  userController.changePassword
);
router.get(
  "/forgotPassword",
  validateQuery(querySchemas.email),
  userController.searchUser
); // Placeholder
router.delete(
  "/delete",
  validateQuery(querySchemas.email),
  userController.deleteUser
);

// Profile/account endpoints
router.get("/me", authenticateToken, userController.me);
router.put("/me", authenticateToken, userController.updateUser);
router.post("/change-password", authenticateToken, userController.changePassword);
// Logout (stateless JWT, so just a placeholder)
router.post("/logout", authenticateToken, (req, res) => {
  // For JWT, logout is handled on frontend by deleting the token
  res.status(200).json({ success: true, message: "Logged out (client should delete token)" });
});

export default router;
