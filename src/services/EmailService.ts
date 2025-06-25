import nodemailer from "nodemailer";
import { CustomError } from "../middleware/errorHandler";
import { User, IUser } from "../models/User";

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_SERVER,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SSL === "true",
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  async sendVerification(to: string, mail_message: string): Promise<void> {
    if (!to) {
      throw new CustomError("Email address is required", 400);
    }

    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || "noreply@iothub.com",
        to: to,
        subject: "Verify your FleetCheck account",
        text: mail_message,
        html: mail_message,
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Verification email sent to ${to}`);
    } catch (error) {
      console.error(`Failed to send email to ${to}:`, error);
      // In this sample environment, just log the failure (like in Java)
      throw new CustomError("Failed to send verification email", 500);
    }
  }

  async sendPasswordReset(
    to: string,
    tempPassword: string,
    userName: string
  ): Promise<void> {
    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || "noreply@iothub.com",
        to: to,
        subject: "User Password Reset",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Password Reset Request</h2>
            <p>Hello ${userName},</p>
            <p>Your temporary password is: <strong>${tempPassword}</strong></p>
            <p>Please use this temporary password to login and change your password.</p>
            <br>
            <p>Best regards,<br>The FleetCheck Team</p>
          </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Password reset email sent to ${to}`);
    } catch (error) {
      console.error(`Failed to send password reset email to ${to}:`, error);
      throw new CustomError("Failed to send password reset email", 500);
    }
  }
}
