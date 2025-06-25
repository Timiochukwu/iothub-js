import { User, IUser } from '../models/User';
import { JwtUtils } from '../utils/jwt';
import { EmailService } from './EmailService';
import {
  LoginRequest,
  RegisterRequest,
  ChangePasswordRequest,
  ApiResponse
} from '../types';
import { CustomError } from '../middleware/errorHandler';

export class UserService {
  private emailService: EmailService;

  constructor() {
    this.emailService = new EmailService();
  }

  async register(userData: RegisterRequest): Promise<ApiResponse> {
    try {
      // Check if user already exists
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        throw new CustomError('User already exists', 409);
      }

      // Hash password
      const hashedPassword = await JwtUtils.hashPassword(userData.password);

      // Create new user
      const user = await User.create({
        email: userData.email,
        password: hashedPassword,
        isActive: true
      });

      // Send verification email (like in Java)
      await this.emailService.sendVerification(userData.email);

      return {
        success: true,
        message: `Verification email sent to ${userData.email}`,
        data: null
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to register user', 500);
    }
  }

  async login(loginData: LoginRequest): Promise<ApiResponse> {
    try {
      // Find user by email
      const user = await User.findOne({ email: loginData.email });
      if (!user) {
        throw new CustomError('Invalid credentials', 401);
      }

      // Verify password
      const isValidPassword = await JwtUtils.comparePassword(loginData.password, user.password);
      if (!isValidPassword) {
        throw new CustomError('Invalid credentials', 401);
      }

      // Generate tokens
      const userDoc = user as IUser & { _id: any };
      const token = JwtUtils.generateToken({
        userId: userDoc._id.toString(),
        email: user.email
      });
      const refreshToken = JwtUtils.generateRefreshToken({
        userId: userDoc._id.toString(),
        email: user.email
      });

      const userWithoutPassword = user.toObject();
      delete (userWithoutPassword as any).password;

      return {
        success: true,
        message: 'Login successful',
        data: {
          token,
          refreshToken,
          user: userWithoutPassword
        }
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to login', 500);
    }
  }

  async refreshToken(userId: string, email: string): Promise<ApiResponse> {
    try {
      const user = await User.findOne({ _id: userId, email });
      if (!user || !user.isActive) {
        throw new CustomError('Invalid refresh token', 401);
      }
      const userDoc = user as IUser & { _id: any };
      const token = JwtUtils.generateToken({
        userId: userDoc._id.toString(),
        email: user.email
      });
      const refreshToken = JwtUtils.generateRefreshToken({
        userId: userDoc._id.toString(),
        email: user.email
      });
      const userWithoutPassword = user.toObject();
      delete (userWithoutPassword as any).password;
      return {
        success: true,
        message: 'Token refreshed successfully',
        data: {
          token,
          refreshToken,
          user: userWithoutPassword
        }
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to refresh token', 500);
    }
  }

  async searchUser(email: string): Promise<ApiResponse> {
    try {
      const user = await User.findOne({ email }).select('-password');
      if (!user) {
        throw new CustomError('User not found', 404);
      }
      return {
        success: true,
        message: 'User found',
        data: user
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to search user', 500);
    }
  }

  async updateUser(userData: Partial<IUser> & { email: string }): Promise<ApiResponse> {
    try {
      const user = await User.findOne({ email: userData.email });
      if (!user) {
        throw new CustomError('User not found', 404);
      }
      // Update user fields
      if (userData.firstName !== undefined) user.firstName = userData.firstName;
      if (userData.lastName !== undefined) user.lastName = userData.lastName;
      if (userData.phone !== undefined) user.phone = userData.phone;
      await user.save();
      const userWithoutPassword = user.toObject();
      delete (userWithoutPassword as any).password;
      return {
        success: true,
        message: 'User updated successfully',
        data: userWithoutPassword
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to update user', 500);
    }
  }

  async changePassword(changePasswordData: ChangePasswordRequest): Promise<ApiResponse> {
    try {
      const user = await User.findOne({ email: changePasswordData.email });
      if (!user) {
        throw new CustomError('User not found', 404);
      }
      // Verify current password
      const isCurrentPasswordValid = await JwtUtils.comparePassword(
        changePasswordData.currentPassword,
        user.password
      );
      if (!isCurrentPasswordValid) {
        throw new CustomError('Current password is incorrect', 400);
      }
      // Hash new password
      const hashedNewPassword = await JwtUtils.hashPassword(changePasswordData.newPassword);
      // Update password
      user.password = hashedNewPassword;
      await user.save();
      return {
        success: true,
        message: 'Password changed successfully'
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to change password', 500);
    }
  }

  async deleteUser(email: string): Promise<ApiResponse> {
    try {
      const user = await User.findOne({ email });
      if (!user) {
        throw new CustomError('User not found', 404);
      }
      await user.deleteOne();
      return {
        success: true,
        message: 'User deleted successfully'
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Failed to delete user', 500);
    }
  }
} 